import { dbName, getDbDir } from '@/db/connection/db.service';
import { closeAppDB, resumeAppDB, suspendAppDB } from '@/db/connection/dbInstance';
import { stopTextSession } from '@/media/smartSearch/clipSidecar';
import { CLIP_MODELS, getModelsBasePath, isModelDownloaded } from '@/media/smartSearch/models';
import { deleteAllThumbnails, getThumbnailsBasePath } from '@/media/thumbnails/thumbnail';
import { clearDuplicatesCache } from '@/pages/duplicates/duplicatesCache';
import { tauriDirEntriesStat, tauriScanImportPreview } from '@/system/diskManager';
import { join } from '@tauri-apps/api/path';
import { exists, remove } from '@tauri-apps/plugin-fs';
import { openPath } from '@tauri-apps/plugin-opener';

/** Event used by the settings window to ask the main window to wipe all data. */
export const WIPE_USER_DATA_EVENT = 'photokin://wipe-user-data';

export type WipeUserDataPayload = {
  deleteAiModels: boolean;
};

export type RemoveAllUserDataOptions = {
  deleteAiModels?: boolean;
};

/** On-disk footprint of the generated thumbnail cache. */
export interface ThumbnailCacheStats {
  sizeBytes: number;
  fileCount: number;
}

export interface SearchModelsStorageStats {
  sizeBytes: number;
  modelCount: number;
}

/** Includes SQLite's live journal files, not just the main database. */
export async function getDatabaseStorageSize(): Promise<number> {
  const entries = await tauriDirEntriesStat(await getDbDir());
  const filenames = new Set([dbName, `${dbName}-wal`, `${dbName}-shm`]);
  return entries.reduce(
    (size, entry) => size + (entry.isFile && filenames.has(entry.name) ? entry.size : 0),
    0,
  );
}

/** Actual model storage, including partial downloads; count only complete models. */
export async function getSearchModelsStorageStats(): Promise<SearchModelsStorageStats> {
  const folder = await getModelsBasePath();
  if (!(await exists(folder))) return { sizeBytes: 0, modelCount: 0 };

  const [scan, downloaded] = await Promise.all([
    tauriScanImportPreview([folder], []),
    Promise.all(CLIP_MODELS.map((model) => isModelDownloaded(model.id))),
  ]);
  return {
    sizeBytes: scan.supportedFilesSize + scan.unsupportedFilesSize,
    modelCount: downloaded.filter(Boolean).length,
  };
}

/** Resolve the folder that holds the SQLite database file. */
export async function getDatabaseFolder() {
  return getDbDir();
}

/** Resolve the folder that holds the generated thumbnails. */
export async function getThumbnailsFolder() {
  return getThumbnailsBasePath();
}

/**
 * Total size and file count of the thumbnail cache. Thumbnails are sharded into
 * 2-character hex subdirectories, so we recurse one level deep.
 */
export async function getThumbnailCacheStats(): Promise<ThumbnailCacheStats> {
  const folder = await getThumbnailsBasePath();

  if (!(await exists(folder))) {
    return { sizeBytes: 0, fileCount: 0 };
  }

  const rootEntries = await tauriDirEntriesStat(folder);
  let sizeBytes = 0;
  let fileCount = 0;

  for (const entry of rootEntries) {
    if (entry.isFile) {
      sizeBytes += entry.size;
      fileCount += 1;
    } else if (entry.isDir) {
      const shardEntries = await tauriDirEntriesStat(await join(folder, entry.name));
      for (const shardEntry of shardEntries) {
        if (!shardEntry.isFile) continue;
        sizeBytes += shardEntry.size;
        fileCount += 1;
      }
    }
  }

  return { sizeBytes, fileCount };
}

/**
 * Delete every generated thumbnail. Safe to call at any time: thumbnails are a
 * pure cache and are regenerated on demand the next time an asset is displayed.
 */
export async function clearThumbnailCache() {
  await deleteAllThumbnails();
}

/** Reveal the database folder in the OS file explorer. */
export async function openDatabaseFolder() {
  await openPath(await getDbDir());
}

async function _removeWithRetries(path: string, recursive = false) {
  const maxAttempts = 15;
  const retryDelayMs = 200;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (!(await exists(path))) return;

    try {
      await remove(path, recursive ? { recursive: true } : undefined);
      return;
    } catch (error) {
      // A query that was already in flight when the connection closed may keep
      // the file locked for a moment; back off briefly and retry.
      if (attempt === maxAttempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

/**
 * Remove all locally stored user data: the SQLite database (including its
 * `-wal`/`-shm` sidecar files) and every generated thumbnail. Optionally also
 * deletes downloaded AI models. The original photos and videos on disk are
 * never touched.
 *
 * This MUST run in the window that owns the live database connection (the main
 * window). It suspends new connections, closes the active one, deletes the
 * files, then reloads the webview so the app comes back up with a fresh,
 * empty database. Reloading the webview (instead of restarting the OS process)
 * keeps it working under `tauri dev`, where a full relaunch would kill the dev
 * server.
 */
export async function removeAllUserData(options: RemoveAllUserDataOptions = {}) {
  suspendAppDB();

  try {
    await closeAppDB();

    // Give any in-flight query a brief moment to settle before deleting.
    await new Promise((resolve) => setTimeout(resolve, 150));

    const dbDir = await getDbDir();
    const dbFiles = [dbName, `${dbName}-wal`, `${dbName}-shm`];

    for (const fileName of dbFiles) {
      await _removeWithRetries(await join(dbDir, fileName));
    }

    await deleteAllThumbnails();
    await clearDuplicatesCache();

    if (options.deleteAiModels) {
      // A loaded model would lock its files on Windows.
      await stopTextSession();
      await _removeWithRetries(await getModelsBasePath(), true);
    }
  } catch (error) {
    // Re-enable the database so the app remains usable if the wipe failed.
    resumeAppDB();
    throw error;
  }

  // Reload the window to reinitialize a clean database and clear any stale UI.
  window.location.reload();
}
