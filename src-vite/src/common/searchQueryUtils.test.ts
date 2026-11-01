import { describe, expect, it } from 'vitest';
import { SearchQueryType, type SearchQuery } from './fileSearchFilters';
import type { SearchFilter } from './query/filters/FilterTypes';
import { FilterCriteria } from './query/filters/FilterCriteria';
import { hasCondition, toggleCondition } from './searchQueryUtils';

describe('hasCondition', () => {
  it('recognizes the same AND condition regardless of filter order', () => {
    const activeFilters: SearchFilter[] = [
      { filterCriteria: FilterCriteria.iso, operator: 'greaterThan', value: 50 },
      { filterCriteria: FilterCriteria.iso, operator: 'smallerThanOrEquals', value: 100 },
    ];
    const query: SearchQuery = [
      {
        filters: activeFilters,
      },
    ];

    expect(
      hasCondition(query, [
        { filterCriteria: FilterCriteria.iso, operator: 'smallerThanOrEquals', value: 100 },
        { filterCriteria: FilterCriteria.iso, operator: 'greaterThan', value: 50 },
      ]),
    ).toBe(true);
  });

  it('does not treat an OR condition as an identical AND condition', () => {
    expect(
      hasCondition(
        [
          {
            type: SearchQueryType.OR,
            filters: [{ filterCriteria: FilterCriteria.rating, operator: 'equals', value: 4 }],
          },
        ],
        [{ filterCriteria: FilterCriteria.rating, operator: 'equals', value: 4 }],
      ),
    ).toBe(false);
  });
});

describe('toggleCondition', () => {
  const filters: SearchFilter[] = [{ filterCriteria: FilterCriteria.year, operator: 'equals', value: 2024 }];
  const other: SearchQuery = [
    { filters: [{ filterCriteria: FilterCriteria.rating, operator: 'equals', value: 5 }] },
  ];

  it('adds the condition when missing and removes it when present', () => {
    const added = toggleCondition(other, filters);
    expect(added).toEqual([...(other as object[]), { filters }]);
    expect(toggleCondition(added, filters)).toEqual(other);
  });
});
