import { DEFAULT_RESYNC_MODE, ResyncMode } from '@/common/resyncOptions';
import { AllSupportedFormatsWithDots, getFileExtensionFromPath } from '@/common/supportedFormats';
import { drainImportBacklog, geocodePendingLocations } from '@/media/import/importPipeline';
import { deleteThumbnailsOfFiles, regenerateThumbnailOfFile } from '@/media/thumbnails/thumbnail';
import { errorLog } from '@/system/devLogger';
import {
  currentOsPathSep,
  normalizeAllPathSep,
  tauriDirEntriesStat,
  TauriDirEntryStat,
  tauriFileLastModified,
} from '@/system/diskManager';
import { HARDWARE_CONCURRENCY } from '@/system/hardware';
import { useWriteBackStore } from '@/stores/writeBackStore';
import { ProcessReporter } from '@/system/processTracker';
import { epochMsToDate } from '@/utils/date.utils';
import { join } from '@tauri-apps/api/path';
import { exists, readDir } from '@tauri-apps/plugin-fs';
import { asyncFilter, mapWithConcurrency } from '../../../utils/array.utils.ts';
import { executeInDB, selectFirstFromDB } from '../../connection/db.service.ts';
import { kyselyDB } from '../../connection/kysely.ts';
import { AlbumInClient } from '../../models/AlbumDTO.ts';
import { AlbumsService } from './albums.service.ts';
import {
  AlbumFileIndexEntry,
  AssetsService,
  FileReadyToProcess,
  FileTrackingStat,
} from './assets.service.ts';

/** A new file on disk that could not be indexed because its format is unsupported. */
export interface UnsupportedExtensionCount {
  extension: string;
  count: number;
}

/** Summary of what a {@link syncFilesAndDirsOf} run did, used to inform the user. */
export interface SyncResult {
  /** How many album folders had filesystem changes since the last scan. */
  albumsScanned: number;
  /** Newly indexed assets. */
  addedCount: number;
  /** Assets removed because their file disappeared from disk. */
  removedCount: number;
  /** Assets whose on-disk file changed and were re-read. */
  changedCount: number;
  /** Assets whose file was renamed on disk (tracked via file identity). */
  renamedCount: number;
  /** New files skipped because their format is not supported. */
  unsupportedNewCount: number;
  /** Breakdown of the skipped formats, busiest first. */
  unsupportedExtensions: UnsupportedExtensionCount[];
  /** Changed files whose metadata could not be re-read, so their row is stale. */
  unreadableCount: number;
  /** Deferred edits that could not be written back into their file. */
  writeBackFailedCount: number;
}

/** A changed file queued for a metadata re-read. */
interface ChangedFile {
  id: string;
  absolutePath: string;
}

/**
 * Re-syncs every given album with the filesystem: drops albums/assets that no
 * longer exist on disk, registers newly created subfolders, indexes new
 * supported files, follows renames (via the stable file identity) and re-reads
 * files that changed on disk. Only folders whose modification time moved since
 * the last scan are inspected, and full metadata is read only for new/changed
 * files, so repeated syncs stay cheap.
 *
 * `resyncMode` controls how an already-indexed file is judged to have changed;
 * rename detection is always active. Progress is pushed through the optional
 * {@link ProcessReporter}. `presenceOnly` still skips folders whose mtime has
 * not moved (same cheap filter as a normal sync) but never re-reads existing
 * file metadata or flushes pending file writes. Interrupted imports are resumed
 * separately before this runs.
 */
