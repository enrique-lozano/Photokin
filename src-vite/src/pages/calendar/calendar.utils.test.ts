import { describe, expect, it } from 'vitest';
import {
  CalendarData,
  WHOLE,
  getAdjacentSelection,
  getSelectionGranularity,
  getSelectionSummary,
} from './calendar.utils';

const data: CalendarData = {
  2024: { 12: [{ date: 30, count: 1 }] },
  2025: {
    3: [
      { date: 2, count: 4 },
      { date: 9, count: 2 },
    ],
    8: [{ date: 16, count: 7 }],
  },
};

describe('getSelectionGranularity', () => {
  it('derives the unit from the WHOLE sentinels', () => {
    expect(getSelectionGranularity({ year: 2025, month: WHOLE, date: WHOLE })).toBe('year');
    expect(getSelectionGranularity({ year: 2025, month: 3, date: WHOLE })).toBe('month');
    expect(getSelectionGranularity({ year: 2025, month: 3, date: 2 })).toBe('day');
  });
});

describe('getSelectionSummary', () => {
  const now = new Date(Date.UTC(2025, 7, 20));

  it('describes how a year is spread out', () => {
    expect(getSelectionSummary(data, { year: 2025, month: WHOLE, date: WHOLE }, now)).toBe(
      'Photos on 3 days across 2 months',
    );
    expect(getSelectionSummary(data, { year: 2024, month: WHOLE, date: WHOLE }, now)).toBe(
      'Photos on 1 day across 1 month',
    );
  });

  it('describes how much of a month has photos', () => {
    expect(getSelectionSummary(data, { year: 2025, month: 3, date: WHOLE }, now)).toBe(
      'Photos on 2 of 31 days',
    );
  });

  it('says how long ago a day was', () => {
    expect(getSelectionSummary(data, { year: 2025, month: 8, date: 20 }, now)).toBe('Taken today');
    expect(getSelectionSummary(data, { year: 2025, month: 8, date: 16 }, now)).toBe('Taken 4 days ago');
    expect(getSelectionSummary(data, { year: 2025, month: 3, date: 2 }, now)).toBe('Taken 6 months ago');
    expect(getSelectionSummary(data, { year: 2024, month: 12, date: 30 }, now)).toBe('Taken 8 months ago');
  });
});

describe('getAdjacentSelection', () => {
  it('steps between populated months across years', () => {
    const march = { year: 2025, month: 3, date: WHOLE };

    expect(getAdjacentSelection(data, march, 'previous')).toEqual({ year: 2024, month: 12, date: WHOLE });
    expect(getAdjacentSelection(data, march, 'next')).toEqual({ year: 2025, month: 8, date: WHOLE });
  });

  it('steps between populated days', () => {
    const second = { year: 2025, month: 3, date: 2 };

    expect(getAdjacentSelection(data, second, 'next')).toEqual({ year: 2025, month: 3, date: 9 });
    expect(getAdjacentSelection(data, second, 'previous')).toEqual({ year: 2024, month: 12, date: 30 });
  });

  it('steps between years', () => {
    expect(getAdjacentSelection(data, { year: 2024, month: WHOLE, date: WHOLE }, 'next')).toEqual({
      year: 2025,
      month: WHOLE,
      date: WHOLE,
    });
  });

  it('returns null at either end', () => {
    expect(getAdjacentSelection(data, { year: 2024, month: 12, date: WHOLE }, 'previous')).toBeNull();
    expect(getAdjacentSelection(data, { year: 2025, month: 8, date: WHOLE }, 'next')).toBeNull();
  });
});
