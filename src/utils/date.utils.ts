/**
 * Earliest of the given dates, ignoring null/undefined; `null` when none are
 * valid.
 */
export function earliestDate(dates: readonly (Date | null | undefined)[]): Date | null {
  const valid = dates.filter((date): date is Date => date instanceof Date);
  if (valid.length === 0) {
    return null;
  }
  return valid.reduce((earliest, date) => (date < earliest ? date : earliest));
}

/** Parses a UNIX-epoch-ms timestamp into a Date, or `null` when absent. */
export function epochMsToDate(millis: number | null | undefined): Date | null {
  return millis != null ? new Date(millis) : null;
}
