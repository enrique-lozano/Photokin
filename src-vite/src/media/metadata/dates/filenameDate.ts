/**
 * Best-effort capture-date extraction from a file name (e.g. `IMG_20220701_113932.jpg`).
 * Dates are built from UTC components so they line up with how ExifTool date
 * strings are read back (see `_parseExifDate`). Returns `null` when the name
 * carries no recognizable date.
 */

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// Ordered by specificity. Each captures year, month, day and optionally hour,
// minute, second. Leading `(?<!\d)` / trailing lookaheads keep matches from
// slicing into unrelated digit runs (e.g. a 13-digit epoch).
const PATTERNS: readonly RegExp[] = [
  // 2022-07-01 11.39.32 / 2022_07_01T11-39-32 / 2022-07-01 (date only)
  /(?<!\d)(\d{4})[-_.](\d{2})[-_.](\d{2})(?:[ T_-]+(\d{2})[-_.:h](\d{2})(?:[-_.:m](\d{2}))?)?(?!\d)/,
  // 20220701_113932 / 20220701-113932 / 20220701113932 / 20220701 (date only),
  // tolerating a trailing millisecond block as in PXL_20220701_113932123.
  /(?<!\d)(\d{4})(\d{2})(\d{2})(?:[ T_-]?(\d{2})(\d{2})(\d{2})(?:\d{3})?)?(?!\d)/,
];

function _stripExtension(filename: string): string {
  return filename.replace(/\.[^.\\/]+$/, '');
}

function _buildUtcDate(parts: DateParts): Date | null {
  const { year, month, day, hour, minute, second } = parts;
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // Reject impossible days (e.g. Feb 30) that Date silently rolls over.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseCaptureDateFromFilename(filename: string): Date | null {
  const name = _stripExtension(filename);

  for (const pattern of PATTERNS) {
    const match = pattern.exec(name);
    if (!match) continue;

    const date = _buildUtcDate({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4] ?? 0),
      minute: Number(match[5] ?? 0),
      second: Number(match[6] ?? 0),
    });
    if (date) return date;
  }

  return null;
}
