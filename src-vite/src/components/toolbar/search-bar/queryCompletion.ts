import { strToFilter } from '@/common/query/filters/FilterParser';
import {
  FilterCriteria,
  DateRangeFilterCriteria,
  NumberRangeFilterCriteria,
  TextFilterCriteria,
} from '@/common/query/filters/FilterCriteria';
import { numberOperators, stringOperators } from '@/common/query/operators/Operators';
import {
  decodeQueryValue,
  lexQuery,
  QuerySpan,
  QueryToken,
  quoteQueryValue,
  splitQuerySpans,
} from '@/common/query/queryLexer';
import { getFilterCriteria, SEARCH_KEYWORDS } from '@/common/query/searchKeywords';
import { FAVORITE_RATING } from '@/media/metadata/fields/favorite';
import { isIn } from '@/utils/array.utils';

export interface QuerySuggestion {
  id: string;
  label: string;
  detail: string;
  text: string;
  kind: 'field' | 'operator' | 'value' | 'token' | 'more' | 'recent';
}

export interface CompletionContext {
  kind: 'field' | 'operator' | 'value';
  key: string;
  query: string;
  span: QuerySpan;
  token?: QueryToken;
}

export function recentSearchSuggestions(queries: string[], input: string): QuerySuggestion[] {
  const text = input.trim().toLowerCase();
  return queries
    .filter((query) => query.toLowerCase().includes(text))
    .slice(0, 3)
    .map((query) => ({
      id: `recent:${query}`,
      text: query,
      label: query,
      detail: query,
      kind: 'recent',
    }));
}

const FIELD_HELP: Record<string, [string, string]> = {
  type: ['Media type', 'Photos or videos'],
  person: ['Person', 'Confirmed, named people'],
  tag: ['Tag', 'Name or full tag path'],
  rating: ['Rating', '0 to 5 stars'],
  date: ['Date taken', 'YYYY-MM-DD'],
  after: ['Taken on or after', 'YYYY-MM-DD'],
  before: ['Taken on or before', 'YYYY-MM-DD'],
  added: ['Date added', 'YYYY-MM-DD'],
  year: ['Year', '2024 or 2020..2024'],
  month: ['Month', '1 to 12'],
  day: ['Day of month', '1 to 31'],
  weekday: ['Weekday', '0 = Sunday, 6 = Saturday'],
  size: ['File size', 'MB, e.g. size>10'],
  person_count: ['Detected face count', 'Follows the count-unverified-faces setting'],
  tag_count: ['Assigned tag count', 'File tags, not face associations'],
  filename: ['File name', 'Use ~ to find text inside a name'],
  description: ['Description', 'Use ~ to find text inside a description'],
  camera: ['Camera', 'Make and model'],
  lens: ['Lens', 'Lens name'],
  iso: ['ISO', 'e.g. iso>=3200'],
  focal: ['Focal length', 'mm, e.g. focal<=24'],
  aperture: ['Aperture', 'f-number, e.g. aperture<=2'],
  shutter: ['Shutter speed', 'Seconds, e.g. shutter>=1'],
  location: ['Location', 'Stored place name'],
  has: ['Has', 'Assigned tags or detected faces'],
  no: ['No', 'No assigned tags or detected faces'],
};

export function fieldHelp(key: string): [string, string] {
  const canonical =
    SEARCH_KEYWORDS.find((entry) => entry.key === key || entry.aliases?.includes(key))?.key ?? key;
  return FIELD_HELP[canonical] ?? [canonical, 'Enter a value'];
}

export function fieldOperators(key: string): string[] {
  const criteria = getFilterCriteria(key);
  if (criteria && isIn(TextFilterCriteria, criteria)) return Object.values(stringOperators).flat();
  if (criteria && (isIn(NumberRangeFilterCriteria, criteria) || isIn(DateRangeFilterCriteria, criteria))) {
    return Object.values(numberOperators).flat();
  }
  return [':', '='];
}

