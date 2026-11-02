import {
  APERTURE_RANGE_BOUNDS,
  FOCAL_LENGTH_RANGE_BOUNDS,
  ISO_RANGE_BOUNDS,
  SHUTTER_SPEED_RANGE_BOUNDS,
} from '@/common/statsRanges';
import { formatAperture } from '@/media/metadata/fields/aperture';
import { formatShutterSpeed } from '@/media/metadata/fields/shutterSpeed';

export interface MonthlyStat {
  month: string;
  count: number;
}

interface MonthlyCountRow {
  sectionId: string | null;
  totalImages: number;
}

function _rangeLabels(bounds: number[], format: (value: number) => string): string[] {
  return [
    `< ${format(bounds[0])}`,
    ...bounds.slice(1).map((upper, index) => `${format(bounds[index])}–${format(upper)}`),
    `> ${format(bounds.at(-1)!)}`,
  ];
}

function _completeDistribution(rows: { value: number; count: number }[], labels: string[]) {
  const counts = new Map(rows.map((row) => [row.value, row.count]));
  return labels.map((label, value) => ({ label, count: counts.get(value) ?? 0 }));
}

export const completeIsoDistribution = (rows: { value: number; count: number }[]) =>
  _completeDistribution(
    rows,
    _rangeLabels(ISO_RANGE_BOUNDS, String).map((label) => `ISO ${label}`),
  );

export const completeFocalLengthDistribution = (rows: { value: number; count: number }[]) =>
  _completeDistribution(
    rows,
    _rangeLabels(FOCAL_LENGTH_RANGE_BOUNDS, (value) => `${value} mm`),
  );

export const completeApertureDistribution = (rows: { value: number; count: number }[]) =>
  _completeDistribution(
    rows,
    _rangeLabels(APERTURE_RANGE_BOUNDS, (value) => `f/${value}`),
  );

export const completeShutterSpeedDistribution = (rows: { value: number; count: number }[]) =>
  _completeDistribution(
    rows,
    _rangeLabels(SHUTTER_SPEED_RANGE_BOUNDS, (value) => formatShutterSpeed(value) ?? String(value)),
  );

export function fillMonthlyStats(rows: MonthlyCountRow[]): MonthlyStat[] {
  const counts = new Map(
    rows.flatMap((row) => (row.sectionId ? [[row.sectionId, row.totalImages] as const] : [])),
  );
  if (counts.size === 0) return [];
  const months = [...counts.keys()].sort();
  const [startYear, startMonth] = months[0].split('-').map(Number);
  const [endYear, endMonth] = months.at(-1)!.split('-').map(Number);
  const result: MonthlyStat[] = [];

  for (
    let year = startYear, month = startMonth;
    year < endYear || (year === endYear && month <= endMonth);
  ) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    result.push({ month: key, count: counts.get(key) ?? 0 });
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
  }

  return result;
}

export function summarizeMonthlyStats(rows: MonthlyCountRow[]) {
  const years = new Map<number, number>();
  const months = new Map<number, number>();
  for (const { sectionId, totalImages } of rows) {
    if (!sectionId) continue;
    const [year, month] = sectionId.split('-').map(Number);
    years.set(year, (years.get(year) ?? 0) + totalImages);
    months.set(month, (months.get(month) ?? 0) + totalImages);
  }
  const first = Math.min(...years.keys());
  const last = Math.max(...years.keys());
  return {
    years: years.size
      ? Array.from({ length: last - first + 1 }, (_, index) => ({
          year: first + index,
          totalImages: years.get(first + index) ?? 0,
        }))
      : [],
    months: [...months].map(([value, totalImages]) => ({ value, totalImages })),
  };
}

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return monthFormatter.format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

interface DatePartCount {
  value: number;
  totalImages: number;
}

/** All 12 months in calendar order (1–12), zero-filled. */
export function completeMonthsOfYear(rows: DatePartCount[]) {
  const format = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
  return _completeDateParts(rows, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], (month) =>
    format.format(new Date(Date.UTC(2024, month - 1, 1))),
  );
}

/** All 7 weekdays Monday-first (SQLite `%w`, 0 = Sunday), zero-filled. */
export function completeWeekdays(rows: DatePartCount[]) {
  const format = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
  // 2024-01-07 was a Sunday.
  return _completeDateParts(rows, [1, 2, 3, 4, 5, 6, 0], (weekday) =>
    format.format(new Date(Date.UTC(2024, 0, 7 + weekday))),
  );
}

function _completeDateParts(rows: DatePartCount[], values: number[], label: (value: number) => string) {
  const counts = new Map(rows.map((row) => [row.value, row.totalImages]));
  return values.map((value) => ({ value, label: label(value), count: counts.get(value) ?? 0 }));
}

export const formatIso = (value: number): string => `ISO ${value}`;
export const formatFocalLengthBucket = (value: number): string => `${value} mm`;
export const formatApertureBucket = (value: number): string => formatAperture(value) ?? String(value);
export const formatShutterBucket = (value: number): string => formatShutterSpeed(value) ?? String(value);

export function percentage(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
