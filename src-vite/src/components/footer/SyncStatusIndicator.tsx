import { IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { format } from 'timeago.js';
import { AppDataKey, AppDataService } from '../../db/api/services/appData.service';
import { useLiveQuery } from '../../db/connection/useLiveQuery';
import { formatDate } from '../../utils/dateFormatter';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { FooterPopoverBody } from './FooterPopoverBody';

/** Formats the last-sync timestamp as a short "Synced … ago" label. */
export function formatSyncedLabel(lastSyncedAt: number | null): string {
  if (!lastSyncedAt) return 'Never synced';
  return `Synced ${format(lastSyncedAt)}`;
}

interface SyncStatusIndicatorProps {
  sync: () => void;
  isSyncing: boolean;
}

/**
 * Footer indicator showing when the whole library was last checked against
 * disk. The timestamp comes from library-wide scans only (not per-album syncs
 * or single-folder imports), so it never claims freshness for albums that were
 * left untouched. Clicking it opens a popover that exposes a "Sync now" action.
 */
export function SyncStatusIndicator({ sync, isSyncing }: SyncStatusIndicatorProps) {
  // Lives in `appData` (wiped with the database), so read it reactively: the
  // live query re-runs whenever the sync writes a new timestamp.
  const { data: lastSyncedAt } = useLiveQuery(async () => {
    const value = await AppDataService.get(AppDataKey.LastSyncedAt);
    return value ? Number(value) : null;
  }, ['appData']);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="sync-status" title="Library sync">
          <span
            className={[
              'sync-status__dot',
              isSyncing ? 'sync-status__dot--busy' : !lastSyncedAt ? 'sync-status__dot--never' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-hidden="true"
          />
          {isSyncing ? 'Syncing…' : formatSyncedLabel(lastSyncedAt)}
          <IconRefresh size={13} className={isSyncing ? 'animate-spin' : undefined} aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" side="top" className="w-64">
        <FooterPopoverBody icon={IconRefresh} title="Library sync">
          <p className="text-xs text-muted-foreground">
            {lastSyncedAt
              ? `Last synced ${formatDate(new Date(lastSyncedAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}`
              : 'The library has not been synced yet.'}
          </p>

          <p className="text-xs text-muted-foreground">
            Checks your folders for new, renamed and deleted photos, and for edits made in other apps.
          </p>

          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              setOpen(false);
              sync();
            }}
            disabled={isSyncing}
          >
            <IconRefresh size={15} className={isSyncing ? 'animate-spin' : undefined} />
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </FooterPopoverBody>
      </PopoverContent>
    </Popover>
  );
}
