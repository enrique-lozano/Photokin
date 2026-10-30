import { emit, listen } from '@tauri-apps/api/event';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AlbumsService } from '../../db/api/services/albums.service';
import { AppDataService } from '../../db/api/services/appData.service';
import { syncFilesAndDirsOf } from '../../db/api/services/assetIndexer.service';
import { useSettingsStore } from '../../stores/settingsStore';
import { trackProcess } from '../../system/processTracker';
import { notifySyncResult } from '../../system/syncFeedback';
import { appTaskQueue } from '../../utils/taskQueue/taskQueue';
import { ProcessKind } from '@/stores/processStore';

/** Lets the settings window ask the main window to sync the library. */
export const SYNC_LIBRARY_EVENT = 'photokin://sync-library';
export const SYNC_LIBRARY_STATUS_EVENT = 'photokin://sync-library-status';
export const SYNC_LIBRARY_STATUS_REQUEST_EVENT = 'photokin://sync-library-status-request';

/**
 * Re-syncs every added album with the filesystem (removes missing files, adds
 * new ones) while surfacing fine-grained progress through the process center.
 * Also runs when another window emits {@link SYNC_LIBRARY_EVENT}.
 */
export function useLibrarySync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  const sync = (): void => {
    if (syncingRef.current) return;

    syncingRef.current = true;
    setIsSyncing(true);

    trackProcess(
      {
        kind: ProcessKind.Sync,
        title: 'Syncing library',
        message: 'Waiting in queue…',
        canStop: true,
        // A detailed summary toast is built from the sync result.
        successMessage: false,
        errorMessage: (error) => `Sync failed: ${String(error)}`,
      },
      (reporter) =>
        appTaskQueue.add(
          async () => {
            const albums = await AlbumsService.getAll();
            const resyncMode = useSettingsStore.getState().resyncMode;
            return syncFilesAndDirsOf({ albums, resyncMode, reporter });
          },
          { signal: reporter.signal },
        ),
    )
      .then(async (result) => {
        await AppDataService.markLastSynced().catch((error: unknown) => {
          console.error('Could not save the last library sync time', error);
        });
        notifySyncResult(result);
      })
      .catch(() => {
        // The process tracker already surfaced the error toast + state.
      })
      .finally(() => {
        syncingRef.current = false;
        setIsSyncing(false);
      });
  };

  const onSyncRequested = useEffectEvent(() => sync());
  const publishStatus = useEffectEvent(() =>
    emit(SYNC_LIBRARY_STATUS_EVENT, syncingRef.current).catch((error: unknown) => {
      console.error('Could not share the library sync status', error);
    }),
  );

  useEffect(() => {
    void publishStatus();
  }, [isSyncing]);

  useEffect(() => {
    const unlisten = listen(SYNC_LIBRARY_EVENT, () => onSyncRequested());
    const unlistenStatus = listen(SYNC_LIBRARY_STATUS_REQUEST_EVENT, () => void publishStatus());
    return () => {
      void unlisten.then((off) => off());
      void unlistenStatus.then((off) => off());
    };
  }, []);

  return { sync, isSyncing };
}
