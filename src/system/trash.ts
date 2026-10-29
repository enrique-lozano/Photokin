import { exists, mkdir, remove } from '@tauri-apps/plugin-fs';
import { AssetsService } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { executeInDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { deletePreviewOfFile } from '@/media/thumbnails/preview';
import { deleteThumbnailsOfFiles } from '@/media/thumbnails/thumbnail';
import { tauriFileStat } from '@/system/diskManager';
import { epochMsToDate } from '@/utils/date.utils';
import { moveFile } from '@/system/fileMove';
import { getTrashFilePath, getTrashItemDir } from '@/system/trashPaths';

/** Number of days a trashed asset is kept before it is purged automatically. */
export const TRASH_RETENTION_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// App-managed Trash: move originals into a local `trash/` folder (soft delete),
// keep the row + thumbnail so they stay browsable, and restore or purge later.
// ---------------------------------------------------------------------------

/** A file that could not be moved during a trash / restore / delete operation. */
export interface TrashFailure {
  filename: string;
  reason: string;
}

export interface MoveToTrashResult {
  /** Ids whose file was moved to Trash and flagged in the DB. */
  trashedIds: string[];
  failures: TrashFailure[];
}

export interface RestoreFromTrashResult {
  /** Ids moved back to their album folder and un-flagged. */
  restoredIds: string[];
  /** Left in Trash because their original name is now taken. */
  skipped: TrashFailure[];
  failures: TrashFailure[];
}

export interface PermanentDeleteResult {
  /** Ids whose file, thumbnail and row were deleted for good. */
  deletedIds: string[];
  failures: TrashFailure[];
}

/** Minimal asset shape needed to move a file into the Trash folder. */
export interface TrashableAsset {
  id: string;
  filename: string;
  /** Current on-disk path of the file (inside its album folder). */
  fullPath: string;
}

/**
 * Moves each asset's file into the app Trash folder and flags the row as
 * trashed. The cached thumbnail is intentionally kept so the Trash grid can
 * still render it, and the id is preserved so the item can be restored or
 * purged. Files already gone from disk are reported as failures, never flagged.
 */
export async function moveAssetsToTrash(assets: TrashableAsset[]): Promise<MoveToTrashResult> {
  const result: MoveToTrashResult = { trashedIds: [], failures: [] };
  if (assets.length === 0) return result;

  for (const asset of assets) {
    try {
      if (!(await exists(asset.fullPath))) {
        result.failures.push({ filename: asset.filename, reason: 'file is no longer on disk' });
        continue;
      }

      const trashPath = await getTrashFilePath(asset.id, asset.filename);
      await mkdir(await getTrashItemDir(asset.id), { recursive: true });
      await moveFile(asset.fullPath, trashPath);

      result.trashedIds.push(asset.id);
    } catch (error) {
      result.failures.push({ filename: asset.filename, reason: String(error) });
    }
  }

  if (result.trashedIds.length > 0) {
    await AssetsService.setAssetsTrashed(result.trashedIds, new Date().toISOString());
  }

  return result;
}

/**
 * Moves trashed assets back to their original album folder and clears the trash
 * flag. An asset whose original name is already taken is skipped (never
 * overwrites), and a cross-volume move refreshes the file-tracking columns so
 * the next sync doesn't re-read it.
 */
export async function restoreAssetsFromTrash(assets: AssetInClient[]): Promise<RestoreFromTrashResult> {
  const result: RestoreFromTrashResult = { restoredIds: [], skipped: [], failures: [] };
  if (assets.length === 0) return result;

  for (const asset of assets) {
    try {
      // A trashed asset resolves `fullPath` to the Trash folder and keeps its
      // album destination in `originalPath`.
      const trashPath = asset.fullPath;
      const originalPath = asset.originalPath;

      if (!(await exists(trashPath))) {
        result.failures.push({ filename: asset.filename, reason: 'trashed file is missing' });
        continue;
      }
      if (await exists(originalPath)) {
        result.skipped.push({
          filename: asset.filename,
          reason: 'a file with the same name already exists in its folder',
        });
        continue;
      }

      await moveFile(trashPath, originalPath);
      await _removeTrashItemDir(asset.id);

      try {
        const stat = await tauriFileStat(originalPath);
        await AssetsService.updateFileTracking(asset.id, {
          fileMtime: epochMsToDate(stat.mtime) ?? new Date(0),
          inode: stat.inode ?? '',
        });
      } catch {
        // Tracking refresh is best-effort; the row is still restored below.
      }
      await AssetsService.setAssetsTrashed([asset.id], null);

      result.restoredIds.push(asset.id);
    } catch (error) {
      result.failures.push({ filename: asset.filename, reason: String(error) });
    }
  }

  return result;
}

/**
 * Permanently deletes trashed assets: removes the file from the Trash folder,
 * its cached thumbnail + preview, and its database row. Only assets whose file
 * was actually removed have their row dropped, so a locked file leaves a
 * recoverable entry rather than an orphaned row.
 */
export async function deleteTrashedAssetsPermanently(
  refs: { id: string; filename: string }[],
): Promise<PermanentDeleteResult> {
  const result: PermanentDeleteResult = { deletedIds: [], failures: [] };
  if (refs.length === 0) return result;

  for (const ref of refs) {
    try {
      const trashPath = await getTrashFilePath(ref.id, ref.filename);
      if (await exists(trashPath)) {
        await remove(trashPath);
      }
      await _removeTrashItemDir(ref.id);
      result.deletedIds.push(ref.id);
    } catch (error) {
      result.failures.push({ filename: ref.filename, reason: String(error) });
    }
  }

  if (result.deletedIds.length > 0) {
    await deleteThumbnailsOfFiles(result.deletedIds);
    for (const id of result.deletedIds) {
      await deletePreviewOfFile(id);
    }
    await executeInDB(kyselyDB.deleteFrom('assets').where('id', 'in', result.deletedIds), [
      'assets',
      'fileTags',
    ]);
  }

  return result;
}

/** Permanently deletes every asset currently in Trash. */
export async function emptyTrash(): Promise<PermanentDeleteResult> {
  const refs = await AssetsService.getTrashedAssetRefs();
  return deleteTrashedAssetsPermanently(refs);
}

/**
 * Permanently deletes trashed assets older than {@link TRASH_RETENTION_DAYS}.
 * Run on app startup so Trash never grows without bound. Returns how many items
 * were purged.
 */
export async function purgeExpiredTrash(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * MS_PER_DAY).toISOString();
  const expired = await AssetsService.getTrashedAssetRefs({ before: cutoff });
  if (expired.length === 0) return 0;

  const result = await deleteTrashedAssetsPermanently(expired);
  return result.deletedIds.length;
}

/** Removes an asset's now-empty `{id}/` Trash subfolder. Best-effort. */
async function _removeTrashItemDir(id: string): Promise<void> {
  try {
    const dir = await getTrashItemDir(id);
    if (await exists(dir)) {
      await remove(dir, { recursive: true });
    }
  } catch {
    // A leftover empty folder is harmless.
  }
}
