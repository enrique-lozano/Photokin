import { showMetadataUndoToast } from '@/components/metadataUndo';
import { toast } from '@/components/ui/toast';
import { AssetsService } from '@/db/api/services/assets.service';
import type { AssetInClient } from '@/db/models/AssetInClient';
import { tauriFileStat } from '@/system/diskManager';
import { dirname, join } from '@tauri-apps/api/path';
import { exists, rename } from '@tauri-apps/plugin-fs';

/** Whether `filename` can be used as a single file name inside a folder. */
export function isValidFilename(filename: string): boolean {
  return Boolean(filename) && filename !== '.' && filename !== '..' && !/[/\\\0]/.test(filename);
}

/**
 * Renames the asset's file on disk and in the library, rolling the file back if
 * the library can't record the new name. Failures are reported with a toast;
 * success offers an undo. Resolves to whether the rename happened.
 */
export async function renameAssetFile(asset: AssetInClient, rawFilename: string): Promise<boolean> {
  const filename = rawFilename.trim();
  if (!isValidFilename(filename)) {
    toast.error('Enter a valid file name');
    return false;
  }
  if (filename === asset.filename) return false;

  try {
    const destination = await join(await dirname(asset.fullPath), filename);
    if (await exists(destination)) {
      throw new Error('A file with that name already exists');
    }
    await rename(asset.fullPath, destination);
    try {
      const fileStat = await tauriFileStat(destination);
      await AssetsService.updateFileTracking(asset.id, {
        filename,
        fileMtime: new Date(fileStat.mtime ?? 0),
        inode: fileStat.inode ?? '',
      });
    } catch (error) {
      try {
        await rename(destination, asset.fullPath);
      } catch (rollbackError) {
        throw new Error(
          `The library could not save the new file name, and the file could not be restored: ${String(rollbackError)}`,
          { cause: error },
        );
      }
      throw error;
    }

    const originalPath = asset.fullPath;
    const originalName = asset.filename;
    showMetadataUndoToast('File renamed', async () => {
      if (await exists(originalPath)) {
        throw new Error('A file with the original name already exists');
      }
      if (!(await exists(destination))) throw new Error('The renamed file was moved or deleted');
      await rename(destination, originalPath);
      const fileStat = await tauriFileStat(originalPath);
      await AssetsService.updateFileTracking(asset.id, {
        filename: originalName,
        fileMtime: new Date(fileStat.mtime ?? 0),
        inode: fileStat.inode ?? '',
      });
    });
    return true;
  } catch (error) {
    toast.error(`Could not rename file: ${String(error)}`);
    return false;
  }
}