export async function syncFilesAndDirsOf(params: {
  albums: AlbumInClient[];
  resyncMode?: ResyncMode;
  presenceOnly?: boolean;
  reporter?: ProcessReporter;
}): Promise<SyncResult> {
  const { reporter } = params;
  const resyncMode = params.presenceOnly ? ResyncMode.Off : (params.resyncMode ?? DEFAULT_RESYNC_MODE);

  const filesToAdd: FileReadyToProcess[] = [];
  const changedFiles: ChangedFile[] = [];
  const unsupportedExtensions = new Map<string, number>();
  let removedCount = 0;
  let renamedCount = 0;

  reporter?.throwIfStopped();
  reporter?.update({ message: 'Checking for removed folders…', progress: null });

  // Drop albums whose folder no longer exists on disk.
  for (const album of params.albums) {
    reporter?.throwIfStopped();
    if (!(await exists(album.fullPath))) {
      await AlbumsService.delete(album.id);
    }
  }

  reporter?.update({ message: 'Looking for changes…', progress: null });

  const albumsToIndex = await asyncFilter(params.albums, async (album) => {
    if (!(await exists(album.fullPath))) return false;

    const pathLastModified = await tauriFileLastModified(album.fullPath);
    return album.lastModified.getTime() !== pathLastModified.getTime();
  });
  reporter?.throwIfStopped();

  const totalAlbums = albumsToIndex.length;
  let scannedAlbums = 0;

  for (const album of albumsToIndex) {
    reporter?.throwIfStopped();
    scannedAlbums += 1;
    reporter?.update({
      message: `Scanning folders · ${scannedAlbums}/${totalAlbums}`,
      progress: totalAlbums > 0 ? scannedAlbums / totalAlbums : null,
    });

    await _registerNewSubAlbums(album, filesToAdd, unsupportedExtensions);

    // Diff the direct files of this album folder against the DB. Nested files
    // belong to their own album rows, so a single (native) listing is enough.
    const diskEntries = await tauriDirEntriesStat(album.fullPath);
    const diskFiles = diskEntries.filter((entry) => entry.isFile);
    const dbAssets = await AssetsService.getAlbumFileIndex(album.id);

    removedCount += await _diffAlbumFiles({
      album,
      diskFiles,
      dbAssets,
      resyncMode,
      filesToAdd,
      changedFiles,
      unsupportedExtensions,
      onRenamed: () => {
        renamedCount += 1;
      },
    });
  }

  // Re-read metadata AND rebuild thumbnails for files that changed on disk.
  // "Changed" is decided by the user's resync mode (mtime / size+mtime). The
  // metadata reads are batched into as few exiftool spawns as possible; the
  // thumbnail rebuilds stay per-file (ffmpeg) since a changed file may have new
  // pixels.
  let changedCount = 0;
  let unreadableCount = 0;
  if (changedFiles.length > 0) {
    reporter?.throwIfStopped();
    const { reloaded, failures } = await AssetsService.reloadMetadataForAssets(
      changedFiles.map((changed) => ({ id: changed.id, fullPath: changed.absolutePath })),
      (processed, total) =>
        reporter?.update({
          message: `Reading changed files · ${processed}/${total}`,
          progress: total > 0 ? processed / total : null,
        }),
    );
    changedCount = reloaded;
    unreadableCount = failures.size;

    for (const [id, message] of failures) {
      errorLog('sync', 'changed-file-reread-failed', message, { asset: id });
    }

    const toThumbnail = changedFiles.filter((changed) => !failures.has(changed.id));
    for (let index = 0; index < toThumbnail.length; index += 1) {
      reporter?.throwIfStopped();
      const changed = toThumbnail[index];
      reporter?.update({
        message: `Rebuilding thumbnails · ${index + 1}/${toThumbnail.length}`,
        progress: toThumbnail.length > 0 ? (index + 1) / toThumbnail.length : null,
      });

      try {
        await regenerateThumbnailOfFile({ id: changed.id, fullPath: changed.absolutePath });
      } catch (error) {
        errorLog('sync', 'thumbnail-rebuild-failed', error, { asset: changed.id });
      }
    }
  }

  // Index the new files in a single pass (one exiftool run) with progress.
  let addedCount = 0;
  if (filesToAdd.length > 0) {
    reporter?.throwIfStopped();
    addedCount = await AssetsService.insertFilesByPaths(filesToAdd, reporter);
  }

  // Write the edits that were deferred to this sync back into the files. A file
  // that refuses the write keeps its `pendingFileWrite` flag, so the next sync
  // retries it; the count reaches the user through the sync summary.
  let writeBackFailedCount = 0;
  if (!params.presenceOnly) {
    reporter?.throwIfStopped();
    reporter?.update({ message: 'Writing metadata to files…', progress: null });
    const { failures } = await AssetsService.flushPendingFileWrites((processed, total) =>
      reporter?.update({
        message: `Writing metadata to files · ${processed}/${total}`,
        progress: total > 0 ? processed / total : null,
      }),
    );
    writeBackFailedCount = failures.size;
    useWriteBackStore.getState().setFailedCount(writeBackFailedCount);

    for (const [id, message] of failures) {
      errorLog('sync', 'metadata-write-back-failed', message, { asset: id });
    }
  }

  // Persist the new folder mtimes only after everything else succeeded, so an
  // interrupted sync is retried on the next run instead of being skipped.
  reporter?.throwIfStopped();
  reporter?.update({ message: 'Finishing up…', progress: null });

  for (const album of albumsToIndex) {
    reporter?.throwIfStopped();
    const pathLastModified = await tauriFileLastModified(album.fullPath);
    if (album.lastModified.getTime() === pathLastModified.getTime()) continue;

    await executeInDB(
      kyselyDB
        .updateTable('albums')
        .set({ lastModified: pathLastModified.toISOString() })
        .where('id', '=', album.id),
      'albums',
    );
  }

  reporter?.throwIfStopped();
  await drainImportBacklog(reporter);

  return {
    albumsScanned: totalAlbums,
    addedCount,
    removedCount,
    changedCount,
    renamedCount,
    unsupportedNewCount: [...unsupportedExtensions.values()].reduce((sum, count) => sum + count, 0),
    unsupportedExtensions: [...unsupportedExtensions.entries()]
      .map(([extension, count]) => ({ extension, count }))
      .sort((a, b) => b.count - a.count),
    unreadableCount,
    writeBackFailedCount,
  };
}

