import { parseCaptureDateFromFilename } from './filenameDate';

/**
 * Pure helpers behind the "adjust date & time" modal: where the new base date
 * comes from and how a signed day/hour/minute offset is applied. Everything is
 * expressed in UTC components so it round-trips with the ExifTool reader/writer.
 */

/** Where each asset's new date starts before the offset is applied. */
export type DateSource = 'current' | 'filename' | 'custom';

export interface DateOffset {
  direction: 1 | -1;
  days: number;
  hours: number;
  minutes: number;
}

export const ZERO_OFFSET: DateOffset = { direction: 1, days: 0, hours: 0, minutes: 0 };

interface DatedAsset {
  filename: string;
  metadata: { date: Date };
}

export function offsetToMs(offset: DateOffset): number {
  const magnitude = ((offset.days * 24 + offset.hours) * 60 + offset.minutes) * 60 * 1000;
  return offset.direction * magnitude;
}

export function isOffsetZero(offset: DateOffset): boolean {
  return offset.days === 0 && offset.hours === 0 && offset.minutes === 0;
}

export function applyOffset(base: Date, offset: DateOffset): Date {
  return new Date(base.getTime() + offsetToMs(offset));
}

/** The base date for an asset, or `null` when it can't be derived (e.g. no date in the filename). */
export function baseDateForAsset(
  source: DateSource,
  asset: DatedAsset,
  customDate: Date | null,
): Date | null {
  if (source === 'current') return asset.metadata.date;
  if (source === 'filename') return parseCaptureDateFromFilename(asset.filename);
  return customDate;
}

/** Final date for an asset (base + offset), or `null` when the base is unavailable. */
export function computeNewDate(
  source: DateSource,
  asset: DatedAsset,
  customDate: Date | null,
  offset: DateOffset,
): Date | null {
  const base = baseDateForAsset(source, asset, customDate);
  return base ? applyOffset(base, offset) : null;
}

/** `<input type="datetime-local">` value (`YYYY-MM-DDTHH:mm`) from a date's UTC components. */
export function dateToDateTimeLocalValue(date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  const y = pad(date.getUTCFullYear(), 4);
  const mo = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

/** Parses a `datetime-local` value into a UTC date, or `null` when malformed. */
export function dateTimeLocalValueToDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;

  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      match[6] ? Number(match[6]) : 0,
    ),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}
