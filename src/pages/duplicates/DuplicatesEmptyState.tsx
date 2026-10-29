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
      <div className="dup-empty__card">
        <div className="dup-empty__icon">
          <IconCopy size={30} />
        </div>
        <h2 className="dup-empty__title text-2xl font-semibold tracking-tight">
          Find duplicates in your library
        </h2>
        <p className="dup-empty__text text-sm leading-6">
          Photokin scans your photos for exact copies, near-identical look-alikes and burst sequences, then
          proposes which one to keep in each set. Nothing is removed until you review.
        </p>

        <ScanOptionsForm onScan={onScan} scanning={scanning} layout="inline" />
      </div>
    </div>
  );
}