/** An album asset resolved to the data needed to re-read or re-thumbnail it. */
interface SubtreeAsset {
  id: string;
  filename: string;
  fullPath: string;
}

/**
 * Returns the given album together with every album nested beneath it (same
 * root album, with a folder path under the album's own folder). Powers the
 * album-scoped context-menu actions, so "this album" means the whole subtree.
 */
function _subtreeOf(album: AlbumInClient, allAlbums: AlbumInClient[]): AlbumInClient[] {
  const base = album.fullPath.replace(/[/\\]+$/g, '');
  const prefix = `${base}${currentOsPathSep}`;

  return allAlbums.filter(
    (candidate) =>
      candidate.rootAlbumId === album.rootAlbumId &&
      (candidate.id === album.id || candidate.fullPath === base || candidate.fullPath.startsWith(prefix)),
  );
}

/** Collects every asset (id + absolute path) in an album subtree. */
async function _collectSubtreeAssets(subtree: AlbumInClient[]): Promise<SubtreeAsset[]> {
  const assets: SubtreeAsset[] = [];

  for (const album of subtree) {
    const index = await AssetsService.getAlbumFileIndex(album.id);
    for (const entry of index) {
      assets.push({
        id: entry.id,
        filename: entry.filename,
        fullPath: await join(album.fullPath, entry.filename),
      });
    }
  }

  return assets;
}

/** Number of indexed files affected by an album-wide metadata action. */
export async function getAlbumSubtreeAssetCount(album: AlbumInClient): Promise<number> {
  const allAlbums = await AlbumsService.getAll();
  const subtree = _subtreeOf(album, allAlbums);
  const indexes = await Promise.all(subtree.map((item) => AssetsService.getAlbumFileIndex(item.id)));
  return indexes.reduce((count, index) => count + index.length, 0);
}

/**
 * Runs the regular library sync scoped to a single album and the albums nested
 * under it. Powers the album context-menu "Sync this album".
 */
export async function syncAlbum(params: {
  album: AlbumInClient;
  resyncMode?: ResyncMode;
  reporter?: ProcessReporter;
}): Promise<SyncResult> {
  const allAlbums = await AlbumsService.getAll();

  return syncFilesAndDirsOf({
    albums: _subtreeOf(params.album, allAlbums),
    resyncMode: params.resyncMode,
    reporter: params.reporter,
  });
}

