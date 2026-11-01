import { describe, expect, it } from 'vitest';
import { FilterCriteria } from './filters/FilterCriteria';
import { parseSearchBarInput } from './searchInput';
import { quoteQueryValue } from './queryLexer';

describe('parseSearchBarInput', () => {
  it('keeps plain words as free text for the semantic pass', () => {
    const parsed = parseSearchBarInput('dog on a beach');

    expect(parsed.filters).toEqual([]);
    expect(parsed.freeText).toBe('dog on a beach');
  });

  it('splits key:value tokens out of the free text', () => {
    const parsed = parseSearchBarInput('rating>4 sunset');

    expect(parsed.freeText).toBe('sunset');
    expect(parsed.filters).toEqual([
      { filterCriteria: FilterCriteria.rating, operator: 'greaterThan', value: 4 },
    ]);
  });

  it('handles the filter appearing after the free text', () => {
    const parsed = parseSearchBarInput('beach rating>3');

    expect(parsed.freeText).toBe('beach');
    expect(parsed.filters).toHaveLength(1);
  });

  it('leaves no free text when every token is structured', () => {
    const parsed = parseSearchBarInput('size>5000 rating<2');

    expect(parsed.freeText).toBe('');
    expect(parsed.filters).toHaveLength(2);
  });

  it('never guesses filters from ordinary words', () => {
    const parsed = parseSearchBarInput('beach videos photos favorites movies');
    expect(parsed.freeText).toBe('beach videos photos favorites movies');
    expect(parsed.filters).toEqual([]);
  });

  it('lets quotes escape an intent word', () => {
    const parsed = parseSearchBarInput('"videos"');

    expect(parsed.freeText).toBe('videos');
  });

  it('keeps a quoted phrase together', () => {
    const parsed = parseSearchBarInput('"summer trip" beach');

    expect(parsed.freeText).toBe('summer trip beach');
  });

  it('keeps quoted values attached to their keyword', () => {
    const parsed = parseSearchBarInput('person:"Ana Lopez" beach');

    expect(parsed.freeText).toBe('beach');
    expect(parsed.filters).toEqual([
      { filterCriteria: FilterCriteria.person, operator: 'contains', value: ['Ana Lopez'] },
    ]);
  });

  it('falls back to free text for unknown keywords', () => {
    const parsed = parseSearchBarInput('foo:bar');

    expect(parsed.filters).toEqual([]);
    expect(parsed.freeText).toBe('foo:bar');
  });

  it('expands a numeric range into two filters', () => {
    const parsed = parseSearchBarInput('year:2019..2021');

    expect(parsed.filters).toEqual([
      { filterCriteria: FilterCriteria.year, operator: 'greaterThanOrEquals', value: 2019 },
      { filterCriteria: FilterCriteria.year, operator: 'smallerThanOrEquals', value: 2021 },
    ]);
  });

  it('returns empty results for blank input', () => {
    const parsed = parseSearchBarInput('   ');

    expect(parsed.filters).toEqual([]);
    expect(parsed.freeText).toBe('');
  });

  it.each([
    ['has:tag', FilterCriteria.tag_count, 'greaterThan'],
    ['no:tag', FilterCriteria.tag_count, 'equals'],
    ['has:person', FilterCriteria.person_count, 'greaterThan'],
    ['no:person', FilterCriteria.person_count, 'equals'],
  ])('expands %s into an existing count filter', (query, filterCriteria, operator) => {
    expect(parseSearchBarInput(query).filters).toEqual([{ filterCriteria, operator, value: 0 }]);
  });

  it.each([
    'rating:abc',
    'rating:',
    'rating:NaN',
    'rating:Infinity',
    'rating=5..3',
    'year=2020..',
    'date:2024-02-30',
    'date:2024-13-01',
    'person:',
    'tag~Ana',
    'type:audio',
    'has:camera',
    'no>person',
    'person:"Ana',
  ])('preserves invalid known filter %s as literal text with a notice', (query) => {
    const parsed = parseSearchBarInput(query);
    expect(parsed.filters).toEqual([]);
    expect(parsed.freeText).toBe(query);
    expect(parsed.notices).toHaveLength(1);
    expect(parsed.textQuery).toBe(query);
  });

  it('does not diagnose unknown keywords or quoted ordinary phrases', () => {
    const parsed = parseSearchBarInput('"rating:abc" foo:bar');
    expect(parsed.notices).toEqual([]);
    expect(parsed.freeText).toBe('rating:abc foo:bar');
    expect(parsed.textQuery).toBe('"rating:abc" foo:bar');
  });

  it('supports != and preserves list OR versus separate-token AND', () => {
    const parsed = parseSearchBarInput('rating!=3 person:Ana,Luis person:Jo');
    expect(parsed.filters).toEqual([
      { filterCriteria: FilterCriteria.rating, operator: 'notEquals', value: 3 },
      { filterCriteria: FilterCriteria.person, operator: 'contains', value: ['Ana', 'Luis'] },
      { filterCriteria: FilterCriteria.person, operator: 'contains', value: ['Jo'] },
    ]);
  });

  it('round-trips special characters and quoted commas in individual list members', () => {
    const names = ['Trips/Ana, Luis', 'People/A "quote": >= \\ name'];
    const parsed = parseSearchBarInput(`tag:${names.map(quoteQueryValue).join(',')} beach`);
    expect(parsed.filters[0].value).toEqual(names);
    expect(parsed.freeText).toBe('beach');
    expect(parsed.textQuery).toBe('beach');
  });

  it('validates leap days and retains backslashes outside quotes', () => {
    expect(parseSearchBarInput('date:2024-02-29').filters).toHaveLength(1);
    expect(parseSearchBarInput('date:0000-02-29').filters).toHaveLength(1);
    expect(parseSearchBarInput('date:2023-02-29').notices).toHaveLength(1);
    expect(parseSearchBarInput('folder\\name').freeText).toBe('folder\\name');
  });
});