export function completionContext(input: string, start: number, end = start): CompletionContext | null {
  const token = lexQuery(input).find(
    (entry) => start >= entry.start && start <= entry.end && end <= entry.end,
  );
  if (start !== end && !token) return null;
  if (!token) return { kind: 'field', key: '', query: '', span: { start, end, text: '' } };
  if (token.quoted) return null;
  if (!token.key || !token.operator || !token.value) {
    return { kind: 'field', key: '', query: token.text, span: token, token };
  }
  const key = token.key.text.toLowerCase();
  if (start < token.key.end && end <= token.key.end) {
    return { kind: 'field', key, query: token.key.text, span: token.key, token };
  }
  if (!getFilterCriteria(key) && key !== 'has' && key !== 'no') return null;
  if (start < token.operator.end && end <= token.operator.end) {
    return { kind: 'operator', key, query: token.operator.text, span: token.operator, token };
  }
  if (start < token.value.start) return null;
  const members =
    key === 'person' || key === 'tag'
      ? splitQuerySpans(token.value.text, /,/, token.value.start)
      : [token.value];
  const span = members.find((member) => start >= member.start && end <= member.end);
  if (!span) return null;
  return { kind: 'value', key, query: decodeQueryValue(span.text), span, token };
}

function _matchRank(terms: string[], query: string): number {
  const q = query.toLowerCase();
  const normalized = terms.map((term) => term.toLowerCase());
  if (normalized.some((term) => term === q)) return 0;
  if (normalized.some((term) => term.startsWith(q))) return 1;
  if (normalized.some((term) => term.includes(q))) return 2;
  return 3;
}

export function matchingValues(values: QuerySuggestion[], query: string, limit = 50) {
  const ranked = values
    .map((value) => ({ value, rank: _matchRank([value.label, value.text], query) }))
    .filter((entry) => entry.rank < 3)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.value.label.localeCompare(b.value.label) ||
        a.value.text.localeCompare(b.value.text),
    );
  return { items: ranked.slice(0, limit).map((entry) => entry.value), truncated: ranked.length > limit };
}

export function fieldSuggestions(query: string, more: boolean): QuerySuggestion[] {
  const fields = [
    ...SEARCH_KEYWORDS.map((entry) => ({
      id: entry.key,
      label: fieldHelp(entry.key)[0],
      detail: `${entry.key}: - ${fieldHelp(entry.key)[1]}`,
      text: entry.key,
      kind: 'field' as const,
      aliases: entry.aliases ?? [],
    })),
    ...['has', 'no'].map((key) => ({
      id: key,
      label: fieldHelp(key)[0],
      detail: `${key}: - ${fieldHelp(key)[1]}`,
      text: key,
      kind: 'field' as const,
      aliases: [],
    })),
  ];
  if (query) {
    return fields
      .map((value) => ({ value, rank: _matchRank([value.text, value.label, ...value.aliases], query) }))
      .filter((entry) => entry.rank < 3)
      .sort((a, b) => a.rank - b.rank || a.value.label.localeCompare(b.value.label))
      .map((entry) => entry.value);
  }
  if (more) return fields.sort((a, b) => a.label.localeCompare(b.label));
  return [
    ...['type', 'person', 'tag', 'rating', 'date', 'has', 'no'].flatMap((key) =>
      fields.filter((field) => field.text === key),
    ),
    {
      id: 'favorites',
      label: 'Favorites',
      detail: `rating>=${FAVORITE_RATING}`,
      text: `rating>=${FAVORITE_RATING}`,
      kind: 'token',
    },
    { id: 'more', label: 'More filters', detail: 'Dates, camera, location and more', text: '', kind: 'more' },
  ];
}

export function presenceSuggestions(key: string): QuerySuggestion[] {
  return ['tag', 'person'].map((value) => ({
    id: `${key}:${value}`,
    label: `${key === 'has' ? 'Has' : 'No'} ${value === 'tag' ? 'assigned tags' : 'detected faces'}`,
    detail:
      value === 'tag'
        ? 'Counts assigned file tags, not face associations'
        : 'Includes unnamed faces; follows the count-unverified-faces setting',
    text: `${key}:${value}`,
    kind: 'token',
  }));
}

