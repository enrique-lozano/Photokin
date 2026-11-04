import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import type { SearchFilter } from '@/common/query/filters/FilterTypes';
import { parseSearchBarInput } from '@/common/query/searchInput';
import { SearchFilterIcon } from './SearchFilterIcon';

describe('applied filter icons', () => {
  it.each([
    ['type:video', 'video'],
    ['type:photo', 'photo'],
    ['year:2024', 'calendar'],
    ['rating>=4', 'star'],
    ['person:Ana', 'users'],
    ['tag:Travel', 'tag'],
    ['no:tag', 'tag-off'],
    ['no:person', 'user-off'],
    ['has:person', 'users'],
    ['camera:Canon', 'camera'],
    ['location:Paris', 'map-pin'],
  ])('renders a decorative %s icon', (query, icon) => {
    const [filter] = parseSearchBarInput(query).filters;
    const markup = renderToStaticMarkup(<SearchFilterIcon filter={filter} />);
    expect(markup).toContain(`tabler-icon-${icon}`);
    expect(markup).toContain('aria-hidden="true"');
  });

  it('covers every filter criterion without the generic fallback', () => {
    const filters: SearchFilter[] = [
      ...parseSearchBarInput(
        'date:2024-01-01 added:2024-01-01 year:2024 month:1 day:1 weekday:1 rating:4 size:10 ' +
          'person:Ana tag:Travel person_count:1 tag_count:1 filename:photo description:Beach ' +
          'camera:Canon lens:Prime whitebalance:auto flashvalue:1 exposureprogram:auto metering:1 ' +
          'iso:100 focal:50 aperture:2.8 shutter:0.01 location:Paris type:photo',
      ).filters,
      { filterCriteria: FilterCriteria.path, operator: 'contains', value: [{ id: 'album' }] },
      { filterCriteria: FilterCriteria.rated, operator: 'equals', value: true },
      { filterCriteria: FilterCriteria.trashed, operator: 'equals', value: false },
      { filterCriteria: FilterCriteria.flash, operator: 'equals', value: true },
      { filterCriteria: FilterCriteria.locationCity, operator: 'equals', value: 'Paris' },
      { filterCriteria: FilterCriteria.locationState, operator: 'equals', value: 'State' },
      { filterCriteria: FilterCriteria.locationCountry, operator: 'equals', value: 'France' },
      { filterCriteria: FilterCriteria.locationCountryCode, operator: 'equals', value: 'FR' },
    ];
    expect(new Set(filters.map((filter) => filter.filterCriteria))).toEqual(
      new Set(Object.values(FilterCriteria)),
    );
    for (const filter of filters) {
      const markup = renderToStaticMarkup(<SearchFilterIcon filter={filter} />);
      expect(markup, filter.filterCriteria).not.toContain('tabler-icon-filter ');
    }
  });
});
