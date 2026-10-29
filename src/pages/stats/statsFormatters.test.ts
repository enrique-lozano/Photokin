import { describe, expect, it } from 'vitest';
import {
  completeApertureDistribution,
  completeFocalLengthDistribution,
  completeIsoDistribution,
  completeShutterSpeedDistribution,
  fillMonthlyStats,
  formatApertureBucket,
  formatFocalLengthBucket,
  formatIso,
  formatShutterBucket,
  percentage,
} from './statsFormatters';

describe('statsFormatters', () => {
  it('fills missing months and sorts across year boundaries', () => {
    expect(
      fillMonthlyStats([
        { sectionId: '2024-02', totalImages: 4 },
        { sectionId: '2023-11', totalImages: 2 },
      ]),
    ).toEqual([
      { month: '2023-11', count: 2 },
      { month: '2023-12', count: 0 },
      { month: '2024-01', count: 0 },
      { month: '2024-02', count: 4 },
    ]);
  });

  it('returns no timeline points for an empty scope', () => {
    expect(fillMonthlyStats([])).toEqual([]);
  });

  it('completes the ordered ISO ranges with zero-count buckets', () => {
    const result = completeIsoDistribution([
      { value: 1, count: 8 },
      { value: 14, count: 2 },
    ]);

    expect(result).toHaveLength(15);
    expect(result[0]).toEqual({ label: 'ISO < 50', count: 0 });
    expect(result[1]).toEqual({ label: 'ISO 50–100', count: 8 });
    expect(result[14]).toEqual({ label: 'ISO > 10000', count: 2 });
  });

  it('completes ordered ranges for continuous exposure values', () => {
    expect(completeFocalLengthDistribution([])).toEqual(
      expect.arrayContaining([{ label: '18 mm–24 mm', count: 0 }]),
    );
    expect(completeApertureDistribution([])).toEqual(
      expect.arrayContaining([{ label: 'f/2–f/2.8', count: 0 }]),
    );
    expect(completeShutterSpeedDistribution([])).toEqual(
      expect.arrayContaining([{ label: '1/125–1/30', count: 0 }]),
    );
  });

  it('formats photographer-facing exposure values', () => {
    expect(formatIso(400)).toBe('ISO 400');
    expect(formatFocalLengthBucket(50)).toBe('50 mm');
    expect(formatApertureBucket(2.8)).toBe('f/2.8');
    expect(formatShutterBucket(4)).toBe('1/250');
  });

  it('handles percentages without dividing by zero', () => {
    expect(percentage(3, 4)).toBe(75);
    expect(percentage(0, 0)).toBe(0);
  });
});
