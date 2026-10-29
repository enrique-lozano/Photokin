import { IconAlertTriangle, IconChevronUp } from '@tabler/icons-react';
import { useState } from 'react';
import { AssetsService } from '../../db/api/services/assets.service';
import { useLiveQuery } from '../../db/connection/useLiveQuery';
import { useWriteBackStore } from '../../stores/writeBackStore';
import { useMetadataModeInfo } from '../metadata-mode/useMetadataModeInfo';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { FooterPopoverBody } from './FooterPopoverBody';

interface MetadataModeChipProps {
  /** Starts a library sync, which is also what writes queued edits into the files. */
  sync: () => void;
  isSyncing: boolean;
}

/**
 * Footer chip for where the user's metadata edits go: library only, straight
 * into the files, queued until the next sync, or — when a write-back was
 * refused — a warning. Opens a short popover with the matching action.
 */
export function MetadataModeChip({ sync, isSyncing }: MetadataModeChipProps) {
  const info = useMetadataModeInfo();
  const failedCount = useWriteBackStore((state) => state.failedCount);
  const { data: pendingCount } = useLiveQuery(() => AssetsService.getPendingFileWriteCount(), ['assets']);
  const [open, setOpen] = useState(false);

  const failed = info.mode !== 'library-only' && failedCount > 0;
  const pending = info.mode === 'on-sync' ? (pendingCount ?? 0) : 0;

  const failedTitle = `${_files(failedCount)} not saved`;
  const Icon = failed ? IconAlertTriangle : info.Icon;
  const label = failed ? failedTitle : info.label;

  const runSync = () => {
    setOpen(false);
    sync();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Badge asChild variant={failed ? 'destructive' : info.variant}>
          <button type="button" className="cursor-pointer" title="File metadata">
            <Icon />
            {label}
            {!failed && pending > 0 && (
              <span className="opacity-75">· {pending.toLocaleString()} pending</span>
            )}
            <IconChevronUp className="opacity-75" />
          </button>
        </Badge>
      </PopoverTrigger>

      <PopoverContent align="start" side="top" className="w-64">
        {failed ? (
          <FooterPopoverBody icon={IconAlertTriangle} title={failedTitle} tone="destructive">
            <p className="text-xs text-muted-foreground">
              Photokin kept your edits in the library, but couldn’t write them into those photos. They’ll be
              retried on the next sync.
            </p>
            <Button size="sm" className="w-full" onClick={runSync} disabled={isSyncing}>
              {isSyncing ? 'Retrying…' : 'Retry'}
            </Button>
          </FooterPopoverBody>
        ) : (
          <FooterPopoverBody
            icon={info.Icon}
            title={info.label}
            tone={info.mode === 'on-sync' ? 'warning' : 'default'}
          >
            <p className="text-xs text-muted-foreground">{info.hint}</p>
            {info.mode === 'on-sync' && (
              <Button size="sm" className="w-full" onClick={runSync} disabled={isSyncing || pending === 0}>
                {isSyncing ? 'Writing…' : pending > 0 ? `Write ${_files(pending)} now` : 'Nothing to write'}
              </Button>
            )}
          </FooterPopoverBody>
        )}
      </PopoverContent>
    </Popover>
  );
}

function _files(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'file' : 'files'}`;
}
