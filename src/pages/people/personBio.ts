import { PersonSex } from '@/db/models/TagDTO';

/**
 * Person profile fields shown in the "about" strip. Persons are tags, so these
 * mirror the person-related columns on {@link TagDTO}.
 */
export type PersonBio = {
  name: string;
  sex: PersonSex | null;
  dateBirth: string | null;
  dateDead: string | null;
  description: string | null;
};

/** Human label for a stored sex value. */
export const SEX_LABEL: Record<PersonSex, string> = {
  [PersonSex.Male]: 'Male',
  [PersonSex.Female]: 'Female',
  [PersonSex.Other]: 'Other',
};

type ParsedDate = { year: number; date: Date | null };

/**
 * Parse a stored person date. Values can be a bare year (`"1879"`) or an ISO
 * date (`"1879-03-14"`). Returns the year plus a full `Date` when day-precision
 * is available, or `null` when the value is empty/unparseable.
 */
function _parsePersonDate(value: string | null | undefined): ParsedDate | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (/^\d{1,4}$/.test(trimmed)) {
    return { year: Number(trimmed), date: null };
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    // Fall back to any leading 4-digit year we can find (e.g. "March 1879").
    const match = trimmed.match(/\d{4}/);
    return match ? { year: Number(match[0]), date: null } : null;
  }

  return { year: parsed.getFullYear(), date: parsed };
}

/**
 * Format a stored person date for display. Day-precision values render as
 * `"14 Mar 1879"`; year-only values render as `"1879"`; unknown values render
 * as an empty string (the caller renders nothing).
 */
export function formatPersonDate(value: string | null | undefined): string {
  const parsed = _parsePersonDate(value);
  if (!parsed) return '';

  if (parsed.date) {
    return parsed.date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  return String(parsed.year);
}

/** Whole years between two dates, accounting for month/day when available. */
function _fullYearsBetween(start: ParsedDate, end: ParsedDate): number {
  if (start.date && end.date) {
    let age = end.date.getFullYear() - start.date.getFullYear();
    const monthDelta = end.date.getMonth() - start.date.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && end.date.getDate() < start.date.getDate())) {
      age -= 1;
    }
    return age;
  }

  return end.year - start.year;
}

export type DerivedAge = {
  /** Whole years lived (at death, or as of today for a living person). */
  age: number;
  /** True when a death date is recorded. */
  isDead: boolean;
};

/**
 * Derive a person's age. With a death date it is the lifespan and the caller
 * shows "Died aged N"; without one it is today's age. Never stored. Returns
 * `null` when there isn't enough information (no birth year).
 */
export function derivePersonAge(
  dateBirth: string | null | undefined,
  dateDead: string | null | undefined,
): DerivedAge | null {
  const birth = _parsePersonDate(dateBirth);
  if (!birth) return null;

  const death = _parsePersonDate(dateDead);
  const now = new Date();
  const end: ParsedDate = death ?? { year: now.getFullYear(), date: now };

  const age = _fullYearsBetween(birth, end);
  if (age < 0) return null;

  return { age, isDead: Boolean(death) };
}