/**
 * Force re-reads metadata from disk for EVERY asset in an album subtree,
 * regardless of whether its file looks changed. Unlike sync, this bypasses the
 * resync-mode change detection — use it to recover after external edits that
 * did not move a file's mtime, or after changing how metadata is interpreted.
 * Returns how many assets were refreshed, plus one warning per file that failed.
 */
export async function reloadMetadataForAlbum(params: {
  album: AlbumInClient;
  reporter?: ProcessReporter;
}): Promise<{ reloaded: number; warnings: string[] }> {
  const { reporter } = params;
  const allAlbums = await AlbumsService.getAll();
  const assets = await _collectSubtreeAssets(_subtreeOf(params.album, allAlbums));

  const { reloaded, failures } = await AssetsService.reloadMetadataForAssets(
    assets,
    (processed, total) =>
      reporter?.update({
        message: `Reloading metadata · ${processed}/${total} files`,
        progress: total > 0 ? processed / total : null,
      }),
    { place: 'defer' },
  );
  await geocodePendingLocations(reporter);

  return { reloaded, warnings: _warningsFor(assets, failures) };
}

/**
 * Writes Photokin's current metadata to every original file in an album
 * subtree. This is an explicit action, so it uses the same force-write path as
 * the selected-file action regardless of the automatic write-back setting.
 */
export async function writeMetadataForAlbum(params: {
  album: AlbumInClient;
  reporter?: ProcessReporter;
}): Promise<{ written: number; warnings: string[] }> {
  const { reporter } = params;
  const allAlbums = await AlbumsService.getAll();
  const assets = await _collectSubtreeAssets(_subtreeOf(params.album, allAlbums));

  const { written, failures } = await AssetsService.writeCurrentMetadataToFiles(
    assets.map((asset) => asset.id),
    (processed, total) =>
      reporter?.update({
        message: `Writing metadata · ${processed}/${total} files`,
        progress: total > 0 ? processed / total : null,
      }),
  );

  return { written, warnings: _warningsFor(assets, failures) };
}

/** Renders a per-asset failure map as user-facing "filename: reason" lines. */
function _warningsFor(assets: SubtreeAsset[], failures: Map<string, string>): string[] {
  const filenameById = new Map(assets.map((asset) => [asset.id, asset.filename]));
  return [...failures].map(([id, message]) => `${filenameById.get(id) ?? id}: ${message}`);
}

/**
 * Rebuilds the cached thumbnails for every asset in an album subtree, discarding
 * any stale versions. Returns how many were rebuilt, plus one warning per asset
 * whose thumbnail could not be regenerated.
 */
export async function rebuildThumbnailsForAlbum(params: {
  album: AlbumInClient;
  reporter?: ProcessReporter;
}): Promise<{ rebuilt: number; warnings: string[] }> {
  const { reporter } = params;
  const allAlbums = await AlbumsService.getAll();
  const assets = await _collectSubtreeAssets(_subtreeOf(params.album, allAlbums));

  // Each asset already rebuilds its two sizes in parallel, so keep the image-level
  // fan-out near half the core count to avoid oversubscribing CPU/memory on very
  // large originals (a 64 MP JPEG is ~192 MB decoded).
  const concurrency = Math.max(2, Math.floor(HARDWARE_CONCURRENCY / 2));
  const failures = new Map<string, string>();
  let processed = 0;
  let rebuilt = 0;

  await mapWithConcurrency(assets, concurrency, async (asset) => {
    try {
      await regenerateThumbnailOfFile(asset);
      rebuilt += 1;
    } catch (error) {
      failures.set(asset.id, String(error));
    } finally {
      processed += 1;
      reporter?.update({
        message: `Rebuilding thumbnails · ${processed}/${assets.length}`,
        progress: assets.length > 0 ? processed / assets.length : null,
      });
    }
  });

  return { rebuilt, warnings: _warningsFor(assets, failures) };
}

/**
 * Diffs the on-disk files of one album against the DB, handling renames,
 * changes, additions and removals. Returns how many assets were removed.
 */
