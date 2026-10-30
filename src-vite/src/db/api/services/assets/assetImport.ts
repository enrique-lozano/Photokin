import { LocationSource } from '@/db/models/AssetLocation';
import {
  AllSupportedFormatsWithDots,
  getFileExtensionFromPath,
  isSupportedVideoPath,
} from '@/common/supportedFormats';
import {
  executeInDB,
  safelyExecuteBatchInsert,
  selectFirstFromDB,
  selectFromDB,
} from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { MetadataStage } from '@/db/models/AssetDTO';
import { generateID } from '@/db/models/dbEntityWithID';
import { SqliteDbStructure } from '@/db/models/SqliteDbStructure';
import { AreaBox } from '@/db/models/TagRegionInfoDTO';
import { IMPORT_BATCH_SIZE, isProgressTick, overallProgress } from '@/media/import/importProgress';
import { parseCaptureDateFromFilename } from '@/media/metadata/dates/filenameDate';
import type { ExiftoolRawMetadata, ParsedExiftoolTags } from '@/media/metadata/exiftool/exiftool-fields';
import {
  getParsedRegions,
  getParsedTagSet,
  hasEmbeddedCaptureDate,
  mapParsedExiftoolToAssetMetadata,
} from '@/media/metadata/exiftool/read/exiftool-pipeline';
import { readFromExiftool, type ExiftoolReadOptions } from '@/media/metadata/exiftool/read/exiftool-read';
import { parseRawExiftoolTags } from '@/media/metadata/exiftool/read/exiftool-reader';
import { AssetOrientation, orientedDimensions } from '@/media/metadata/fields/orientation';
import { useAppStore } from '@/stores/appState';
import { warningLog } from '@/system/devLogger';
import { DiscoveredImportFile, joinPathSync } from '@/system/diskManager';
import { ProcessReporter } from '@/system/processTracker';
import { chunked } from '@/utils/array.utils';
import { earliestDate, epochMsToDate } from '@/utils/date.utils';
import { join } from '@tauri-apps/api/path';
import { Insertable } from 'kysely';
import { TagsService } from '../tags.service';
import { locationColumnsByAsset, regionRows, statFile, updateAssetRow } from './assetRows';
import { FileReadyToProcess, FileTrackingStat, PendingMetadataAsset } from './assetTypes';

/**
 * Reads the metadata of the given files and inserts the supported ones as
 * assets. Only the exact files given are touched, so the library sync never
 * re-reads what is already indexed. Large lists are processed in bounded batches
 * so each commit can refresh the UI before the next ExifTool run.
 */
export async function insertFilesByPaths(
  files: FileReadyToProcess[],
  reporter?: ProcessReporter,
  options?: Pick<ExiftoolReadOptions, 'includeGeolocation'>,
): Promise<number> {
  if (files.length === 0) {
    return 0;
  }

  let inserted = 0;
  let offset = 0;
  const total = files.length;

  for (const batch of chunked(files, IMPORT_BATCH_SIZE)) {
    // Map the normalized absolute path of each file to its album (and any
    // pre-read stat) so we can re-attach the exiftool results without
    // re-scanning directories or re-statting files.
    const albumIdByPath = new Map<string, string>();
    const statByPath = new Map<string, FileTrackingStat>();
    for (const file of batch) {
      const normalized = await join(file.absolutePath);
      albumIdByPath.set(normalized, file.albumId);
      if (file.stat) {
        statByPath.set(normalized, file.stat);
      }
    }

    const parsedFiles = await _readMetadata(
      batch.map((file) => file.absolutePath),
      reporter,
      { completed: offset, total },
      options,
    );

    inserted += await _persistParsedFiles(parsedFiles, {
      resolveAlbumId: async (parsed) => {
        if (!parsed.SourceFile) return undefined;
        return albumIdByPath.get(await join(parsed.SourceFile));
      },
      statByPath,
    });

    offset += batch.length;
    const { done, progress } = overallProgress(offset, 0, total);
    reporter?.update({ message: `Saving to library · ${done}/${total} files`, progress });
  }

  return inserted;
}

