/**
 * How Photokin lets you mark photos you care about. Both modes persist to the
 * single `assets.rating` column: `Favorites` stores 0 (unmarked) or 5 (loved),
 * while `Stars` stores the full 0–5 range. The mode only changes which controls
 * the UI surfaces, never the underlying storage, so switching modes never loses
 * data (a favorite is just a 5-star rating and vice versa).
 *
 * String-valued so the runtime values (`'favorites'`/`'stars'`) stay stable for
 * persisted settings and cross-window events.
 */
export enum RatingMode {
  /** A single heart toggle. Stored as rating 0 or 5. */
  Favorites = 'favorites',
  /** A 1–5 star rating. Stored as rating 0–5. */
  Stars = 'stars',
}

export const DEFAULT_RATING_MODE: RatingMode = RatingMode.Favorites;

/** Display copy for each rating mode, keyed by the mode itself. */
export const RATING_MODES: Record<RatingMode, { label: string; description: string }> = {
  [RatingMode.Favorites]: {
    label: 'Favorites',
    description: 'Mark photos you love with a single heart.',
  },
  [RatingMode.Stars]: {
    label: '1–5 stars',
    description: 'Rate photos from 1 to 5 stars for finer sorting and filtering.',
  },
};
