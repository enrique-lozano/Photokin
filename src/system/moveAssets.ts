import { join } from '@tauri-apps/api/path';
import { exists } from '@tauri-apps/plugin-fs';
import { AssetsService } from '@/db/api/services/assets.service';
import { AlbumInClient } from '@/db/models/AlbumDTO';
import { tauriFileStat } from './diskManager';
import { epochMsToDate } from '@/utils/date.utils';
import { moveFile } from './fileMove';

/** Minimal shape needed to move an asset's file and update its DB row. */
export interface MovableAsset {
  id: string;
  filename: string;
  /** Current absolute path of the file on disk. */
  fullPath: string;
  /** Album the asset currently belongs to. */
  albumId: string;
}

export interface MoveResult {
  /** Ids of assets whose file + DB row were moved. */
  movedIds: string[];
  /** Left untouched on purpose (already in the destination, or a name clash). */
  skipped: { id: string; filename: string; reason: string }[];
  /** Move attempted but failed (disk or DB error). */
  failures: { id: string; filename: string; reason: string }[];
}

/**
 * Moves each asset's file into the destination album's folder and reassigns it
 * to that album in the database, preserving the asset id (so tags, faces and
 * thumbnails carry over). Non-destructive: assets already in the destination and
 * files that would overwrite an existing name are skipped, never overwritten.
 *
 * Works both within and across library roots/drives — a plain rename is tried
 * first (instant, same volume) and falls back to copy + delete across volumes.
 */
export async function moveAssetsToAlbum(
  assets: MovableAsset[],
  destination: AlbumInClient,
  onProgress?: (processed: number, total: number) => void,
): Promise<MoveResult> {
  const result: MoveResult = { movedIds: [], skipped: [], failures: [] };
  let processed = 0;

  for (const asset of assets) {
    try {
      if (asset.albumId === destination.id) {
        result.skipped.push({ id: asset.id, filename: asset.filename, reason: 'already in this folder' });
        continue;
      }

      const destinationPath = await join(destination.fullPath, asset.filename);

      if (await exists(destinationPath)) {
        result.skipped.push({
          id: asset.id,
          filename: asset.filename,
          reason: 'a file with the same name already exists there',
        });
        continue;
      }

      await moveFile(asset.fullPath, destinationPath);

      // Re-stat at the destination: a cross-volume move changes mtime/inode, and
      // keeping the tracking columns fresh stops the next sync from re-indexing.
      const stat = await tauriFileStat(destinationPath);
      await AssetsService.moveAssetToAlbum(asset.id, {
        albumId: destination.id,
        filename: asset.filename,
        filesize: stat.size,
        fileMtime: epochMsToDate(stat.mtime) ?? new Date(0),
        inode: stat.inode ?? '',
      });

      result.movedIds.push(asset.id);
    } catch (error) {
      result.failures.push({ id: asset.id, filename: asset.filename, reason: String(error) });
    } finally {
      processed += 1;
      onProgress?.(processed, assets.length);
    }
  }

  return result;
}
