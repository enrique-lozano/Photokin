import type { AssetInClient } from '@/db/models/AssetInClient';
import type { TimelineGroupBy, TimelineSortBy } from '@/stores/settingsStore';

/** Groups that bucket photos by a calendar unit (served by the month-section timeline). */
export function isDateGrouping(groupBy: TimelineGroupBy): boolean {
  return groupBy === 'day' || groupBy === 'month' || groupBy === 'year';
}

/** Whether the natural sort order of a field is descending (newest / best / largest first). */
function _isNaturallyDescending(sortBy: TimelineSortBy): boolean {
  return sortBy !== 'fileName';
}

/** The direction actually applied once the user's "reverse" flag is taken into account. */
export function effectiveSortDirection(sortBy: TimelineSortBy, reversed: boolean): 'asc' | 'desc' {
  const descending = _isNaturallyDescending(sortBy) !== reversed;
  return descending ? 'desc' : 'asc';
}

export function sectionDirectionLabel(groupBy: TimelineGroupBy, reversed: boolean): string {
  if (groupBy === 'rating') return reversed ? 'Worst first' : 'Best first';
  if (groupBy === 'place') return reversed ? 'Z → A' : 'A → Z';
  return reversed ? 'Oldest first' : 'Newest first';
}

export function sortDirectionLabel(sortBy: TimelineSortBy, reversed: boolean): string {
  switch (sortBy) {
    case 'fileName':
      return reversed ? 'Z → A' : 'A → Z';
    case 'rating':
      return reversed ? 'Worst first' : 'Best first';
    case 'fileSize':
      return reversed ? 'Smallest first' : 'Largest first';
    default:
      return reversed ? 'Oldest first' : 'Newest first';
  }
}

