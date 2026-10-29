import { describe, expect, it } from 'vitest';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { assetDateMatchesTimelineMonthSection, buildTimelineMonthFilters } from './timelineMonthFilters';

describe('buildTimelineMonthFilters', () => {
  it('uses an inclusive lower bound so first-of-month midnight assets are kept', () => {
    const filters = buildTimelineMonthFilters('2015-07', FilterCriteria.date);

    expect(filters[0].operator).toBe('greaterThanOrEquals');
    expect(filters[0].value.toISOString()).toBe('2015-07-01T00:00:00.000Z');
    expect(filters[1].operator).toBe('smallerThan');
    expect(filters[1].value.toISOString()).toBe('2015-08-01T00:00:00.000Z');
  });
});

describe('assetDateMatchesTimelineMonthSection', () => {
  const sectionId = '2015-07';

  it('includes assets dated exactly at the first instant of the month', () => {
    const date = '2015-07-01T00:00:00.000Z';
    expect(assetDateMatchesTimelineMonthSection(date, sectionId)).toBe(true);
  });

  it('includes assets later in the month', () => {
    expect(assetDateMatchesTimelineMonthSection('2015-07-15T12:34:56.000Z', sectionId)).toBe(true);
  });

  it('excludes assets on the first instant of the following month', () => {
    expect(assetDateMatchesTimelineMonthSection('2015-08-01T00:00:00.000Z', sectionId)).toBe(false);
  });

  it('includes assets on the last instant of the month', () => {
    expect(assetDateMatchesTimelineMonthSection('2015-07-31T23:59:59.999Z', sectionId)).toBe(true);
  });

  it('excludes assets from the preceding month', () => {
    expect(assetDateMatchesTimelineMonthSection('2015-06-30T23:59:59.999Z', sectionId)).toBe(false);
  });
});
