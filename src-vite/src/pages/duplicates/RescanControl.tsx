import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconChevronDown, IconFingerprint, IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { format as timeAgo } from 'timeago.js';
import { ScanOptionsForm } from './ScanOptionsForm';
import { useDuplicatesScan } from './useDuplicatesScan';
import { useDuplicatesStore } from './useDuplicatesStore';

/**
 * The quiet "Re-scan ▾" affordance shown in the sidebar title bar once results
 * exist. The "Last scan {when}" status and the scan options live inside the
 * popover so the header stays to a single line.
 */
export function RescanControl() {
  const scannedAt = useDuplicatesStore((state) => state.scannedAt);
  const scanStatus = useDuplicatesStore((state) => state.scanStatus);
  const runScan = useDuplicatesScan();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" type="button" className="dup-rescan-btn">
          <IconRefresh size={14} />
          Re-scan
          <IconChevronDown size={13} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-3">
        <p className="dup-rescan-when">{scannedAt ? `Last scan ${timeAgo(scannedAt)}` : 'Not scanned yet'}</p>
        <ScanOptionsForm
          layout="popover"
          scanning={scanStatus === 'scanning'}
          scanLabel="Re-scan"
          onScan={() => {
            setOpen(false);
            void runScan();
          }}
        />

        <div className="dup-rescan-fingerprints">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="dup-rescan-fingerprints__btn"
                disabled={scanStatus === 'scanning'}
                onClick={() => {
                  setOpen(false);
                  void runScan({ refreshFingerprints: true });
                }}
              >
                <IconFingerprint size={13} />
                Refresh fingerprints
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Discards cached file fingerprints and re-hashes every file from scratch. Slower, but picks up
              files edited outside the app.
            </TooltipContent>
          </Tooltip>
        </div>
      </PopoverContent>
    </Popover>
  );
}
