import { describe, expect, it } from 'vitest';
import {
  applyOffset,
  computeNewDate,
  dateTimeLocalValueToDate,
  dateToDateTimeLocalValue,
  offsetToMs,
  type DateOffset,
} from './dateAdjustment';

const asset = (filename: string, isoDate: string) => ({
  filename,
  metadata: { date: new Date(isoDate) },
});

describe('offsetToMs / applyOffset', () => {
  it('adds a signed day/hour/minute offset', () => {
    const offset: DateOffset = { direction: 1, days: 1, hours: 2, minutes: 30 };
    expect(offsetToMs(offset)).toBe(((1 * 24 + 2) * 60 + 30) * 60 * 1000);
    expect(applyOffset(new Date('2022-07-01T00:00:00Z'), offset).toISOString()).toBe(
      '2022-07-02T02:30:00.000Z',
    );
  });

  it('subtracts when direction is negative', () => {
    const offset: DateOffset = { direction: -1, days: 0, hours: 1, minutes: 0 };
    expect(applyOffset(new Date('2022-07-01T00:30:00Z'), offset).toISOString()).toBe(
      '2022-06-30T23:30:00.000Z',
    );
  });
});

describe('computeNewDate', () => {
  const offset: DateOffset = { direction: 1, days: 0, hours: 1, minutes: 0 };

  it('starts from the current date', () => {
    const result = computeNewDate('current', asset('a.jpg', '2022-07-01T10:00:00Z'), null, offset);
    expect(result?.toISOString()).toBe('2022-07-01T11:00:00.000Z');
  });

  it('starts from the filename date', () => {
    const result = computeNewDate(
      'filename',
      asset('IMG_20220701_100000.jpg', '2000-01-01T00:00:00Z'),
      null,
      offset,
    );
    expect(result?.toISOString()).toBe('2022-07-01T11:00:00.000Z');
  });

  it('returns null when the filename has no date', () => {
    expect(
      computeNewDate('filename', asset('vacation.jpg', '2000-01-01T00:00:00Z'), null, offset),
    ).toBeNull();
  });

  it('starts from a custom date shared by all assets', () => {
    const custom = new Date('2019-05-05T05:05:00Z');
    const result = computeNewDate('custom', asset('a.jpg', '2000-01-01T00:00:00Z'), custom, offset);
    expect(result?.toISOString()).toBe('2019-05-05T06:05:00.000Z');
  });

  it('returns null for custom source without a chosen date', () => {
    expect(computeNewDate('custom', asset('a.jpg', '2000-01-01T00:00:00Z'), null, offset)).toBeNull();
  });
});

describe('datetime-local conversions round-trip in UTC', () => {
  it('formats and parses symmetrically', () => {
    const value = dateToDateTimeLocalValue(new Date('2022-07-01T11:39:00Z'));
    expect(value).toBe('2022-07-01T11:39');
    expect(dateTimeLocalValueToDate(value)?.toISOString()).toBe('2022-07-01T11:39:00.000Z');
  });

  it('returns null for malformed input', () => {
    expect(dateTimeLocalValueToDate('nope')).toBeNull();
  });
});
