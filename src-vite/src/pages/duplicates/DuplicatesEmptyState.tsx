import { EmptyState } from '@/components/ui/empty-state';
import { IconCopy } from '@tabler/icons-react';
import { ScanOptionsForm } from './ScanOptionsForm';

type Props = {
  onScan: () => void;
  scanning: boolean;
};

export function DuplicatesEmptyState({ onScan, scanning }: Props) {
  return (
    <div className="dup-empty">
      <EmptyState
        icon={IconCopy}
        title="Find duplicates in your library"
        description="Find exact copies, similar photos and burst shots, with suggestions for which photo to keep."
        actionClassName="w-full max-w-md"
        action={<ScanOptionsForm onScan={onScan} scanning={scanning} layout="inline" />}
      />
    </div>
  );
}
