import { SearchFilter } from './query/filters/FilterTypes';

/**
 * Enum representing logical operators for combining search conditions.
 */
export enum SearchQueryType {
  AND,
  OR,
}

export type SearchCondition = {
  filters: SearchFilter[];
  type?: SearchQueryType;
};

/**
 * Type definition for a search query consisting of multiple conditions,
 * each potentially with its own logical operator.
 *
 * The conditions that form this query all are joined by an `AND`
 */
export type SearchQuery = SearchCondition[] | SearchCondition;
