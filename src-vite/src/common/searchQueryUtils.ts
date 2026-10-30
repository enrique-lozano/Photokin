import { SearchQuery } from './fileSearchFilters';
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
