import { SearchCondition } from './fileSearchFilters';
import { FilterCriteria } from './query/filters/FilterCriteria';

/**
 * Search condition that matches only trashed assets. Merged into a page query
 * to power the Trash tab; its presence also tells the asset queries to stop
 * hiding trashed rows (see `addWhereConditionsToQuery`).
 */
export const TRASHED_ONLY_CONDITION: SearchCondition = {
  filters: [{ filterCriteria: FilterCriteria.trashed, operator: 'equals', value: true }],
};

/** A standalone query matching only trashed assets. */
export const TRASHED_ONLY_QUERY = [TRASHED_ONLY_CONDITION];
