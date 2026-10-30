import { beginImportWork, endImportWork } from '@/media/import/importActivity';
import { drainImportBacklog } from '@/media/import/importPipeline';
import { deleteThumbnailsOfFiles } from '@/media/thumbnails/thumbnail';
import { createTraceId, debugLog, errorLog, timingsSince } from '@/system/devLogger';
import {
  DiscoveredImportFile,
  discoverImportFiles,
  normalizedPathSep,
  tauriFileStat,
  tauriScanImportPreview,
} from '@/system/diskManager';
import { ProcessReporter } from '@/system/processTracker';
import { epochMsToDate } from '@/utils/date.utils';
import { open } from '@tauri-apps/plugin-dialog';
import { exists } from '@tauri-apps/plugin-fs';
import { AllSupportedFormatsWithDots } from '../../../common/supportedFormats.ts';
import { executeInDB, selectFromDB } from '../../connection/db.service.ts';
import { kyselyDB } from '../../connection/kysely.ts';
import { AlbumInClient } from '../../models/AlbumDTO.ts';
import { generateID } from '../../models/dbEntityWithID.ts';
import { RootAlbumDTO } from '../../models/RootAlbumDTO.ts';
import { AlbumsService } from './albums.service.ts';
import { AppDataService } from './appData.service.ts';
import { AssetsService } from './assets.service.ts';
import { findRootPathOverlap } from './rootPathOverlap.ts';

export interface RootAlbumImportPreview {
  selectedDirectories: string[];
  totalFiles: number;
  supportedFilesCount: number;
  supportedFilesSize: number;
  unsupportedFilesCount: number;
  unsupportedFilesSize: number;
  unsupportedExtensions: { extension: string; count: number }[];
  directoriesWithSupportedFiles: string[];
  directoriesWithoutSupportedFiles: string[];
}

class _RootAlbumsService {
  constructor() {}

  private readonly getQuery = kyselyDB.selectFrom('rootAlbums').selectAll();

  async getAll(): Promise<RootAlbumDTO[]> {
    const result = await selectFromDB(this.getQuery);

    return result;
  }

  async selectDirectories() {
    const directoriesSelected = await open({
      directory: true,
      multiple: true,
    });

    if (!directoriesSelected) {
      return [];
    }

    return Array.isArray(directoriesSelected) ? directoriesSelected : [directoriesSelected];
  }

  async previewDirectories(directoriesToImport: string[]): Promise<RootAlbumImportPreview> {
    await this._assertNoOverlappingRoots(directoriesToImport);
    const scan = await tauriScanImportPreview(directoriesToImport, AllSupportedFormatsWithDots);

    return {
      selectedDirectories: directoriesToImport,
      totalFiles: scan.totalFiles,
      supportedFilesCount: scan.supportedFilesCount,
      supportedFilesSize: scan.supportedFilesSize,
      unsupportedFilesCount: scan.unsupportedFilesCount,
      unsupportedFilesSize: scan.unsupportedFilesSize,
      unsupportedExtensions: scan.unsupportedExtensions,
      directoriesWithSupportedFiles: scan.directoriesWithSupportedFiles,
      directoriesWithoutSupportedFiles: scan.directoriesWithoutSupportedFiles,
    };
  }

  async addDirectories(directoriesToImport: string[], reporter?: ProcessReporter, expectedTotal?: number) {
    const traceId = createTraceId('import');
    const startedAt = performance.now();
    let discoveredTotal = 0;
    debugLog(traceId, 'started', { roots: directoriesToImport.length, expectedFiles: expectedTotal });
    try {
      await this._assertNoOverlappingRoots(directoriesToImport);

      // Read before any root row is inserted: importing into an empty library
      // leaves every album freshly scanned, so it counts as a library-wide
      // sync.
      const libraryWasEmpty = (await this.getAll()).length === 0;

      beginImportWork();
      try {
        for (let index = 0; index < directoriesToImport.length; index += 1) {
          reporter?.throwIfStopped();
          const folderName =
            directoriesToImport[index].split(/[/\\]/).filter(Boolean).at(-1) ?? directoriesToImport[index];
          reporter?.update({
            title:
              directoriesToImport.length > 1
                ? `Importing folder ${index + 1} of ${directoriesToImport.length} · ${folderName}`
                : `Importing · ${folderName}`,
          });

          discoveredTotal += await this.insertPathAndTheirFiles(
            directoriesToImport[index],
            reporter,
            discoveredTotal,
            expectedTotal,
            traceId,
          );
        }
      } finally {
        endImportWork();
      }
      reporter?.throwIfStopped();
      await drainImportBacklog(reporter, { traceId });
      if (libraryWasEmpty) await AppDataService.markLastSynced();
      debugLog(traceId, 'complete', {
        files: discoveredTotal,
        ...timingsSince(startedAt, discoveredTotal),
      });
    } catch (error) {
      errorLog(traceId, 'failed', error, timingsSince(startedAt, discoveredTotal));
      throw error;
    }
  }

  /** Delete an album root and all nested albums/assets in it */
  async delete(id: string) {
    const assetIDsInRootAlbum = await selectFromDB(
      kyselyDB
        .selectFrom('assets')
        .innerJoin('albums', 'albums.id', 'assets.albumId')
        .select('assets.id')
        .where('albums.rootAlbumId', '=', id),
    );

    const result = await executeInDB(kyselyDB.deleteFrom('rootAlbums').where('id', '=', id), [
      'rootAlbums',
      'albums',
      'assets',
      'fileTags',
    ]);

    // Thumbnails are only a cache. Drop them off the UI path so removing a
    // folder returns as soon as the index rows are gone.
    void deleteThumbnailsOfFiles(assetIDsInRootAlbum.map((asset) => asset.id)).catch((error) => {
      console.warn('Failed to delete cached thumbnails after removing album folder', error);
    });

    return result;
  }

