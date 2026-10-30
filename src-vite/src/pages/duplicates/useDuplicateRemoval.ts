import { trackProcess } from '@/system/processTracker';
import { moveAssetsToTrash, MoveToTrashResult, TrashableAsset } from '@/system/trash';
import { useCallback } from 'react';
import { useDuplicatesStore } from './useDuplicatesStore';
import { ProcessKind } from '@/stores/processStore';

/**
 * Moves the given assets to the app Trash (restorable for 30 days) and prunes
 * them from the in-memory duplicate sets. Runs through the shared process
 * tracker so the footer reflects progress and a success/failure toast is shown.
 */
export function useDuplicateRemoval(): (assets: TrashableAsset[]) => Promise<void> {
  return useCallback(async (assets: TrashableAsset[]) => {
    if (assets.length === 0) return;

    await trackProcess(
      {
        kind: ProcessKind.Generic,
        title: 'Moving to Trash',
        message: `Removing ${assets.length.toLocaleString()} photo${assets.length === 1 ? '' : 's'}…`,
        successMessage: (result: MoveToTrashResult) =>
          `Moved ${result.trashedIds.length.toLocaleString()} photo${
            result.trashedIds.length === 1 ? '' : 's'
          } to Trash`,
        errorMessage: (error) => `Could not remove photos: ${String(error)}`,
        getWarnings: (result) =>
          result.failures.length > 0
            ? [
                `${result.failures.length} file(s) could not be trashed`,
                ...result.failures.map((failure) => `${failure.filename}: ${failure.reason}`),
              ]
            : undefined,
      },
      async () => {
        const result = await moveAssetsToTrash(assets);
        useDuplicatesStore.getState().applyRemoval(result.trashedIds);
        return result;
      },
    );
  }, []);
}
