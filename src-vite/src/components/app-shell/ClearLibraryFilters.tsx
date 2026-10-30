import { IconFilterOff } from '@tabler/icons-react';
import { getConditions } from '../../common/searchQueryUtils';
import { useAppStore } from '../../stores/appState';
import { getGlobalFiltersState } from '../page-content/usePageChrome';
import { Button } from '../ui/button';

/** Whether library filters are narrowing the current page right now. */
export function useHasActiveLibraryFilters(): boolean {
  return useAppStore(
    (state) =>
      getGlobalFiltersState(state.pageChrome) === 'applied' &&
      getConditions(state.searchQuery).some((condition) => condition.filters.length > 0),
  );
}

/** Empty-state action that removes every library filter, like the strip's "Clear all". */
export function ClearLibraryFiltersButton() {
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);

  return (
    <Button variant="outline" onClick={() => setSearchQuery([])}>
      <IconFilterOff size={16} />
      Clear filters
    </Button>
  );
}
