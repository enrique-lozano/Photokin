import { roundTo } from '@/utils/numberFormatter';

/*
  Aperture helpers.

  ExifTool exposes `Aperture` as a float. Files that store the APEX value
  instead of the f-number convert back with a long tail (e.g.
  `4.7568284600108`), so the raw number is never safe to render as-is.
*/

/**
 * Render an f-number the way lenses are labelled: one decimal below f/10
 * (`f/1.8`, `f/4.8`), whole stops above it (`f/11`), and no trailing `.0`.
 * Returns `null` when there is no usable value so callers can substitute their
 * own placeholder.
 */
export function formatAperture(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const rounded = roundTo(value, value >= 10 ? 0 : 1);
  return `f/${rounded}`;
}
