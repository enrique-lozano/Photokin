import { describe, expect, it } from 'vitest';
import { FAVORITE_RATING } from '@/media/metadata/fields/favorite';
import { FilterCriteria } from './filters/FilterCriteria';
import { parsedSearchFilters, parseSearchBarInput } from './searchInput';

describe('parseSearchBarInput', () => {
  it('keeps plain words as free text for the semantic pass', () => {
    const parsed = parseSearchBarInput('dog on a beach');

    expect(parsed.filters).toEqual([]);
    expect(parsed.intents).toEqual([]);
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
    expect(parsed.fallbackText).toBe('');
    expect(parsed.filters).toHaveLength(2);
  });

  it('maps bare intent words to filters and keeps them for the fallback', () => {
    const parsed = parseSearchBarInput('videos');

    expect(parsed.freeText).toBe('');
    expect(parsed.fallbackText).toBe('videos');
    expect(parsed.intents.map((intent) => intent.id)).toEqual(['videos']);
    expect(parsedSearchFilters(parsed)).toEqual([
      { filterCriteria: FilterCriteria.mediaType, operator: 'equals', value: 'video' },
    ]);
  });

  it('treats favorites as a 5-star rating', () => {
    const parsed = parseSearchBarInput('favorites');

    expect(parsedSearchFilters(parsed)).toEqual([
      { filterCriteria: FilterCriteria.rating, operator: 'greaterThanOrEquals', value: FAVORITE_RATING },
    ]);
  });

  it('combines an intent with free text', () => {
    const parsed = parseSearchBarInput('beach videos');

    expect(parsed.freeText).toBe('beach');
    expect(parsed.fallbackText).toBe('beach videos');
    expect(parsed.intents).toHaveLength(1);
  });

  it('dedupes repeated intents', () => {
    const parsed = parseSearchBarInput('videos movies');

    expect(parsed.intents).toHaveLength(1);
  });

  it('lets quotes escape an intent word', () => {
    const parsed = parseSearchBarInput('"videos"');

    expect(parsed.intents).toEqual([]);
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
});
