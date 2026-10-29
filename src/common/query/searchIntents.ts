import { FAVORITE_RATING } from '@/media/metadata/fields/favorite';
import { FilterCriteria } from './filters/FilterCriteria';
import { SearchFilter } from './filters/FilterTypes';

/**
 * A plain word that carries an obvious filtering intent ("videos", "favorites").
 *
 * Unlike a `key:value` token the intent is a *guess*, so callers keep the word
 * around: when the resulting filter matches nothing, the search falls back to
 * ranking the word semantically instead of showing an empty page.
 */
export interface SearchIntent {
  id: string;
  /** Plain-language description of what was filtered, shown back to the user. */
  label: string;
  /** Whole words (lowercase) that trigger this intent. */
  words: readonly string[];
  filters: readonly SearchFilter[];
}

export const SEARCH_INTENTS: readonly SearchIntent[] = [
  {
    id: 'videos',
    label: 'Videos',
    words: ['video', 'videos', 'movie', 'movies'],
    filters: [{ filterCriteria: FilterCriteria.mediaType, operator: 'equals', value: 'video' }],
  },
  {
    id: 'photos',
    label: 'Photos',
    words: ['photo', 'photos', 'picture', 'pictures', 'image', 'images'],
    filters: [{ filterCriteria: FilterCriteria.mediaType, operator: 'equals', value: 'photo' }],
  },
  {
    id: 'favorites',
    label: 'Favorites',
    words: ['favorite', 'favorites', 'favourite', 'favourites', 'loved'],
    // A favorite is stored as a 5-star rating (see `RatingMode`).
    filters: [
      { filterCriteria: FilterCriteria.rating, operator: 'greaterThanOrEquals', value: FAVORITE_RATING },
    ],
  },
];

/** The intent a bare word triggers, if any. Quoted words never reach this. */
export function findSearchIntent(word: string): SearchIntent | undefined {
  const normalized = word.trim().toLowerCase();
  if (!normalized) return undefined;

  return SEARCH_INTENTS.find((intent) => intent.words.includes(normalized));
}
