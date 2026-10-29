import { IconFilter } from '@tabler/icons-react';
import { getConditions } from '../../common/searchQueryUtils';
import { useAppStore } from '../../stores/appState';
import { LibraryFilterDrawer } from '../library-filters/LibraryFilterDrawer';
import { getGlobalFiltersState } from '../page-content/usePageChrome';

/**
 * The library-filter funnel, docked inside the search field: search and filters
 * both narrow the library, so they read as one control. Living inside the
 * fixed-width field, hiding it on pages it doesn't affect moves nothing.
 */
export function GlobalFilterButton() {
  const searchQuery = useAppStore((state) => state.searchQuery);
  const filtersState = useAppStore((state) => getGlobalFiltersState(state.pageChrome));

  if (filtersState === 'none') return null;

  const activeFiltersCount = getConditions(searchQuery).flatMap((condition) => condition.filters).length;
  const label = activeFiltersCount > 0 ? `Library filters (${activeFiltersCount} active)` : 'Library filters';
  const button = (disabled: boolean) => (
    <button
      type="button"
      className="toolbar-filter-button"
      aria-label={label}
      title={disabled ? undefined : label}
      data-active={activeFiltersCount > 0 || undefined}
      disabled={disabled}
    >
      <IconFilter size={15} />
      {activeFiltersCount > 0 && <span className="toolbar-filter-badge">{activeFiltersCount}</span>}
    </button>
  );

  // The page uses the filters but its current view doesn't (a person's Faces).
  // The wrapper carries the tooltip: disabled buttons don't receive hover.
  if (filtersState === 'paused') {
    return (
      <span className="toolbar-filter-button-wrap" title="Library filters apply to the Photos view">
        {button(true)}
      </span>
    );
  }

  return <LibraryFilterDrawer trigger={button(false)} />;
}
