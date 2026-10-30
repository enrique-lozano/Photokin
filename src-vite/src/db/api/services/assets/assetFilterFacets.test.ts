import { EXPOSURE_STOPS } from '@/common/exposureStops';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getExposureHistograms } from './assetFilterFacets';

const { selectFirstFromDBMock, selectFromDBMock } = vi.hoisted(() => ({
  selectFirstFromDBMock: vi.fn(),
  selectFromDBMock: vi.fn(),
}));

vi.mock('@/db/connection/db.service', () => ({
  selectFirstFromDB: selectFirstFromDBMock,
  selectFromDB: selectFromDBMock,
}));

type CompilableQuery = { compile(): { sql: string; parameters: readonly unknown[] } };

describe('getExposureHistograms', () => {
  beforeEach(() => vi.clearAllMocks());

  it('short-circuits an explicitly empty asset scope', async () => {
    const result = await getExposureHistograms({ assetIds: [] });

    expect(result.iso).toHaveLength(EXPOSURE_STOPS.iso.length);
    expect(result.flashCount).toBe(0);
    expect(selectFromDBMock).not.toHaveBeenCalled();
  });

  it('fills one bucket per stop, leaving missing buckets at zero', async () => {
    selectFromDBMock.mockResolvedValue([
      { bucket: 0, count: 3 },
      { bucket: 2, count: 5 },
    ]);
    selectFirstFromDBMock.mockResolvedValue({ count: 7 });

    const result = await getExposureHistograms({});

    expect(result.aperture.slice(0, 3)).toEqual([3, 0, 5]);
    expect(result.aperture).toHaveLength(EXPOSURE_STOPS.aperture.length);
    expect(result.flashCount).toBe(7);
  });

  it('buckets on the same expressions the exposure filters compare', async () => {
    const sqls: string[] = [];
    selectFromDBMock.mockImplementation(async (query: CompilableQuery) => {
      sqls.push(query.compile().sql);
      return [];
    });
    selectFirstFromDBMock.mockResolvedValue({ count: 0 });

    await getExposureHistograms({});

    expect(sqls.some((text) => text.includes('ROUND("assets"."aperture", 1)'))).toBe(true);
    expect(sqls.some((text) => text.includes('ROUND("assets"."shutterSpeed", 3)'))).toBe(true);
    expect(sqls.some((text) => text.includes('ROUND(CAST("assets"."focalLength" AS REAL))'))).toBe(true);
  });

  it('compiles the flash filter into the scope', async () => {
    selectFromDBMock.mockResolvedValue([]);
    selectFirstFromDBMock.mockImplementation(async (query: CompilableQuery) => {
      expect(query.compile().sql).toContain(`lower("assets"."flash") LIKE '%fired%'`);
      return { count: 0 };
    });

    await getExposureHistograms({
      searchQuery: { filters: [{ filterCriteria: FilterCriteria.flash, operator: 'equals', value: true }] },
    });

    expect(selectFirstFromDBMock).toHaveBeenCalledOnce();
  });
});
