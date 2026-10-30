import { IconSearch } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/** What a list sidebar shows when its filter hides every row. */
export function SidebarNoMatches({ noun, onClear }: { noun: string; onClear: () => void }) {
  return (
    <EmptyState
      size="sidebar"
      icon={IconSearch}
      title={`No ${noun} match`}
      action={
        <Button variant="link" size="xs" className="h-auto px-0" onClick={onClear}>
          Clear filter
        </Button>
      }
    />
  );
}
