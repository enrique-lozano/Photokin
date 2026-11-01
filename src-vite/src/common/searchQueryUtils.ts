import { SearchQuery, SearchQueryType } from './fileSearchFilters';
import { SearchFilter } from './query/filters/FilterTypes';

export function getConditions(query: SearchQuery | undefined | null) {
  if (!query) return [];

  return Array.isArray(query) ? query : [query];
}

export function mergeSearchQueries(query: SearchQuery, query2: SearchQuery) {
  return [...getConditions(query), ...getConditions(query2)];
}

export function addConditionsToQuery(query: SearchQuery, filters: SearchFilter[]): SearchQuery {
  return [...getConditions(query), { filters }];
}

export function hasCondition(query: SearchQuery, filters: SearchFilter[]): boolean {
  return getConditions(query).some(_sameAndCondition(filters));
}

/** Removes an identical AND condition if present, otherwise appends it. */
export function toggleCondition(query: SearchQuery, filters: SearchFilter[]): SearchQuery {
  const matches = _sameAndCondition(filters);
  const conditions = getConditions(query);
  return conditions.some(matches)
    ? conditions.filter((condition) => !matches(condition))
    : addConditionsToQuery(query, filters);
}

function _sameAndCondition(filters: SearchFilter[]) {
  const keys = filters.map(_filterKey).sort();
  return (condition: ReturnType<typeof getConditions>[number]) =>
    condition.type !== SearchQueryType.OR &&
    condition.filters.length === filters.length &&
    condition.filters
      .map(_filterKey)
      .sort()
      .every((key, index) => key === keys[index]);
}

function _filterKey(filter: SearchFilter): string {
  return JSON.stringify([filter.filterCriteria, filter.operator, filter.value]);
}
