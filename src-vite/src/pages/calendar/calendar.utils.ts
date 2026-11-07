import { SearchQuery } from '../../common/fileSearchFilters';
import { FilterCriteria } from '../../common/query/filters/FilterCriteria';
import { addConditionsToQuery } from '../../common/searchQueryUtils';
import type { TimelineGroupBy, TimelineSortBy } from '../../stores/settingsStore';

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

export type SelectionGranularity = 'year' | 'month' | 'day';

export function getSelectionGranularity({ month, date }: CalendarSelection): SelectionGranularity {
  if (month === WHOLE) return 'year';
  return date === WHOLE ? 'month' : 'day';
}

export function shouldHideCalendarGroupHeaders(
  selection: CalendarSelection,
  groupBy: TimelineGroupBy,
  sortBy: TimelineSortBy,
): boolean {
  if (sortBy === 'dateAdded') return false;
  const timeframe: Record<TimelineGroupBy, number> = {
    none: 0,
    rating: 0,
    place: 0,
    day: 1,
    month: 2,
    year: 3,
  };
  return timeframe[groupBy] >= timeframe[getSelectionGranularity(selection)];
}

/**
 * The neighbouring period with photos at the same granularity as `selection`
 * (year → year, month → month, day → day), skipping empty ones. `null` when
 * there is none in that direction.
 */
export function getAdjacentSelection(
  data: CalendarData,
  selection: CalendarSelection,
  direction: 'previous' | 'next',
): CalendarSelection | null {
  const granularity = getSelectionGranularity(selection);
  const ascending: CalendarSelection[] = [];

  for (const year of getSortedYears(data).reverse()) {
    if (granularity === 'year') {
      ascending.push({ year, month: WHOLE, date: WHOLE });
      continue;
    }
    for (const month of getSortedMonths(data[year]).reverse()) {
      if (granularity === 'month') {
        ascending.push({ year, month, date: WHOLE });
        continue;
      }
      const days = data[year][month].map((day) => day.date).sort((a, b) => a - b);
      for (const date of days) ascending.push({ year, month, date });
    }
  }

  const index = ascending.findIndex(
    (candidate) =>
      candidate.year === selection.year &&
      candidate.month === selection.month &&
      candidate.date === selection.date,
  );
  if (index === -1) return null;

  return ascending[direction === 'previous' ? index - 1 : index + 1] ?? null;
}

/** Number of days in a (1-indexed) month, computed in UTC. */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const DAY_MS = 24 * 60 * 60 * 1000;

function _count(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

function _relativeTime(daysFromNow: number): string {
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const distance = Math.abs(daysFromNow);
  if (distance <= 31) return formatter.format(daysFromNow, 'day');
  if (distance < 365) return formatter.format(Math.round(daysFromNow / 30.44), 'month');
  return formatter.format(Math.round(daysFromNow / 365.25), 'year');
}

/**
 * One-line description of a selected period that the title doesn't already
 * carry: how spread out the photos are, or how long ago a single day was.
 */
export function getSelectionSummary(
  data: CalendarData,
  selection: CalendarSelection,
  now = new Date(),
): string {
  const { year, month, date } = selection;

  if (month === WHOLE) {
    const months = data[year] ?? {};
    const days = Object.values(months).reduce((total, monthDays) => total + monthDays.length, 0);
    return `Photos on ${_count(days, 'day')} across ${_count(Object.keys(months).length, 'month')}`;
  }
  if (date === WHOLE) {
    const days = data[year]?.[month]?.length ?? 0;
    return `Photos on ${days} of ${_count(getDaysInMonth(year, month), 'day')}`;
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return `Taken ${_relativeTime(Math.round((Date.UTC(year, month - 1, date) - today) / DAY_MS))}`;
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
