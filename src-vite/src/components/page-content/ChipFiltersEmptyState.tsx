import { IconFilterOff } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/** Shown when the quick-filter chips above a gallery leave nothing to show. */
export function ChipFiltersEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      icon={IconFilterOff}
      title="Nothing matches these filters"
      description="Turn off a filter above, or clear them all."
      action={
        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  );
}
