/**
 * A favorite is not a field of its own: it is the top of the 5-star scale, so
 * both rating modes stay interchangeable and the flag travels inside the file.
 */
export const FAVORITE_RATING = 5;

export function isFavoriteRating(rating: number | null | undefined): boolean {
  return (rating ?? 0) >= FAVORITE_RATING;
}
