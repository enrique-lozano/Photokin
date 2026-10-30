import { describe, expect, it } from 'vitest';
import { FilterCriteria } from '../FilterCriteria';
import { filterToString, strToFilter } from '../FilterParser';
import {
  dateCommonFilters,
  listCommonFilters,
  numberCommonFilters,
  type SearchQueryFilterTestData,
} from './SearchQueryFilterTestData';

describe('Filter to string test', function () {
  it.each<SearchQueryFilterTestData>(dateCommonFilters)(
    'Convert filter by date $filter.value with operator $filter.operator',
    ({ queryStr, filter }) => {
      expect(filterToString(filter)).toBe(queryStr);
    },
  );

  it.each<SearchQueryFilterTestData>(numberCommonFilters)(
    'Convert filter by number:$filter.value with operator $filter.operator',
    ({ queryStr, filter }) => {
      expect(filterToString(filter)).toBe(queryStr);
    },
  );

  it.each<SearchQueryFilterTestData>(listCommonFilters)(
    'Convert list filter $queryStr',
    ({ queryStr, filter }) => {
      expect(filterToString(filter)).toBe(queryStr);
    },
  );

  it('serializes tag entities by name', () => {
    expect(
      filterToString({
        filterCriteria: FilterCriteria.tag,
        operator: 'contains',
        value: [
          { id: '1', parentId: null, name: 'Yosemite', color: null },
          { id: '2', parentId: null, name: 'Hiking', color: null },
        ],
      }),
    ).toBe('tag:Yosemite,Hiking');
  });

  it('serializes album path filters by id', () => {
    expect(
      filterToString({
        filterCriteria: FilterCriteria.path,
        operator: 'contains',
        value: [{ id: 'album-1' }, { id: 'album-2' }],
      }),
    ).toBe('path:album-1,album-2');
  });
});

describe('String to filter test', function () {
  it.each<SearchQueryFilterTestData>(dateCommonFilters)(
    'Convert string $queryStr to date filter',
    ({ queryStr, filter }) => {
      const filtersRes = strToFilter(queryStr);

      expect(filtersRes).toBeDefined();
      expect(filtersRes).not.toEqual([]);

      if (!filtersRes) throw Error('');

      expect(filtersRes[0]).toEqual(filter);
    },
  );

  it.each<SearchQueryFilterTestData>(numberCommonFilters)(
    'Convert string $queryStr to number filter',
    ({ queryStr, filter }) => {
      const filtersRes = strToFilter(queryStr);

      expect(filtersRes).toBeDefined();
      expect(filtersRes).not.toEqual([]);

      if (!filtersRes) throw Error('');

      expect(filtersRes[0]).toEqual(filter);
    },
  );

  it.each<SearchQueryFilterTestData>(listCommonFilters)(
    'Convert string $queryStr to list filter',
    ({ queryStr, filter }) => {
      const filtersRes = strToFilter(queryStr);

      expect(filtersRes).toBeDefined();
      expect(filtersRes).not.toEqual([]);

      if (!filtersRes) throw Error('');

      expect(filtersRes[0]).toEqual(filter);
    },
  );

  it('treats a token with no operator as free text, not a filter', () => {
    expect(strToFilter('beach')).toBeUndefined();
  });

  it('strips wrapping quotes from text filter values', () => {
    expect(strToFilter('filename:"foo bar"')).toEqual([
      {
        filterCriteria: FilterCriteria.filename,
        operator: 'equals',
        value: 'foo bar',
      },
    ]);
  });
});
