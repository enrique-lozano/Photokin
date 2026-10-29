import { FilterCriteria } from './filters/FilterCriteria';

export interface SearchKeyword {
  /** Canonical keyword, as typed in the search bar (`rating>4`). */
  key: string;
  criteria: FilterCriteria;
  /** Extra spellings the parser also accepts. */
  aliases?: readonly string[];
}

/**
 * Every `key:value` keyword the search bar understands, and the filter each one
 * builds. This is the single source of truth for what can be typed: the parser
 * resolves tokens through {@link getFilterCriteria}.
 *
 * NOTE: `path` is deliberately absent. Typed values arrive as names, and only
 * tags/people can be resolved back to entities; album paths are picked in the
 * filter drawer instead, which supplies real ids.
 */
export const SEARCH_KEYWORDS: readonly SearchKeyword[] = [
  { key: 'date', criteria: FilterCriteria.date },
  { key: 'after', criteria: FilterCriteria.date },
  { key: 'before', criteria: FilterCriteria.date },
  { key: 'added', criteria: FilterCriteria.dateAdded, aliases: ['dateadded', 'date_added'] },
  { key: 'year', criteria: FilterCriteria.year },
  { key: 'month', criteria: FilterCriteria.month },
  { key: 'day', criteria: FilterCriteria.day },
  { key: 'weekday', criteria: FilterCriteria.weekday },
  { key: 'rating', criteria: FilterCriteria.rating },
  { key: 'size', criteria: FilterCriteria.size },
  { key: 'person', criteria: FilterCriteria.person },
  { key: 'tag', criteria: FilterCriteria.tag },
  { key: 'person_count', criteria: FilterCriteria.person_count },
  { key: 'tag_count', criteria: FilterCriteria.tag_count },
  { key: 'filename', criteria: FilterCriteria.filename },
  { key: 'description', criteria: FilterCriteria.description },
  { key: 'camera', criteria: FilterCriteria.camera },
  { key: 'lens', criteria: FilterCriteria.lens },
  { key: 'iso', criteria: FilterCriteria.iso },
  { key: 'focal', criteria: FilterCriteria.focalLength, aliases: ['focallength', 'focal_length'] },
  { key: 'aperture', criteria: FilterCriteria.aperture },
  { key: 'shutter', criteria: FilterCriteria.shutterSpeed, aliases: ['shutterspeed', 'shutter_speed'] },
  { key: 'location', criteria: FilterCriteria.location },
  { key: 'type', criteria: FilterCriteria.mediaType, aliases: ['is'] },
];

const _CRITERIA_BY_KEY: ReadonlyMap<string, FilterCriteria> = new Map(
  SEARCH_KEYWORDS.flatMap((keyword) => [
    [keyword.key, keyword.criteria] as const,
    ...(keyword.aliases ?? []).map((alias) => [alias, keyword.criteria] as const),
  ]),
);

/** The criteria a typed keyword maps to, or `undefined` when unknown. */
export function getFilterCriteria(key: string): FilterCriteria | undefined {
  return _CRITERIA_BY_KEY.get(key.trim().toLowerCase());
}