async function _diffAlbumFiles(args: {
  album: AlbumInClient;
  diskFiles: TauriDirEntryStat[];
  dbAssets: AlbumFileIndexEntry[];
  resyncMode: ResyncMode;
  filesToAdd: FileReadyToProcess[];
  changedFiles: ChangedFile[];
  unsupportedExtensions: Map<string, number>;
  onRenamed: () => void;
}): Promise<number> {
  const { album, diskFiles, dbAssets, resyncMode, filesToAdd, changedFiles, unsupportedExtensions } = args;

  const diskByName = new Map(diskFiles.map((file) => [file.name, file]));
  const diskInodes = new Set(
    diskFiles.map((file) => _validInode(file.inode)).filter((inode): inode is string => inode != null),
  );

  const dbByName = new Map(dbAssets.map((asset) => [asset.filename, asset]));
  const dbByInode = new Map<string, AlbumFileIndexEntry>();
  for (const asset of dbAssets) {
    const inode = _validInode(asset.inode);
    if (inode) dbByInode.set(inode, asset);
  }

  const renamedDbIds = new Set<string>();

  for (const file of diskFiles) {
    const existing = dbByName.get(file.name);

    if (existing) {
      // File still present under the same name: backfill tracking info on
      // legacy assets, otherwise re-read it when it changed.
      if (_needsTrackingBackfill(existing, file)) {
        await AssetsService.updateFileTracking(existing.id, _toTrackingStat(file));
      } else if (_hasChanged(existing, file, resyncMode)) {
        changedFiles.push({ id: existing.id, absolutePath: await join(album.fullPath, file.name) });
      }
      continue;
    }

    // Name not in DB: a tracked file with the same identity whose old name is
    // gone is a rename, not a new file.
    const inode = _validInode(file.inode);
    const renameSource = inode ? dbByInode.get(inode) : undefined;

    if (renameSource && !diskByName.has(renameSource.filename) && !renamedDbIds.has(renameSource.id)) {
      const tracking = _toTrackingStat(file);
      await AssetsService.updateFileTracking(renameSource.id, {
        filename: file.name,
        fileMtime: tracking.fileMtime,
        inode: tracking.inode,
      });
      renamedDbIds.add(renameSource.id);
      args.onRenamed();
      continue;
    }

    // Genuinely new file.
    if (!_isSupported(file.name)) {
      _countUnsupported(unsupportedExtensions, file.name);
      continue;
    }

    filesToAdd.push({
      absolutePath: await join(album.fullPath, file.name),
      filename: file.name,
      albumId: album.id,
      stat: _toTrackingStat(file),
    });
  }

  // Removals: DB rows whose file is gone, that were not renamed, and whose
  // identity is not present elsewhere on disk.
  const idsToDelete = dbAssets
    .filter((asset) => !diskByName.has(asset.filename))
    .filter((asset) => !renamedDbIds.has(asset.id))
    .filter((asset) => {
      const inode = _validInode(asset.inode);
      return !(inode && diskInodes.has(inode));
    })
    .map((asset) => asset.id);

  if (idsToDelete.length > 0) {
    await executeInDB(kyselyDB.deleteFrom('assets').where('id', 'in', idsToDelete), ['assets', 'fileTags']);
    await deleteThumbnailsOfFiles(idsToDelete);
  }

  return idsToDelete.length;
}

/** Finds new subdirectories under an album, registers them and queues their files. */
async function _registerNewSubAlbums(
  album: AlbumInClient,
  filesToAdd: FileReadyToProcess[],
  unsupportedExtensions: Map<string, number>,
): Promise<void> {
  const filesAndFolders = await _walkDir(album.fullPath);

  for (const childPath of filesAndFolders) {
    if (!childPath.isDirectory) {
      continue;
    }

    const relativePath = _relativePathFrom(album.rootPath, childPath.path);

    const albumInDB = await selectFirstFromDB(
      kyselyDB
        .selectFrom('albums')
        .select('id')
        .where('relativePath', '=', relativePath)
        .where('rootAlbumId', '=', album.rootAlbumId),
    );

    if (albumInDB) {
      continue;
    }

    const albumToAdd = AlbumInClient.fromDB(
      {
        rootAlbumId: album.rootAlbumId,
        lastModified: (await tauriFileLastModified(childPath.path)).toISOString(),
        relativePath,
      },
      album.rootPath,
    );

    await AlbumsService.insertInDB(albumToAdd.toDB());

    const collected = await _collectAlbumFiles(albumToAdd);
    filesToAdd.push(...collected.files);
    _mergeCounts(unsupportedExtensions, collected.unsupported);
  }
}

