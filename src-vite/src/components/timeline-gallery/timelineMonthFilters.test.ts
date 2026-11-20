import { describe, expect, it } from 'vitest';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { buildTimelineMonthFilters } from './timelineMonthFilters';

describe('buildTimelineMonthFilters', () => {
  it('uses an inclusive lower bound so first-of-month midnight assets are kept', () => {
    const filters = buildTimelineMonthFilters('2015-07', FilterCriteria.date);

    expect(filters[0].operator).toBe('greaterThanOrEquals');
    expect(filters[0].value.toISOString()).toBe('2015-07-01T00:00:00.000Z');
    expect(filters[1].operator).toBe('smallerThan');
    expect(filters[1].value.toISOString()).toBe('2015-08-01T00:00:00.000Z');
  });
});