/** Persist cheap native discovery results so the gallery can render before ExifTool finishes. */
export async function insertDiscoveredFiles(albumId: string, files: DiscoveredImportFile[]): Promise<number> {
  if (files.length === 0) return 0;

  const existing = await selectFromDB(
    kyselyDB
      .selectFrom('assets')
      .select('filename')
      .where('albumId', '=', albumId)
      .where(
        'filename',
        'in',
        files.map((file) => file.filename),
      ),
  );
  const existingNames = new Set(existing.map((row) => row.filename));
  const now = new Date().toISOString();
  const rows: Insertable<SqliteDbStructure['assets']>[] = [];

  for (const file of files) {
    if (existingNames.has(file.filename)) continue;

    const created = epochMsToDate(file.ctime);
    const modified = epochMsToDate(file.mtime) ?? created ?? new Date();
    const dateFromFilename = parseCaptureDateFromFilename(file.filename);

    const filenameDate = dateFromFilename && dateFromFilename <= new Date() ? dateFromFilename : null;

    const captureDate = filenameDate ?? created ?? modified;

    const orientation =
      file.orientation >= AssetOrientation.Horizontal && file.orientation <= AssetOrientation.Rotate270CW
        ? (file.orientation as AssetOrientation)
        : AssetOrientation.Horizontal;

    const { width, height } = orientedDimensions(file.width ?? 1, file.height ?? 1, orientation);

    rows.push({
      id: generateID(),
      albumId,
      filename: file.filename,
      filesize: file.size,
      duration: 0,
      width,
      height,
      orientation,
      date: captureDate.toISOString(),
      make: null,
      model: null,
      lens: null,
      software: null,
      title: null,
      description: null,
      iso: null,
      exposure: null,
      exposureProgram: null,
      whiteBalance: null,
      flash: null,
      focalLength: null,
      aperture: null,
      shutterSpeed: null,
      meteringMode: null,
      rating: null,
      latitude: null,
      longitude: null,
      altitude: null,
      locationSublocation: null,
      locationCity: null,
      locationState: null,
      locationCountry: null,
      locationCountryCode: null,
      locationSource: null,
      creator: null,
      copyright: null,
      credit: null,
      source: null,
      colorSpace: null,
      bitDepth: null,
      lastScanned: null,
      dateAdded: now,
      fileMtime: modified.toISOString(),
      inode: file.inode ?? '',
      trashedAt: null,
      metadataStage: MetadataStage.Discovered,
      pendingFileWrite: 0,
    });
  }

  await safelyExecuteBatchInsert('assets', rows);
  return rows.length;
}

export async function getPendingMetadataAssets(
  stage: MetadataStage.Discovered | MetadataStage.LocationPending,
  limit = 32,
  afterId?: string,
): Promise<PendingMetadataAsset[]> {
  const rows = await selectFromDB(
    kyselyDB
      .selectFrom('assets')
      .innerJoin('albums', 'albums.id', 'assets.albumId')
      .innerJoin('rootAlbums', 'rootAlbums.id', 'albums.rootAlbumId')
      .select([
        'assets.id',
        'assets.filename',
        'assets.latitude',
        'assets.longitude',
        'albums.relativePath',
        'rootAlbums.path as rootPath',
      ])
      .where('assets.metadataStage', '=', stage)
      .where('assets.trashedAt', 'is', null)
      .$if(Boolean(afterId), (qb) => qb.where('assets.id', '>', afterId!))
      .orderBy('assets.id')
      .limit(limit),
  );

  return rows.map((row) => ({
    id: row.id,
    fullPath: joinPathSync(row.rootPath, row.relativePath, row.filename),
    latitude: row.latitude,
    longitude: row.longitude,
  }));
}

export async function getPendingMetadataCount(
  stage: MetadataStage.Discovered | MetadataStage.LocationPending,
): Promise<number> {
  const row = await selectFirstFromDB(
    kyselyDB
      .selectFrom('assets')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .where('metadataStage', '=', stage)
      .where('trashedAt', 'is', null),
  );
  return Number(row?.count ?? 0);
}

/**
 * Stores the reverse-geocoded places and closes the last metadata stage. A place
 * named in the meantime (by the user or a reload) wins over the geocoded one.
 */
