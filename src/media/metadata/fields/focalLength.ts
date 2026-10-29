import { roundTo } from '@/utils/numberFormatter';

/*
  Focal length helpers.

  ExifTool exposes `FocalLength` already printed with its unit (e.g. `'50.0 mm'`),
  but the number it prints comes from a rational that can carry a long decimal
  tail (`'4.7568284600108 mm'`).
*/

const LEADING_NUMBER_RE = /^\d+(?:\.\d+)?/;

/**
 * Round the numeric part of a printed focal length to one decimal, keeping the
 * unit ExifTool emitted. Values that don't start with a number (zoom ranges,
 * localized strings) pass through untouched. Returns `null` when there is no
 * usable value.
 */
export function formatFocalLength(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(LEADING_NUMBER_RE, (match) => String(roundTo(Number(match), 1)));
}
