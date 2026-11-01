import { describe, expect, it } from 'vitest';
import {
  applyCompletion,
  completionContext,
  fieldSuggestions,
  matchingValues,
  operatorSuggestions,
  QuerySuggestion,
  staticValueSuggestions,
  recentSearchSuggestions,
} from './queryCompletion';
import { parseSearchBarInput } from '@/common/query/searchInput';
import { replaceTypedOperator } from './queryCompletion';
import { SEARCH_KEYWORDS } from '@/common/query/searchKeywords';

const value = (text: string): QuerySuggestion => ({ id: text, label: text, detail: '', text, kind: 'value' });
const field = (text: string): QuerySuggestion => ({ ...value(text), kind: 'field' });

describe('cursor-aware completion', () => {
  it('shows at most three newest history matches, filtering before limiting', () => {
    const queries = ['mountains', 'Beach sunset', 'person:Ana beach', 'beach rating>=4', 'old beach'];
    expect(recentSearchSuggestions(queries, '').map((item) => item.text)).toEqual(queries.slice(0, 3));
    expect(recentSearchSuggestions(queries, '  BEACH  ').map((item) => item.text)).toEqual([
      'Beach sunset',
      'person:Ana beach',
      'beach rating>=4',
    ]);
    expect(recentSearchSuggestions(queries, 'rating>').map((item) => item.text)).toEqual(['beach rating>=4']);
    expect(recentSearchSuggestions(queries, 'missing')).toEqual([]);
    expect(recentSearchSuggestions([], '')).toEqual([]);
    expect(recentSearchSuggestions(queries, 'Ana beach')[0].kind).toBe('recent');
  });
  it('restores a recent query exactly without appending spaces or keeping a partial draft', () => {
    const text = 'person:"Ana Lopez"  beach rating>=4';
    expect(
      applyCompletion('old draft', completionContext('old draft', 0)!, {
        id: `recent:${text}`,
        kind: 'recent',
        text,
        label: text,
        detail: text,
      }),
    ).toEqual({ value: text, caret: text.length, open: false });
  });
  it('replaces an empty operator with a newly typed one without backtracking', () => {
    expect(replaceTypedOperator('rating:', 7, '>')).toEqual({ value: 'rating>', caret: 7, open: true });
    expect(replaceTypedOperator('camera:', 7, '~')?.value).toBe('camera~');
    expect(replaceTypedOperator('rating:', 7, '!')?.value).toBe('rating!=');
    expect(replaceTypedOperator('date>', 5, '<')?.value).toBe('date<');
    expect(replaceTypedOperator('rating>=', 8, '<')?.value).toBe('rating<');
    expect(replaceTypedOperator('rating!=', 8, ':')?.value).toBe('rating:');
    expect(replaceTypedOperator('date>', 5, '=')).toBeNull();
    expect(replaceTypedOperator('camera~', 7, '=')).toBeNull();
    expect(replaceTypedOperator('rating:4', 8, '>')).toBeNull();
    expect(replaceTypedOperator('person:', 7, '>')).toBeNull();
    expect(replaceTypedOperator('rating:', 6, '>')).toBeNull();
    expect(replaceTypedOperator('rating:', 7, '4')).toBeNull();
  });
  it('opens starters on empty input and blank tokens, not unrelated words or quoted phrases', () => {
    expect(completionContext('', 0)?.query).toBe('');
    expect(completionContext('beach ', 6)?.query).toBe('');
    expect(fieldSuggestions('beach', false)).toEqual([]);
    expect(completionContext('"person:Ana"', 5)).toBeNull();
    expect(completionContext('person:Ana beach', 4, 13)).toBeNull();
  });

  it('resolves key, operator and value under the caret', () => {
    expect(completionContext('rating>=4', 2)?.kind).toBe('field');
    expect(completionContext('rating>=4', 6)?.kind).toBe('operator');
    expect(completionContext('rating>=4', 8)?.kind).toBe('value');
    expect(completionContext('person:', 7)?.kind).toBe('value');
  });

  it('replaces only the value in the middle of a query', () => {
    const input = 'beach person:Ana rating>=4';
    const context = completionContext(input, 14)!;
    expect(applyCompletion(input, context, value('Luis'))).toEqual({
      value: 'beach person:Luis rating>=4',
      caret: 17,
      open: false,
    });
  });

  it('replaces a list member without removing other members', () => {
    const input = 'tag:Ana,Luis snow';
    expect(applyCompletion(input, completionContext(input, 10)!, value('Travel/Ana, Jo')).value).toBe(
      'tag:Ana,"Travel/Ana, Jo" snow',
    );
  });

  it('quotes special values and appends one space only at the end', () => {
    const result = applyCompletion(
      'person:An',
      completionContext('person:An', 9)!,
      value('People/A "quote": \\ Ana'),
    );
    expect(result.value.endsWith(' ')).toBe(true);
    expect(parseSearchBarInput(result.value).filters[0].value).toEqual(['People/A "quote": \\ Ana']);
  });

  it('preserves compatible operators/values on field replacement, resets incompatible tokens', () => {
    expect(
      applyCompletion('rating>=4 snow', completionContext('rating>=4 snow', 2)!, field('iso')).value,
    ).toBe('iso>=4 snow');
    expect(
      applyCompletion('rating>=4 snow', completionContext('rating>=4 snow', 2)!, field('person')).value,
    ).toBe('person: snow');
  });

  it('presence replaces the entire active token', () => {
    const context = completionContext('tag:', 4)!;
    const suggestion = staticValueSuggestions(context).find((item) => item.text === 'no:tag')!;
    expect(applyCompletion('tag:', context, suggestion)).toEqual({ value: 'no:tag ', caret: 7, open: false });
    expect(staticValueSuggestions(completionContext('has:', 4)!).map((item) => item.text)).toEqual([
      'has:tag',
      'has:person',
    ]);
  });

  it('keeps every keyword discoverable and matches aliases', () => {
    const fields = fieldSuggestions('', true).map((item) => item.text);
    expect(SEARCH_KEYWORDS.every((entry) => fields.includes(entry.key))).toBe(true);
    expect(fieldSuggestions('focallength', false)[0].text).toBe('focal');
    expect(operatorSuggestions('tag').map((item) => item.text)).toEqual([':', '=']);
    expect(operatorSuggestions('rating').map((item) => item.text)).toContain('!=');
  });

  it('ranks exact before prefixes before substrings and caps dynamic values at exactly 50', () => {
    const values = [
      value('Joanna'),
      value('Ana Lopez'),
      value('Ana'),
      ...Array.from({ length: 60 }, (_, i) => value(`Ana ${i}`)),
    ];
    const result = matchingValues(values, 'Ana');
    expect(result.items[0].text).toBe('Ana');
    expect(result.items).toHaveLength(50);
    expect(result.truncated).toBe(true);
    expect(matchingValues(values, 'missing')).toEqual({ items: [], truncated: false });
  });
});
