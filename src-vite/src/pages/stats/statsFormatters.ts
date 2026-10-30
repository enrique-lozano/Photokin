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
  sectionId: string;
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
  if (rows.length === 0) return [];

  const counts = new Map(rows.map((row) => [row.sectionId, row.totalImages]));
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

export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1)),
  );
}

export const formatIso = (value: number): string => `ISO ${value}`;
export const formatFocalLengthBucket = (value: number): string => `${value} mm`;
export const formatApertureBucket = (value: number): string => formatAperture(value) ?? String(value);
export const formatShutterBucket = (value: number): string => formatShutterSpeed(value) ?? String(value);

export function percentage(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