/** Reads a single album folder and splits its files into supported/unsupported. */
async function _collectAlbumFiles(album: AlbumInClient): Promise<{
  files: FileReadyToProcess[];
  unsupported: Map<string, number>;
}> {
  const files: FileReadyToProcess[] = [];
  const unsupported = new Map<string, number>();

  const entries = await tauriDirEntriesStat(album.fullPath);

  for (const entry of entries) {
    if (!entry.isFile) {
      continue;
    }

    if (!_isSupported(entry.name)) {
      _countUnsupported(unsupported, entry.name);
      continue;
    }

    files.push({
      absolutePath: await join(album.fullPath, entry.name),
      filename: entry.name,
      albumId: album.id,
      stat: _toTrackingStat(entry),
    });
  }

  return { files, unsupported };
}

function _toTrackingStat(entry: TauriDirEntryStat): FileTrackingStat {
  return {
    filesize: entry.size,
    // Fall back to the epoch when a folder listing could not report an mtime,
    // and to '' for an unknown file identity (the DB columns are NOT NULL).
    fileMtime: epochMsToDate(entry.mtime) ?? new Date(0),
    fileCreatedAt: epochMsToDate(entry.ctime),
    inode: entry.inode ?? '',
  };
}

/** Missing mtime, or a missing identity that the listing can actually supply. */
function _needsTrackingBackfill(db: AlbumFileIndexEntry, disk: TauriDirEntryStat): boolean {
  if (!db.fileMtime) return true;
  return !_validInode(db.inode) && _validInode(disk.inode) != null;
}

/** Whether an already-indexed file should be re-read, per the resync mode. */
function _hasChanged(db: AlbumFileIndexEntry, disk: TauriDirEntryStat, mode: ResyncMode): boolean {
  if (mode === ResyncMode.Off) {
    return false;
  }

  const diskMtime = disk.mtime != null ? new Date(disk.mtime).toISOString() : null;
  const mtimeChanged = db.fileMtime != null && diskMtime != null && db.fileMtime !== diskMtime;

  if (mode === ResyncMode.Mtime) {
    return mtimeChanged;
  }

  // ResyncMode.SizeMtime
  return mtimeChanged || db.filesize !== disk.size;
}

/** Normalizes a file identity, treating empty/zero values as "unknown". */
function _validInode(inode: string | null | undefined): string | null {
  return inode && inode !== '0' ? inode : null;
}

function _isSupported(filename: string): boolean {
  return AllSupportedFormatsWithDots.includes(getFileExtensionFromPath(filename));
}

function _countUnsupported(target: Map<string, number>, filename: string): void {
  const key = getFileExtensionFromPath(filename) || '(no extension)';
  target.set(key, (target.get(key) ?? 0) + 1);
}

function _mergeCounts(target: Map<string, number>, source: Map<string, number>): void {
  for (const [key, count] of source) {
    target.set(key, (target.get(key) ?? 0) + count);
  }
}

/**
 * Computes the album `relativePath` (root-relative, `/`-separated) for an
 * absolute path, matching how relative paths are stored in the DB.
 */
function _relativePathFrom(rootPath: string, absolutePath: string): string {
  const cleanRoot = rootPath.replace(/[/\\]+$/g, '');
  const relative = absolutePath.startsWith(cleanRoot) ? absolutePath.slice(cleanRoot.length) : absolutePath;

  return normalizeAllPathSep(relative.replace(/^[/\\]+/g, ''));
}

async function _walkDir(dirPath: string): Promise<{ path: string; name: string; isDirectory: boolean }[]> {
  const entries = await readDir(dirPath);
  const result: { path: string; name: string; isDirectory: boolean }[] = [];

  for (const entry of entries) {
    const entryPath = await join(dirPath, entry.name);
    result.push({ path: entryPath, name: entry.name, isDirectory: entry.isDirectory });

    if (entry.isDirectory) {
      result.push(...(await _walkDir(entryPath)));
    }
  }

  return result;
}
