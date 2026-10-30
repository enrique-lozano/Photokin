import { EmptyState } from '@/components/ui/empty-state';
import { IconCopy } from '@tabler/icons-react';
import { ScanOptionsForm } from './ScanOptionsForm';

type Props = {
  onScan: () => void;
  scanning: boolean;
};

/**
 * First-run / no-results state: a centered call-to-action with the two scan
 * options inline. This is the prominent home for the Scan action while there is
 * nothing to review (the split layout + bulk action are hidden in this state).
 */
export function DuplicatesEmptyState({ onScan, scanning }: Props) {
  return (
    <div className="dup-empty">
      <EmptyState
        icon={IconCopy}
        title="Find duplicates in your library"
        description="Photokin looks for exact copies, near-identical look-alikes and burst shots, then suggests which one to keep in each set. Nothing is removed until you review it."
        action={
          <div className="w-full max-w-md">
            <ScanOptionsForm onScan={onScan} scanning={scanning} layout="inline" />
          </div>
        }
      />
    </div>
  );
}