export function staticValueSuggestions(context: CompletionContext): QuerySuggestion[] {
  const criteria = getFilterCriteria(context.key);
  if (context.key === 'has' || context.key === 'no') {
    return presenceSuggestions(context.key).filter((item) =>
      item.text.split(':')[1].includes(context.query.toLowerCase()),
    );
  }
  const values =
    criteria === FilterCriteria.mediaType
      ? [
          { text: 'photo', label: 'Photos' },
          { text: 'video', label: 'Videos' },
        ]
      : criteria === FilterCriteria.rating
        ? Array.from({ length: 6 }, (_, value) => ({ text: String(value), label: `${value} stars` }))
        : [];
  const items: QuerySuggestion[] = matchingValues(
    values.map((value) => ({
      ...value,
      id: value.text,
      detail: `${context.key}${context.token?.operator?.text ?? ':'}${value.text}`,
      kind: 'value',
    })),
    context.query,
  ).items;
  if (criteria === FilterCriteria.rating && !context.query) {
    items.push({
      id: 'high-rating',
      label: 'At least 4 stars',
      detail: 'rating>=4',
      text: 'rating>=4',
      kind: 'token',
    });
  }
  if ((context.key === 'person' || context.key === 'tag') && !context.query) {
    items.unshift(
      ...presenceSuggestions('has').filter((item) => item.text.endsWith(context.key)),
      ...presenceSuggestions('no').filter((item) => item.text.endsWith(context.key)),
    );
  }
  return items;
}

export function operatorSuggestions(key: string): QuerySuggestion[] {
  const labels: Record<string, string> = {
    ':': 'Equals',
    '=': 'Equals',
    '!=': 'Not equal to',
    '~': 'Contains',
    '~=': 'Contains',
    '>': 'Greater than',
    '>=': 'At least',
    '<': 'Less than',
    '<=': 'At most',
  };
  return fieldOperators(key).map((text) => ({
    id: text,
    label: labels[text],
    detail: text,
    text,
    kind: 'operator',
  }));
}

/**
 * While a filter has no value yet, typing an operator replaces the current one
 * (`date>` + `<` → `date<`) instead of producing an invalid `><`. Keystrokes that
 * extend it into a longer valid operator (`>` + `=` → `>=`) are left alone.
 */
export function replaceTypedOperator(input: string, caret: number, typed: string) {
  const context = completionContext(input, caret);
  const token = context?.token;
  if (!context || !token?.operator || !token.value || token.value.text || caret !== token.operator.end)
    return null;
  const operators = fieldOperators(context.key);
  if (operators.includes(token.operator.text + typed)) return null;
  const operator = typed === '!' ? '!=' : typed;
  if (!operators.includes(operator)) return null;
  return applyCompletion(
    input,
    { ...context, span: token.operator },
    {
      id: operator,
      label: operator,
      detail: operator,
      text: operator,
      kind: 'operator',
    },
  );
}

export function applyCompletion(input: string, context: CompletionContext, suggestion: QuerySuggestion) {
  if (suggestion.kind === 'recent')
    return { value: suggestion.text, caret: suggestion.text.length, open: false };
  let span = context.span;
  let text = suggestion.text;
  let open = false;
  if (suggestion.kind === 'field') {
    const token = context.token;
    const compatible =
      token?.operator &&
      token.value &&
      fieldOperators(text).includes(token.operator.text) &&
      (() => {
        try {
          return !!strToFilter(`${text}${token.operator.text}${token.value.text}`)?.length;
        } catch {
          return false;
        }
      })();
    if (compatible && token?.key) {
      span = token.key;
    } else {
      span = token ?? span;
      text += ':';
    }
    open = true;
  } else if (suggestion.kind === 'token') {
    span = context.token ?? span;
  } else if (suggestion.kind === 'value') {
    text = quoteQueryValue(text);
  } else if (suggestion.kind === 'operator') {
    open = true;
  }
  let value = input.slice(0, span.start) + text + input.slice(span.end);
  let caret = span.start + text.length;
  if (!open && span.end === input.length) {
    value += ' ';
    caret++;
  }
  if (suggestion.kind === 'field' && span === context.token?.key) {
    caret += context.token.operator?.text.length ?? 0;
  }
  return { value, caret, open };
}
