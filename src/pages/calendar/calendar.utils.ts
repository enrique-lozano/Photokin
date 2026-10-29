import { SearchQuery } from '../../common/fileSearchFilters';
import { FilterCriteria } from '../../common/query/filters/FilterCriteria';
import { addConditionsToQuery } from '../../common/searchQueryUtils';

/**
 * `-1` is used as a sentinel that means "the whole parent unit is selected":
 *  - `month === WHOLE`  → the entire year is selected
 *  - `date === WHOLE`   → the entire month is selected
 */
export const WHOLE = -1;

export type CalendarSelection = {
  year: number;
  /** 1-12, or {@link WHOLE} for the whole year. */
  month: number;
  /** 1-31, or {@link WHOLE} for the whole month. */
  date: number;
};

/** A single day bucket with the amount of assets taken that day. */
export type DayCount = { date: number; count: number };

/** Map of month (1-12) → list of populated days. */
export type MonthBuckets = Record<number, DayCount[]>;

/** Map of year → its populated months. */
export type CalendarData = Record<number, MonthBuckets>;

/** Raw `{ sectionId: 'YYYY-MM-DD', totalImages }` rows coming from the DB. */
type DaySection = { sectionId: string; totalImages: number };

/**
 * Folds the flat day-count rows returned by the DB into a nested
 * year → month → days structure that the calendar grids consume.
 */
export function groupDaySections(sections: DaySection[]): CalendarData {
  const data: CalendarData = {};

  for (const section of sections) {
    const [year, month, date] = section.sectionId.split('-').map(Number);
    if (!year || !month || !date) continue;

    data[year] ??= {};
    data[year][month] ??= [];
    data[year][month].push({ date, count: section.totalImages });
  }

  return data;
}

/** Years present in the data, sorted newest-first to match the gallery order. */
export function getSortedYears(data: CalendarData): number[] {
  return Object.keys(data)
    .map(Number)
    .sort((a, b) => b - a);
}

/** Months present in a year, sorted newest-first. */
export function getSortedMonths(months: MonthBuckets): number[] {
  return Object.keys(months)
    .map(Number)
    .sort((a, b) => b - a);
}

export function sumMonthCount(months: MonthBuckets, month: number): number {
  return months[month]?.reduce((acc, day) => acc + day.count, 0) ?? 0;
}

export function sumYearCount(months: MonthBuckets): number {
  return Object.keys(months).reduce((acc, month) => acc + sumMonthCount(months, Number(month)), 0);
}

/** Total assets covered by the current selection, taken straight from the buckets. */
export function getSelectionCount(data: CalendarData, selection: CalendarSelection): number {
  const months = data[selection.year];
  if (!months) return 0;

  if (selection.month === WHOLE) return sumYearCount(months);
  if (selection.date === WHOLE) return sumMonthCount(months, selection.month);

  return months[selection.month]?.find((day) => day.date === selection.date)?.count ?? 0;
}

/**
 * Half-open UTC range `[start, end)` for the current selection. UTC keeps the
 * boundaries aligned with how assets are bucketed across the app.
 */
export function getSelectionDateRange(selection: CalendarSelection): [Date, Date] {
  const { year, month, date } = selection;

  if (month === WHOLE) {
    return [new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1))];
  }
  if (date === WHOLE) {
    return [new Date(Date.UTC(year, month - 1, 1)), new Date(Date.UTC(year, month, 1))];
  }
  return [new Date(Date.UTC(year, month - 1, date)), new Date(Date.UTC(year, month - 1, date + 1))];
}

/** Merges the active search query with the selected date range. */
export function buildSelectionSearchQuery(baseQuery: SearchQuery, selection: CalendarSelection): SearchQuery {
  const [start, end] = getSelectionDateRange(selection);

  return addConditionsToQuery(baseQuery, [
    { filterCriteria: FilterCriteria.date, operator: 'greaterThan', value: start },
    { filterCriteria: FilterCriteria.date, operator: 'smallerThan', value: end },
  ]);
}

/** Number of days in a (1-indexed) month, computed in UTC. */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Weekday (0 = Sunday) of the first day of the month, computed in UTC. */
export function getFirstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

const todayUTC = {
  year: new Date().getUTCFullYear(),
  month: new Date().getUTCMonth() + 1,
  date: new Date().getUTCDate(),
};

export function isToday(year: number, month: number, date: number): boolean {
  return year === todayUTC.year && month === todayUTC.month && date === todayUTC.date;
}

export function isCurrentMonth(year: number, month: number): boolean {
  return year === todayUTC.year && month === todayUTC.month;
}
