import { exists } from '@tauri-apps/plugin-fs';
import { toast } from '@/components/ui/toast';
import { AlbumsService } from '@/db/api/services/albums.service';
import { AppDataService } from '@/db/api/services/appData.service';
import { syncFilesAndDirsOf } from '@/db/api/services/assetIndexer.service';
import { startBackgroundIndexing } from '@/media/smartSearch/indexing';
import { useSettingsStore } from '@/stores/settingsStore';
import { trackProcess } from '@/system/processTracker';
import { notifySyncResult } from '@/system/syncFeedback';
import { appTaskQueue } from '@/utils/taskQueue/taskQueue';
import { ProcessKind } from '@/stores/processStore';

let startupCheckStarted = false;

/**
 * Starts the optional add/remove/rename folder check once per app launch.
 * Unchanged folders are skipped via mtime, same as a cheap manual sync.
 * Returns whether startup indexing should wait for this check.
 */
export function startStartupFolderCheck(): boolean {
  if (!useSettingsStore.getState().checkFoldersAtStartup) return false;
  if (startupCheckStarted) return true;

  startupCheckStarted = true;

  void trackProcess(
    {
      kind: ProcessKind.Sync,
      title: 'Checking library folders',
      message: 'Waiting in queue…',
      canStop: true,
      successMessage: false,
      errorMessage: (error) => `Folder check failed: ${String(error)}`,
    },
    (reporter) =>
      appTaskQueue.add(
        async () => {
          const albums = await AlbumsService.getAll();
          const rootAvailability = new Map<string, boolean>();

          for (const album of albums) {
            reporter.throwIfStopped();
            if (!rootAvailability.has(album.rootAlbumId)) {
              rootAvailability.set(album.rootAlbumId, await exists(album.rootPath));
            }
          }

          const availableAlbums = albums.filter((album) => rootAvailability.get(album.rootAlbumId));
          const result = await syncFilesAndDirsOf({
            albums: availableAlbums,
            presenceOnly: true,
            reporter,
          });

          return {
            result,
            unavailableRootCount: [...rootAvailability.values()].filter((available) => !available).length,
          };
        },
        { signal: reporter.signal },
      ),
  )
    .then(({ result, unavailableRootCount }) => {
      if (unavailableRootCount === 0) {
        void AppDataService.markLastSynced();
      }

      const foundChanges =
        result.addedCount + result.removedCount + result.renamedCount + result.unsupportedNewCount > 0;
      if (foundChanges) notifySyncResult(result);

      if (unavailableRootCount > 0) {
        toast.warning(
          `${unavailableRootCount} library folder${unavailableRootCount === 1 ? '' : 's'} could not be checked`,
          { description: 'Photokin left those folders unchanged. Reconnect the drive and sync again.' },
        );
      }
    })
    .catch(() => {
      // The process tracker already surfaced the error; indexing can still resume.
      startBackgroundIndexing();
    });

  return true;
}
