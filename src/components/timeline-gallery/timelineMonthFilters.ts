import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { DateRangeFilter } from '@/common/query/filters/FilterTypes';

/** `YYYY-MM` section id produced by {@link AssetsService.getFileCountByMonth}. */
export type TimelineMonthSectionId = `${number}-${string}`;

/**
 * UTC month window matching `strftime('%Y-%m', date)` bucketing in
 * `getFileCountByMonth`. The lower bound is inclusive so assets captured
 * exactly at midnight on the first day of the month (common when EXIF has no
 * time component) stay in the section the counter already attributed them to.
 */
export function buildTimelineMonthFilters(
  sectionId: TimelineMonthSectionId,
  dateCriteria: FilterCriteria.date | FilterCriteria.dateAdded,
): DateRangeFilter[] {
  const [sectionIdYear, sectionIdMonth] = sectionId.split('-').map((part) => Number(part));

  return [
    {
      filterCriteria: dateCriteria,
      operator: 'greaterThanOrEquals',
      value: new Date(Date.UTC(sectionIdYear, sectionIdMonth - 1, 1)),
    },
    {
      filterCriteria: dateCriteria,
      operator: 'smallerThan',
      value: new Date(Date.UTC(sectionIdYear, sectionIdMonth, 1)),
    },
  ];
}

/**
 * Mirrors the SQL date comparisons applied by {@link buildTimelineMonthFilters}
 * so tests can assert parity with `strftime('%Y-%m', …)` month buckets.
 */
export function assetDateMatchesTimelineMonthSection(
  dateIso: string,
  sectionId: TimelineMonthSectionId,
): boolean {
  const [year, month] = sectionId.split('-').map((part) => Number(part));
  const monthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const nextMonthStart = new Date(Date.UTC(year, month, 1)).toISOString();

  return dateIso >= monthStart && dateIso < nextMonthStart;
}
