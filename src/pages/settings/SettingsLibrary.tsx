import { MetadataMode } from '@/common/metadataOptions';
import { ResyncMode, isResyncMode } from '@/common/resyncOptions';
import {
  SYNC_LIBRARY_EVENT,
  SYNC_LIBRARY_STATUS_EVENT,
  SYNC_LIBRARY_STATUS_REQUEST_EVENT,
} from '@/components/footer/useLibrarySync';
import {
  SettingsButtonRow,
  SettingsGroup,
  SettingsPageHeader,
  SettingsRadioGroup,
  SettingsToggleRow,
} from '@/components/settings/SettingsRow';
import { toast } from '@/components/ui/toast';
import { AppDataKey, AppDataService } from '@/db/api/services/appData.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatDate } from '@/utils/dateFormatter';
import { IconRefresh } from '@tabler/icons-react';
import { emit, emitTo, listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

export function SettingsLibrary() {
  const checkFoldersAtStartup = useSettingsStore((state) => state.checkFoldersAtStartup);
  const resyncMode = useSettingsStore((state) => state.resyncMode);
  const metadataMode = useSettingsStore((state) => state.metadataMode);
  const [isSyncing, setIsSyncing] = useState(false);
  const {
    data: lastSyncedAt,
    error,
    loading,
  } = useLiveQuery(
    () => AppDataService.get(AppDataKey.LastSyncedAt),
    ['appData'],
    // Table invalidation is window-local; a status change also refreshes this window.
    { extDependencies: [isSyncing] },
  );

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const off = await listen<boolean>(SYNC_LIBRARY_STATUS_EVENT, (event) => {
          if (!disposed) setIsSyncing(event.payload);
        });
        if (disposed) {
          off();
          return;
        }
        unlisten = off;
        await emitTo('main', SYNC_LIBRARY_STATUS_REQUEST_EVENT);
      } catch (error) {
        if (!disposed) toast.error(`Could not load the sync status: ${String(error)}`);
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  let syncDescription = 'Not synced yet.';
  if (error) {
    syncDescription = 'Could not load the last sync time.';
  } else if (lastSyncedAt) {
    const date = new Date(Number(lastSyncedAt));
    const day =
      date.toDateString() === new Date().toDateString() ? 'today' : formatDate(date, { dateStyle: 'medium' });
    syncDescription = `Last synced ${day} at ${formatDate(date, { timeStyle: 'short' })}`;
  } else if (loading) {
    syncDescription = 'Loading last sync time…';
  }

  const handleCheckFoldersAtStartupChange = (value: boolean) => {
    useSettingsStore.getState().setCheckFoldersAtStartup(value);
    void emit('settings-checkFoldersAtStartup-changed', value);
  };

  const handleResyncModeChange = (value: string) => {
    if (!isResyncMode(value)) return;

    useSettingsStore.getState().setResyncMode(value);
    // Broadcast to the main window, which runs the sync.
    void emit('settings-resyncMode-changed', value);
  };

  const syncNow = async () => {
    setIsSyncing(true);
    try {
      await emitTo('main', SYNC_LIBRARY_EVENT);
    } catch (error) {
      setIsSyncing(false);
      toast.error(`Could not start the sync: ${String(error)}`);
    }
  };

  return (
    <>
      <SettingsPageHeader title="Library" />

      <SettingsGroup title="Keeping in sync">
        <SettingsToggleRow
          icon={<IconRefresh size={18} />}
          label="Scan folders at startup"
          description="Finds new, renamed and removed items without replacing your edits. Folders on disconnected drives stay unchanged."
          checked={checkFoldersAtStartup}
          onCheckedChange={handleCheckFoldersAtStartupChange}
        />
        <SettingsButtonRow
          icon={<IconRefresh size={18} />}
          label="Sync library"
          description={<span aria-live="polite">{syncDescription}</span>}
          buttonLabel={isSyncing ? 'Syncing…' : 'Sync now'}
          buttonIcon={
            <IconRefresh size={16} className={isSyncing ? 'motion-safe:animate-spin' : undefined} />
          }
          disabled={isSyncing}
          onAction={() => void syncNow()}
        />
      </SettingsGroup>

      <SettingsGroup
        title="What counts as a change"
        description="Manual sync uses this to decide if another app edited a photo. New, renamed and deleted photos are always detected."
      >
        <SettingsRadioGroup
          label="What counts as a change"
          value={resyncMode}
          options={[
            {
              value: ResyncMode.Off,
              label: 'New & removed only',
              description: 'Ignores edits made in other apps, so your Photokin edits are never replaced.',
              badge: metadataMode === MetadataMode.ReadOnly ? 'Recommended' : undefined,
            },
            {
              value: ResyncMode.Mtime,
              label: 'Modified time',
              description:
                'Re-reads file info when “Date modified” changes, so edits made in other apps are picked up.',
              badge: metadataMode === MetadataMode.Full ? 'Recommended' : undefined,
            },
            {
              value: ResyncMode.SizeMtime,
              label: 'Modified time + File size',
              description: 'Most thorough. Also re-reads file info when the file size changes.',
            },
          ]}
          onValueChange={handleResyncModeChange}
        />
      </SettingsGroup>
    </>
  );
}
