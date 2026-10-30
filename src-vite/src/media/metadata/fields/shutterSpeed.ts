/*
  Shutter speed helpers.

  ExifTool exposes `ShutterSpeed` as a human-readable string (e.g. `'1/250'`
  or `'2"'`), while the SQLite column we persist into is a `REAL` (the
  exposure duration in milliseconds). These helpers bridge the two
  representations.
*/

const FRACTIONAL_SHUTTER_RE = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/;
const SECONDS_SHUTTER_RE = /^(\d+(?:\.\d+)?)\s*(?:["'s]|sec(?:onds?)?)?$/i;

/**
 * Convert ExifTool's `ShutterSpeed` value into a duration in milliseconds.
 *
 * Accepts:
 * - Fractional strings such as `'1/250'`.
 * - Long-exposure strings such as `'2"'`, `'2'`, `'2s'`, or `'15 sec'`.
 * - A plain number, which is treated as seconds (the machine value ExifTool
 *   exposes when PrintConv is disabled via the `-ShutterSpeed#` flag).
 *
 * Returns `null` for unrecognized or non-positive inputs so callers can fall
 * back to a sensible default without leaking `undefined` into the DB.
 */
export function parseShutterSpeedMs(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value * 1000 : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const fractionalMatch = FRACTIONAL_SHUTTER_RE.exec(trimmed);
  if (fractionalMatch) {
    const numerator = Number(fractionalMatch[1]);
    const denominator = Number(fractionalMatch[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      return (numerator / denominator) * 1000;
    }
    return null;
  }

  const secondsMatch = SECONDS_SHUTTER_RE.exec(trimmed);
  if (secondsMatch) {
    const seconds = Number(secondsMatch[1]);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
  }

  return null;
}

/**
 * Render a shutter speed (in milliseconds) the way photographers expect to
 * see it: `'1/250'` for short exposures, `'2"'` for long ones. Returns `null`
 * when there is no usable value so callers can substitute their own
 * placeholder.
 */
export function formatShutterSpeed(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) {
    return null;
  }

  const seconds = ms / 1000;

  if (seconds >= 1) {
    const rounded = Number.isInteger(seconds) ? seconds.toString() : seconds.toFixed(1);
    return `${rounded}"`;
  }

  const denominator = Math.round(1 / seconds);
  return `1/${denominator}`;
}
