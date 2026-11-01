import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import type { SearchQuery } from '@/common/fileSearchFilters';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getApertureDistribution,
  getFocalLengthDistribution,
  getRatingDistribution,
  getShutterSpeedDistribution,
  getStatsOverview,
  getTopFlashValues,
  getTopExposurePrograms,
  getTopIso,
  getTopMeteringModes,
  getTopWhiteBalances,
} from './assetStatsQueries';
import { getTopPlacesInScope } from './assetQueries';

const { selectFirstFromDBMock, selectFromDBMock } = vi.hoisted(() => ({
  selectFirstFromDBMock: vi.fn(),
  selectFromDBMock: vi.fn(),
}));

vi.mock('@/db/connection/db.service', () => ({
  selectFirstFromDB: selectFirstFromDBMock,
  selectFromDB: selectFromDBMock,
}));

describe('assetStatsQueries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('short-circuits an explicitly empty asset scope', async () => {
    expect((await getStatsOverview({ assetIds: [] })).totalAssets).toBe(0);
    expect(await getRatingDistribution({ assetIds: [] })).toHaveLength(7);
    expect(selectFirstFromDBMock).not.toHaveBeenCalled();
    expect(selectFromDBMock).not.toHaveBeenCalled();
  });

  it('passes global filters into aggregate queries', async () => {
    selectFromDBMock.mockImplementationOnce(
      async (query: { compile(): { parameters: readonly unknown[] } }) => {
        expect(query.compile().parameters).toContain(4);
        return [];
      },
    );

    await getTopIso({
      searchQuery: [
        {
          filters: [{ filterCriteria: FilterCriteria.rating, operator: 'greaterThanOrEquals', value: 4 }],
        },
      ],
    });

    expect(selectFromDBMock).toHaveBeenCalledOnce();
  });

  it('compiles chart metadata filters into aggregate queries', async () => {
    selectFromDBMock.mockImplementationOnce(
      async (query: { compile(): { sql: string; parameters: readonly unknown[] } }) => {
        const compiled = query.compile();
        expect(compiled.parameters).toEqual(
          expect.arrayContaining(['Fujifilm X-T5', 'XF 35mm', 400, 35, 2.8, 8]),
        );
        expect(compiled.sql).toContain('CAST(ROUND("assets"."iso") AS INTEGER)');
        expect(compiled.sql).toContain('ROUND(CAST("assets"."focalLength" AS REAL))');
        expect(compiled.sql).toMatch(/"assets"\."rating" is null/i);
        return [];
      },
    );

    await getTopIso({
      searchQuery: [
        {
          filters: [
            { filterCriteria: FilterCriteria.camera, operator: 'equals', value: 'Fujifilm X-T5' },
            { filterCriteria: FilterCriteria.lens, operator: 'equals', value: 'XF 35mm' },
            { filterCriteria: FilterCriteria.iso, operator: 'equals', value: 400 },
            { filterCriteria: FilterCriteria.focalLength, operator: 'equals', value: 35 },
            { filterCriteria: FilterCriteria.aperture, operator: 'equals', value: 2.8 },
            { filterCriteria: FilterCriteria.shutterSpeed, operator: 'equals', value: 8 },
            { filterCriteria: FilterCriteria.rated, operator: 'equals', value: false },
          ],
        },
      ],
    });

    expect(selectFromDBMock).toHaveBeenCalledOnce();
  });

  it('applies exact capture-setting filters to scoped stats queries', async () => {
    selectFromDBMock.mockImplementationOnce(
      async (query: { compile(): { sql: string; parameters: readonly unknown[] } }) => {
        const compiled = query.compile();
        expect(compiled.sql).toContain('"whiteBalance"');
        expect(compiled.sql).toContain('"flash"');
        expect(compiled.sql).toContain('"exposureProgram"');
        expect(compiled.parameters).toEqual(
          expect.arrayContaining(['Daylight', 'Off, Did not fire', 'Manual']),
        );
        return [];
      },
    );

    await getTopIso({
      searchQuery: [
        {
          filters: [
            { filterCriteria: FilterCriteria.whiteBalance, operator: 'equals', value: 'Daylight' },
            { filterCriteria: FilterCriteria.flashValue, operator: 'equals', value: 'Off, Did not fire' },
            { filterCriteria: FilterCriteria.exposureProgram, operator: 'equals', value: 'Manual' },
          ],
        },
      ],
    });

    expect(selectFromDBMock).toHaveBeenCalledOnce();
  });

  it('builds range distributions for continuous exposure values', async () => {
    selectFromDBMock.mockResolvedValue([]);

    await Promise.all([
      getFocalLengthDistribution({}),
      getApertureDistribution({}),
      getShutterSpeedDistribution({}),
    ]);

    const sqlStatements = selectFromDBMock.mock.calls.map(([query]) => query.compile().sql);
    expect(sqlStatements).toHaveLength(3);
    expect(sqlStatements.every((statement) => statement.includes('CASE'))).toBe(true);
    expect(sqlStatements[0]).toContain('ROUND(CAST(filesQueryRes.focalLength AS REAL))');
    expect(sqlStatements[1]).toContain('ROUND(filesQueryRes.aperture, 1)');
    expect(sqlStatements[2]).toContain('ROUND(filesQueryRes.shutterSpeed, 3)');
  });

  it('builds scoped frequency lists for categorical capture settings', async () => {
    selectFromDBMock.mockResolvedValue([]);
    const searchQuery: SearchQuery = [
      {
        filters: [{ filterCriteria: FilterCriteria.rating, operator: 'equals', value: 5 }],
      },
    ];

    await Promise.all([getTopWhiteBalances({ searchQuery }), getTopFlashValues({ searchQuery })]);

    const compiled = selectFromDBMock.mock.calls.map(([query]) => query.compile());
    expect(compiled).toHaveLength(2);
    expect(compiled[0].sql).toContain('"filesQueryRes"."whiteBalance"');
    expect(compiled[1].sql).toContain('"filesQueryRes"."flash"');
    expect(compiled.every(({ parameters }) => parameters.includes(5))).toBe(true);
  });

  it('builds a scoped frequency list for exposure programs', async () => {
    selectFromDBMock.mockImplementationOnce(
      async (query: { compile(): { sql: string; parameters: readonly unknown[] } }) => {
        const compiled = query.compile();
        expect(compiled.sql).toContain('"filesQueryRes"."exposureProgram"');
        expect(compiled.parameters).toContain(4);
        return [];
      },
    );

    await getTopExposurePrograms({
      searchQuery: [
        {
          filters: [{ filterCriteria: FilterCriteria.rating, operator: 'equals', value: 4 }],
        },
      ],
    });

    expect(selectFromDBMock).toHaveBeenCalledOnce();
  });

  it('counts known metering modes and filters by metering mode code', async () => {
    selectFromDBMock.mockImplementationOnce(
      async (query: { compile(): { sql: string; parameters: readonly unknown[] } }) => {
        const compiled = query.compile();
        expect(compiled.sql).toContain('filesQueryRes.meteringMode BETWEEN 1 AND 6');
        expect(compiled.sql).toContain('"meteringMode" =');
        expect(compiled.parameters).toContain(3);
        return [];
      },
    );

    await getTopMeteringModes({
      searchQuery: [
        {
          filters: [{ filterCriteria: FilterCriteria.meteringMode, operator: 'equals', value: 3 }],
        },
      ],
    });

    expect(selectFromDBMock).toHaveBeenCalledOnce();
  });

  it('groups top places by city or country on request', async () => {
    const statements: string[] = [];
    selectFromDBMock.mockImplementation(async (query: { compile(): { sql: string } }) => {
      statements.push(query.compile().sql);
      return [];
    });

    await Promise.all([
      getTopPlacesInScope({ groupBy: 'city' }),
      getTopPlacesInScope({ groupBy: 'country' }),
      getTopPlacesInScope({}),
    ]);

    expect(statements[0]).toContain('filesQueryRes.locationCity');
    expect(statements[1]).toContain('filesQueryRes.locationCountryCode');
    expect(statements[1]).toContain('filesQueryRes.locationCountry');
    expect(statements[2]).toContain('COALESCE');
  });
});
