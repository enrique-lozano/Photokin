import { IconFilter, IconX } from '@tabler/icons-react';
import { describeFilter } from '../../common/query/filters/FilterLabels';
import { getConditions } from '../../common/searchQueryUtils';
import { useAppStore } from '../../stores/appState';
import { getGlobalFiltersState } from '../page-content/usePageChrome';
import { Button } from '../ui/button';

/**
 * Persistent strip that surfaces the active global ("library") filters below the
 * top toolbar. It is only rendered by {@link AppShell} when at least one filter
 * is active. Each pill removes its own filter; "Clear all" empties them.
 * On pages the filters don't affect it stays (muted) so they never look cleared.
 */
export function GlobalFiltersStrip() {
  const searchQuery = useAppStore((state) => state.searchQuery);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);
  const filtersState = useAppStore((state) => getGlobalFiltersState(state.pageChrome));
  const conditions = getConditions(searchQuery);

  const pills = conditions.flatMap((condition, conditionIndex) =>
    condition.filters.map((filter, filterIndex) => ({
      key: `${conditionIndex}:${filterIndex}`,
      label: describeFilter(filter),
      conditionIndex,
      filterIndex,
    })),
  );

  if (pills.length === 0) {
    return null;
  }

  const removeFilter = (conditionIndex: number, filterIndex: number) => {
    setSearchQuery(
      conditions
        .map((condition, index) =>
          index === conditionIndex
            ? { ...condition, filters: condition.filters.filter((_, position) => position !== filterIndex) }
            : condition,
        )
        .filter((condition) => condition.filters.length > 0),
    );
  };

  return (
    <div
      className={`global-filters-strip${filtersState === 'applied' ? '' : ' global-filters-strip--inactive'}`}
    >
      <span className="global-filters-strip__label">
        <IconFilter size={13} />
        Library filters
      </span>
      {filtersState !== 'applied' && (
        <span className="global-filters-strip__note">
          {filtersState === 'paused' ? 'Not applied to this view' : 'Not applied on this page'}
        </span>
      )}

      {pills.map((pill) => (
        <span className="global-filters-strip__pill" key={pill.key} title={pill.label}>
          {pill.label}
          <button
            type="button"
            className="global-filters-strip__remove"
            aria-label={`Remove filter: ${pill.label}`}
            onClick={() => removeFilter(pill.conditionIndex, pill.filterIndex)}
          >
            <IconX size={11} />
          </button>
        </span>
      ))}

      <span className="global-filters-strip__spacer" />

      <Button variant="link" size="xs" className="shrink-0" onClick={() => setSearchQuery([])}>
        Clear all
      </Button>
    </div>
  );
}