export async function applyDeferredLocations(
  updates: {
    id: string;
    place: {
      city: string | null;
      state: string | null;
      country: string | null;
      countryCode: string | null;
    } | null;
  }[],
): Promise<void> {
  if (updates.length === 0) return;

  const current = await locationColumnsByAsset(updates.map(({ id }) => id));

  for (const { id, place } of updates) {
    const named = current.get(id);
    const alreadyNamed =
      named?.locationSublocation || named?.locationCity || named?.locationState || named?.locationCountry;

    await executeInDB(
      kyselyDB
        .updateTable('assets')
        .set(
          place && !alreadyNamed
            ? {
                locationCity: place.city,
                locationState: place.state,
                locationCountry: place.country,
                locationCountryCode: place.countryCode,
                locationSource: LocationSource.Auto,
                metadataStage: MetadataStage.Complete,
              }
            : { metadataStage: MetadataStage.Complete },
        )
        .where('id', '=', id),
      'assets',
    );
  }

  useAppStore.getState().markAssetChanged(updates.map(({ id }) => id));
}

/**
 * Updates only an asset's filesystem-tracking fields (and optionally its
 * filename, for renames) without touching its metadata. Used by the library sync
 * to apply renames and to backfill tracking info on legacy assets.
 */
export async function updateFileTracking(
  id: string,
  params: { filename?: string; fileMtime: Date; inode: string },
): Promise<void> {
  await updateAssetRow(id, {
    ...(params.filename !== undefined ? { filename: params.filename } : {}),
    fileMtime: params.fileMtime.toISOString(),
    inode: params.inode,
  });
}

/**
 * Reassigns an asset to another album (folder) after its file has already been
 * moved on disk. Keeps the same asset id so tags, faces and cached thumbnails
 * survive; refreshes the tracking columns (mtime/inode change on cross-volume
 * copies) so a later sync doesn't mistake the move for a delete + re-add. The
 * caller is responsible for the on-disk move and for avoiding
 * `UNIQUE(albumId, filename)` collisions.
 */
export async function moveAssetToAlbum(
  id: string,
  params: { albumId: string; filename: string; filesize: number; fileMtime: Date; inode: string },
): Promise<void> {
  await updateAssetRow(id, {
    albumId: params.albumId,
    filename: params.filename,
    filesize: params.filesize,
    fileMtime: params.fileMtime.toISOString(),
    inode: params.inode,
    lastScanned: new Date().toISOString(),
  });
}

/**
 * Runs exiftool on the given paths. When `progress` is provided, ExifTool's
 * per-batch counter is offset so the UI sees one continuous library-wide count.
 */
async function _readMetadata(
  paths: string[],
  reporter?: ProcessReporter,
  progress?: { completed: number; total: number },
  options?: Pick<ExiftoolReadOptions, 'includeGeolocation'>,
) {
  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? paths.length;

  reporter?.update({
    message: total > 0 ? `Reading metadata · ${completed}/${total} files` : 'Reading metadata…',
    progress: total > 0 ? completed / total : null,
  });

  const exiftoolRes = await readFromExiftool(
    paths,
    (current: number, batchTotal: number) => {
      if (!isProgressTick(current, batchTotal)) return;

      const { done, progress: fraction } = overallProgress(completed, current, total);
      reporter?.update({ message: `Reading metadata · ${done}/${total} files`, progress: fraction });
    },
    options,
  );

  return Array.isArray(exiftoolRes) ? exiftoolRes : [exiftoolRes];
}

/** An asset row plus the associations that still need their ids resolved. */
interface PreparedAsset {
  assetId: string;
  row: Insertable<SqliteDbStructure['assets']>;
  tagPaths: string[];
  regions: { tagName: string; area: AreaBox }[];
}

/**
 * Persists already-parsed exiftool results as assets (plus their keyword tags and
 * face regions). `resolveAlbumId` maps each parsed file to the album it belongs
 * to. Returns the number of inserted assets.
 */