  async insertPathAndTheirFiles(
    pathToAdd: string,
    reporter?: ProcessReporter,
    completedBefore = 0,
    expectedTotal?: number,
    traceId = createTraceId('import'),
  ): Promise<number> {
    reporter?.throwIfStopped();
    reporter?.update({ message: 'Scanning album…', progress: 0 });

    let rootAlbum = await selectFromDB(
      kyselyDB.selectFrom('rootAlbums').selectAll().where('path', '=', pathToAdd),
    ).then((rows) => rows[0]);
    if (!rootAlbum) {
      rootAlbum = { id: generateID(), path: pathToAdd, importPending: 1 };
      await executeInDB(kyselyDB.insertInto('rootAlbums').values(rootAlbum), 'rootAlbums');
    } else if (!rootAlbum.importPending) {
      throw new Error('This folder is already part of the library.');
    }
    const folderName = rootAlbum.path.split(/[/\\]/).filter(Boolean).at(-1) ?? 'root';
    const rootStartedAt = performance.now();
    debugLog(traceId, 'discovery-start', { folder: folderName, command: 'discover_import_files' });

    const albumByPath = new Map(
      (await AlbumsService.getAll())
        .filter((album) => album.rootAlbumId === rootAlbum.id)
        .map((album) => [album.relativePath, album]),
    );
    if (!albumByPath.has(normalizedPathSep)) {
      const stat = await tauriFileStat(rootAlbum.path);
      const rootLevelAlbum = AlbumInClient.fromDB(
        {
          rootAlbumId: rootAlbum.id,
          relativePath: normalizedPathSep,
          lastModified: (epochMsToDate(stat.mtime) ?? new Date(0)).toISOString(),
        },
        rootAlbum.path,
      );
      await AlbumsService.insertInDB(rootLevelAlbum.toDB());
      albumByPath.set(normalizedPathSep, rootLevelAlbum);
    }

    const ensureAlbum = async (file: DiscoveredImportFile): Promise<AlbumInClient> => {
      const relativePath = file.relativeDir || normalizedPathSep;
      const existing = albumByPath.get(relativePath);
      if (existing) return existing;

      const album = AlbumInClient.fromDB(
        {
          rootAlbumId: rootAlbum.id,
          relativePath,
          lastModified: new Date(file.directoryMtime ?? Date.now()).toISOString(),
        },
        rootAlbum.path,
      );
      await AlbumsService.insertInDB(album.toDB());
      albumByPath.set(relativePath, album);
      return album;
    };

    const discovered = await discoverImportFiles(
      rootAlbum.path,
      AllSupportedFormatsWithDots,
      async (files, current) => {
        reporter?.throwIfStopped();
        const batchStartedAt = performance.now();
        const byAlbum = new Map<string, { album: AlbumInClient; files: DiscoveredImportFile[] }>();
        for (const file of files) {
          const album = await ensureAlbum(file);
          const group = byAlbum.get(album.id) ?? { album, files: [] };
          group.files.push(file);
          byAlbum.set(album.id, group);
        }
        let inserted = 0;
        for (const group of byAlbum.values())
          inserted += await AssetsService.insertDiscoveredFiles(group.album.id, group.files);

        const done = completedBefore + current;
        const total = expectedTotal ? Math.max(expectedTotal, done) : undefined;
        reporter?.update({
          message: `Scanning album · ${done}${total ? `/${total}` : ''} files`,
          progress: total ? done / total : null,
        });
        const dbMs = Math.round(performance.now() - batchStartedAt);
        debugLog(traceId, 'discovery-batch', {
          folder: folderName,
          received: files.length,
          inserted,
          discovered: current,
          dbMs,
          dbMsPerFile: Number((dbMs / Math.max(files.length, 1)).toFixed(2)),
        });
      },
    );

    reporter?.throwIfStopped();
    await executeInDB(
      kyselyDB.updateTable('rootAlbums').set({ importPending: 0 }).where('id', '=', rootAlbum.id),
      'rootAlbums',
    );
    debugLog(traceId, 'discovery-complete', {
      folder: folderName,
      files: discovered,
      ...timingsSince(rootStartedAt, discovered),
    });
    return discovered;
  }

  async resumePendingImports(
    reporter?: ProcessReporter,
    traceId = createTraceId('recovery'),
  ): Promise<number> {
    beginImportWork();
    try {
      const roots = (await this.getAll()).filter((root) => Boolean(root.importPending));
      let discovered = 0;
      for (const root of roots) {
        reporter?.throwIfStopped();
        if (!(await exists(root.path))) continue;
        discovered += await this.insertPathAndTheirFiles(root.path, reporter, discovered, undefined, traceId);
      }
      return discovered;
    } finally {
      endImportWork();
    }
  }

  private async _assertNoOverlappingRoots(directoriesToImport: string[]): Promise<void> {
    const message = findRootPathOverlap(
      directoriesToImport,
      (await this.getAll()).map((root) => root.path),
    );
    if (message) throw new Error(message);
  }
}

export const RootAlbumsService = new _RootAlbumsService();