function _hashWithSeed(id: string, seed: number): number {
  let hash = 2166136261 ^ seed;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function _compareByDateTaken(a: AssetInClient, b: AssetInClient): number {
  return b.metadata.date.getTime() - a.metadata.date.getTime();
}

/** Returns a sorted copy. Ties fall back to newest-first, then id, so the order is stable. */
export function sortAssets(
  images: AssetInClient[],
  sortBy: TimelineSortBy,
  reversed: boolean,
  seed: number,
): AssetInClient[] {
  const sign = reversed ? -1 : 1;
  const natural = (a: AssetInClient, b: AssetInClient): number => {
    switch (sortBy) {
      case 'dateAdded':
        return b.dateAdded.getTime() - a.dateAdded.getTime();
      case 'fileName':
        return a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' });
      case 'rating':
        return (b.metadata.rating ?? 0) - (a.metadata.rating ?? 0);
      case 'fileSize':
        return b.filesize - a.filesize;
      case 'random':
        return _hashWithSeed(a.id, seed) - _hashWithSeed(b.id, seed);
      default:
        return _compareByDateTaken(a, b);
    }
  };

  return [...images].sort((a, b) => {
    const primary = natural(a, b) * (sortBy === 'random' ? 1 : sign);
    if (primary !== 0) return primary;
    return _compareByDateTaken(a, b) || a.id.localeCompare(b.id);
  });
}

export interface FlatGroup {
  key: string;
  label: string;
  /** Position in the natural order (lower first); `Infinity` pins the group last. */
  rank: number | string;
  images: AssetInClient[];
}

const NO_LOCATION_KEY = '__none__';

function _placeOf(image: AssetInClient): string | null {
  const location = image.metadata.location;
  const place = location?.city || location?.state || location?.country || location?.name;
  return place?.trim() || null;
}

function _ratingLabel(rating: number, favoritesMode: boolean): string {
  if (favoritesMode) return rating >= 5 ? 'Favorites' : 'Not favorites';
  if (rating <= 0) return 'Unrated';
  return rating === 1 ? '1 star' : `${rating} stars`;
}

/**
 * Buckets photos for the groupings that aren't calendar-based. `none` is a single
 * unlabelled group. Groups come back in their order for the given reversal flag.
 */
export function groupAssets(
  images: AssetInClient[],
  groupBy: 'none' | 'rating' | 'place',
  options: { reversed: boolean; favoritesMode: boolean },
): FlatGroup[] {
  if (groupBy === 'none') {
    return images.length ? [{ key: 'all', label: '', rank: 0, images }] : [];
  }

  const groups = new Map<string, FlatGroup>();
  for (const image of images) {
    let key: string;
    let label: string;
    let rank: number | string;
    if (groupBy === 'rating') {
      const raw = Math.min(5, Math.max(0, image.metadata.rating ?? 0));
      const rating = options.favoritesMode ? (raw >= 5 ? 5 : 0) : raw;
      key = String(rating);
      label = _ratingLabel(rating, options.favoritesMode);
      rank = rating;
    } else {
      const place = _placeOf(image);
      key = place ? `place:${place}` : NO_LOCATION_KEY;
      label = place ?? 'No location';
      rank = place ?? '';
    }
    const group = groups.get(key);
    if (group) group.images.push(image);
    else groups.set(key, { key, label, rank, images: [image] });
  }

  const direction = options.reversed ? -1 : 1;
  return [...groups.values()].sort((a, b) => {
    if (a.key === NO_LOCATION_KEY) return 1;
    if (b.key === NO_LOCATION_KEY) return -1;
    if (groupBy === 'rating') return ((b.rank as number) - (a.rank as number)) * direction;
    return String(a.rank).localeCompare(String(b.rank), undefined, { sensitivity: 'base' }) * direction;
  });
}

const GROUP_NAMES: Record<TimelineGroupBy, string> = {
  none: 'No sections',
  day: 'Day',
  month: 'Month',
  year: 'Year',
  rating: 'Rating',
  place: 'Place',
};

const SORT_NAMES: Record<TimelineSortBy, string> = {
  dateTaken: 'Date taken',
  dateAdded: 'Date added',
  fileName: 'File name',
  rating: 'Rating',
  fileSize: 'File size',
  random: 'Random',
};

export function groupName(groupBy: TimelineGroupBy): string {
  return GROUP_NAMES[groupBy];
}

export function sortName(sortBy: TimelineSortBy): string {
  return SORT_NAMES[sortBy];
}

/** Chip label, e.g. `Day · Date taken ↓`. */
export function summarizeLabel(
  groupBy: TimelineGroupBy,
  sortBy: TimelineSortBy,
  sortReversed: boolean,
): string {
  const arrow =
    sortBy === 'random' ? '' : effectiveSortDirection(sortBy, sortReversed) === 'desc' ? ' ↓' : ' ↑';
  return `${GROUP_NAMES[groupBy]} · ${SORT_NAMES[sortBy]}${arrow}`;
}

/** Plain-language sentence describing the current arrangement. */
export function describeArrangement(
  groupBy: TimelineGroupBy,
  sortBy: TimelineSortBy,
  sectionReversed: boolean,
  sortReversed: boolean,
): string {
  const sort =
    sortBy === 'random'
      ? 'in random order'
      : `by ${SORT_NAMES[sortBy].toLowerCase()}, ${sortDirectionLabel(sortBy, sortReversed).toLowerCase()}`;
  if (groupBy === 'none') return `All photos in one list, sorted ${sort}.`;
  const sections =
    groupBy === 'place' || groupBy === 'rating'
      ? `by ${groupBy}`
      : `by ${groupBy}${sortBy === 'dateAdded' ? ' added' : ''}`;
  return `Photos are grouped ${sections} (${sectionDirectionLabel(groupBy, sectionReversed).toLowerCase()}), and sorted ${sort} inside each section.`;
}

/** A combination where one setting makes the other pointless, or `null`. */
export function arrangementWarning(groupBy: TimelineGroupBy, sortBy: TimelineSortBy): string | null {
  if (groupBy === 'rating' && sortBy === 'rating') {
    return 'Every photo in a section has the same rating, so sorting by rating changes nothing.';
  }
  return null;
}