async function _persistParsedFiles(
  parsedFiles: ExiftoolRawMetadata[],
  options: {
    resolveAlbumId: (parsed: ParsedExiftoolTags) => Promise<string | undefined> | string | undefined;
    /** Pre-read disk stats keyed by normalized absolute path, to skip re-statting. */
    statByPath?: Map<string, FileTrackingStat>;
  },
): Promise<number> {
  const { resolveAlbumId, statByPath } = options;

  // Parse every file and build the rows in memory (no DB writes). Tag full-paths
  // and face regions are collected so they can be resolved and inserted in bulk
  // afterwards, instead of issuing several DB round-trips per file.
  const prepared: PreparedAsset[] = [];
  const allTagPaths = new Set<string>();
  const now = new Date().toISOString();

  for (const exiftoolParsedImg of parsedFiles) {
    const parsedMetadata = parseRawExiftoolTags(exiftoolParsedImg);

    // `SourceFile` (absolute path) is preferred for the extension lookup, but we
    // fall back to `FileName` since either is enough to know whether the asset's
    // container is supported.
    const sourceFilePath = parsedMetadata.SourceFile ?? parsedMetadata.FileName ?? '';
    if (!AllSupportedFormatsWithDots.includes(getFileExtensionFromPath(sourceFilePath))) {
      continue;
    }

    const fileName = parsedMetadata.FileName;
    const sourceFile = parsedMetadata.SourceFile;

    if (!fileName || !sourceFile || !parsedMetadata.Directory) {
      throw new Error(`Incomplete exiftool result for "${sourceFilePath}"`);
    }

    const assetMetadata = mapParsedExiftoolToAssetMetadata(parsedMetadata);

    // Reuse the caller-provided stat when available, otherwise stat the file.
    const tracking = statByPath?.get(await join(sourceFile)) ?? (await statFile(sourceFile));

    // Files with no embedded date fall back to their earliest filesystem date,
    // reusing the stat above rather than statting again.
    if (!hasEmbeddedCaptureDate(parsedMetadata)) {
      assetMetadata.date = earliestDate([tracking.fileCreatedAt, tracking.fileMtime]) ?? assetMetadata.date;
    }

    const albumId = await resolveAlbumId(parsedMetadata);
    if (!albumId) {
      throw new Error(`No album found for the file '${sourceFile}'`);
    }

    const assetId = generateID();
    const location = assetMetadata.location;
    const needsGeocode =
      location?.latitude != null &&
      location.longitude != null &&
      !location.sublocation &&
      !location.city &&
      !location.state &&
      !location.country;

    if ((isSupportedVideoPath(sourceFile) || isSupportedVideoPath(fileName)) && assetMetadata.duration <= 0) {
      warningLog('assets', 'video-duration-zero', { file: sourceFile });
    }

    const row: Insertable<SqliteDbStructure['assets']> = {
      ...assetMetadata.toDB(),
      id: assetId,
      filename: fileName,
      filesize: tracking.filesize,
      fileMtime: tracking.fileMtime.toISOString(),
      inode: tracking.inode,
      albumId,
      // Set once on insert and never updated, so the "Recently added" view
      // reflects when the asset entered the library, not when it was edited.
      dateAdded: now,
      lastScanned: now,
      metadataStage: needsGeocode ? MetadataStage.LocationPending : MetadataStage.Complete,
      pendingFileWrite: 0,
    };

    const tagPaths = [...getParsedTagSet(parsedMetadata)];
    for (const path of tagPaths) {
      allTagPaths.add(path);
    }

    const isVideo = isSupportedVideoPath(sourceFile) || isSupportedVideoPath(fileName);
    prepared.push({
      assetId,
      row,
      tagPaths,
      regions: isVideo ? [] : getParsedRegions(parsedMetadata),
    });
  }

  if (prepared.length === 0) {
    return 0;
  }

  // Resolve every tag (and its ancestors) up front with a single read + batched
  // insert, then persist assets, file-tags and regions as a few batched multi-row
  // inserts rather than thousands of single-row ones.
  const { idByFullPath, idByName } = await TagsService.ensureTagFullPaths(allTagPaths);

  const assetRows = prepared.map((item) => item.row);

  const fileTagRows: Insertable<SqliteDbStructure['fileTags']>[] = [];
  for (const item of prepared) {
    const seenTagIds = new Set<string>();
    for (const path of item.tagPaths) {
      const tagId = idByFullPath.get(path);
      if (tagId && !seenTagIds.has(tagId)) {
        seenTagIds.add(tagId);
        fileTagRows.push({ assetId: item.assetId, tagId });
      }
    }
  }

  await safelyExecuteBatchInsert('assets', assetRows);
  await safelyExecuteBatchInsert('fileTags', fileTagRows);
  await safelyExecuteBatchInsert(
    'tagRegionInfo',
    prepared.flatMap((item) => regionRows(item.assetId, item.regions, idByName)),
  );

  return assetRows.length;
}
