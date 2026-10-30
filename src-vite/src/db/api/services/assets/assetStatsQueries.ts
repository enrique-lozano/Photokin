import {
  APERTURE_RANGE_BOUNDS,
  FOCAL_LENGTH_RANGE_BOUNDS,
  ISO_RANGE_BOUNDS,
  SHUTTER_SPEED_RANGE_BOUNDS,
} from '@/common/statsRanges';
import { selectFirstFromDB, selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { sql, SqlBool } from 'kysely';
import { scopedAssetsSubquery, uniqueAssetIds, videoAssetExpression } from './assetScope';
import {
  ScopeParams,
  StatsCountBucket,
  StatsNumericBucket,
  StatsOverview,
  StatsRatingBucket,
} from './assetTypes';

const EMPTY_OVERVIEW: StatsOverview = {
  totalAssets: 0,
  photoCount: 0,
  videoCount: 0,
  totalSizeBytes: 0,
  minDate: null,
  maxDate: null,
  ratedCount: 0,
  cameraCount: 0,
  lensCount: 0,
  isoCount: 0,
  focalLengthCount: 0,
  apertureCount: 0,
  shutterSpeedCount: 0,
  whiteBalanceCount: 0,
  flashCount: 0,
  locationCount: 0,
};

function _hasText(column: string) {
  return sql<SqlBool>`TRIM(COALESCE(${sql.ref(column)}, '')) != ''`;
}

export async function getStatsOverview(params: ScopeParams): Promise<StatsOverview> {
  const ids = uniqueAssetIds(params.assetIds);
  if (ids?.length === 0) return EMPTY_OVERVIEW;

  const isVideo = videoAssetExpression('filesQueryRes.');
  const row = await selectFirstFromDB(
    kyselyDB
      .selectFrom(scopedAssetsSubquery(params.searchQuery, ids))
      .select([
        sql<number>`COUNT(*)`.as('totalAssets'),
        sql<number>`COALESCE(SUM(CASE WHEN ${isVideo} THEN 0 ELSE 1 END), 0)`.as('photoCount'),
        sql<number>`COALESCE(SUM(CASE WHEN ${isVideo} THEN 1 ELSE 0 END), 0)`.as('videoCount'),
        sql<number>`COALESCE(SUM(filesQueryRes.filesize), 0)`.as('totalSizeBytes'),
        sql<string | null>`MIN(filesQueryRes.date)`.as('minDate'),
        sql<string | null>`MAX(filesQueryRes.date)`.as('maxDate'),
        sql<number>`COALESCE(SUM(CASE WHEN filesQueryRes.rating IS NOT NULL THEN 1 ELSE 0 END), 0)`.as(
          'ratedCount',
        ),
        sql<number>`COALESCE(SUM(CASE WHEN ${_hasText('filesQueryRes.make')} OR ${_hasText('filesQueryRes.model')} THEN 1 ELSE 0 END), 0)`.as(
          'cameraCount',
        ),
        sql<number>`COALESCE(SUM(CASE WHEN ${_hasText('filesQueryRes.lens')} THEN 1 ELSE 0 END), 0)`.as(
          'lensCount',
        ),
        sql<number>`COALESCE(SUM(CASE WHEN filesQueryRes.iso > 0 THEN 1 ELSE 0 END), 0)`.as('isoCount'),
        sql<number>`COALESCE(SUM(CASE WHEN ${_hasText('filesQueryRes.focalLength')} THEN 1 ELSE 0 END), 0)`.as(
          'focalLengthCount',
        ),
        sql<number>`COALESCE(SUM(CASE WHEN filesQueryRes.aperture > 0 THEN 1 ELSE 0 END), 0)`.as(
          'apertureCount',
        ),
        sql<number>`COALESCE(SUM(CASE WHEN filesQueryRes.shutterSpeed > 0 THEN 1 ELSE 0 END), 0)`.as(
          'shutterSpeedCount',
        ),
        sql<number>`COALESCE(SUM(CASE WHEN ${_hasText('filesQueryRes.whiteBalance')} THEN 1 ELSE 0 END), 0)`.as(
          'whiteBalanceCount',
        ),
        sql<number>`COALESCE(SUM(CASE WHEN ${_hasText('filesQueryRes.flash')} THEN 1 ELSE 0 END), 0)`.as(
          'flashCount',
        ),
        sql<number>`COALESCE(SUM(CASE WHEN filesQueryRes.latitude IS NOT NULL OR filesQueryRes.longitude IS NOT NULL OR ${_hasText('filesQueryRes.locationCity')} OR ${_hasText('filesQueryRes.locationCountry')} THEN 1 ELSE 0 END), 0)`.as(
          'locationCount',
        ),
      ]),
  );

  return row ?? EMPTY_OVERVIEW;
}

export async function getTopCameraBodies(
  params: ScopeParams & { limit?: number },
): Promise<StatsCountBucket[]> {
  const ids = uniqueAssetIds(params.assetIds);
  if (ids?.length === 0) return [];

  const make = sql<string | null>`NULLIF(TRIM(filesQueryRes.make), '')`;
  const model = sql<string | null>`NULLIF(TRIM(filesQueryRes.model), '')`;
  const rows = await selectFromDB(
    kyselyDB
      .selectFrom(scopedAssetsSubquery(params.searchQuery, ids))
      .select([make.as('make'), model.as('model'), sql<number>`COUNT(*)`.as('count')])
      .where(sql<SqlBool>`${make} IS NOT NULL OR ${model} IS NOT NULL`)
      .groupBy([make, model])
      .orderBy('count', 'desc')
      .orderBy(model, 'asc')
      .limit(params.limit ?? 8),
  );

  return rows.map((row) => ({ label: [row.make, row.model].filter(Boolean).join(' '), count: row.count }));
}

export async function getTopLenses(params: ScopeParams & { limit?: number }): Promise<StatsCountBucket[]> {
  const ids = uniqueAssetIds(params.assetIds);
  if (ids?.length === 0) return [];

  const lens = sql<string>`TRIM(filesQueryRes.lens)`;
  return selectFromDB(
    kyselyDB
      .selectFrom(scopedAssetsSubquery(params.searchQuery, ids))
      .select([lens.as('label'), sql<number>`COUNT(*)`.as('count')])
      .where(sql<SqlBool>`${lens} != ''`)
      .groupBy(lens)
      .orderBy('count', 'desc')
      .orderBy(lens, 'asc')
      .limit(params.limit ?? 8),
  );
}

async function _getTopTextValues(
  params: ScopeParams & { limit?: number },
  column: 'whiteBalance' | 'flash',
): Promise<StatsCountBucket[]> {
  const ids = uniqueAssetIds(params.assetIds);
  if (ids?.length === 0) return [];

  const value = sql<string>`TRIM(${sql.ref(`filesQueryRes.${column}`)})`;
  return selectFromDB(
    kyselyDB
      .selectFrom(scopedAssetsSubquery(params.searchQuery, ids))
      .select([value.as('label'), sql<number>`COUNT(*)`.as('count')])
      .where(sql<SqlBool>`${value} != ''`)
      .groupBy(value)
      .orderBy('count', 'desc')
      .orderBy(value, 'asc')
      .limit(params.limit ?? 5),
  );
}

export function getTopWhiteBalances(params: ScopeParams & { limit?: number }) {
  return _getTopTextValues(params, 'whiteBalance');
}

export function getTopFlashValues(params: ScopeParams & { limit?: number }) {
  return _getTopTextValues(params, 'flash');
}

async function _getNumericBuckets(
  params: ScopeParams & { limit?: number },
  value: ReturnType<typeof sql<number>>,
  valid: ReturnType<typeof sql<SqlBool>>,
): Promise<StatsNumericBucket[]> {
  const ids = uniqueAssetIds(params.assetIds);
  if (ids?.length === 0) return [];

  return selectFromDB(
    kyselyDB
      .selectFrom(scopedAssetsSubquery(params.searchQuery, ids))
      .select([value.as('value'), sql<number>`COUNT(*)`.as('count')])
      .where(valid)
      .groupBy(value)
      .orderBy('count', 'desc')
      .orderBy(value, 'asc')
      .limit(params.limit ?? 10),
  );
}

export function getTopIso(params: ScopeParams & { limit?: number }) {
  return _getNumericBuckets(
    params,
    sql<number>`CAST(ROUND(filesQueryRes.iso) AS INTEGER)`,
    sql<SqlBool>`filesQueryRes.iso > 0`,
  );
}

async function _getNumericDistribution(
  params: ScopeParams,
  value: ReturnType<typeof sql<number>>,
  valid: ReturnType<typeof sql<SqlBool>>,
  bounds: number[],
): Promise<StatsNumericBucket[]> {
  const ids = uniqueAssetIds(params.assetIds);
  if (ids?.length === 0) return [];

  const cases = bounds.map((bound, index) =>
    index === 0 ? sql`WHEN ${value} < ${bound} THEN ${index}` : sql`WHEN ${value} <= ${bound} THEN ${index}`,
  );
  const bucket = sql<number>`CASE ${sql.join(cases, sql` `)} ELSE ${bounds.length} END`;

  return selectFromDB(
    kyselyDB
      .selectFrom(scopedAssetsSubquery(params.searchQuery, ids))
      .select([bucket.as('value'), sql<number>`COUNT(*)`.as('count')])
      .where(valid)
      .groupBy(bucket)
      .orderBy(bucket, 'asc'),
  );
}

export function getIsoDistribution(params: ScopeParams) {
  return _getNumericDistribution(
    params,
    sql<number>`filesQueryRes.iso`,
    sql<SqlBool>`filesQueryRes.iso > 0`,
    ISO_RANGE_BOUNDS,
  );
}

export function getTopFocalLengths(params: ScopeParams & { limit?: number }) {
  return _getNumericBuckets(
    params,
    sql<number>`ROUND(CAST(filesQueryRes.focalLength AS REAL))`,
    sql<SqlBool>`TRIM(COALESCE(filesQueryRes.focalLength, '')) GLOB '[0-9]*' AND CAST(filesQueryRes.focalLength AS REAL) > 0`,
  );
}

export function getFocalLengthDistribution(params: ScopeParams) {
  const value = sql<number>`ROUND(CAST(filesQueryRes.focalLength AS REAL))`;
  return _getNumericDistribution(
    params,
    value,
    sql<SqlBool>`TRIM(COALESCE(filesQueryRes.focalLength, '')) GLOB '[0-9]*' AND CAST(filesQueryRes.focalLength AS REAL) > 0`,
    FOCAL_LENGTH_RANGE_BOUNDS,
  );
}

export function getTopApertures(params: ScopeParams & { limit?: number }) {
  return _getNumericBuckets(
    params,
    sql<number>`ROUND(filesQueryRes.aperture, 1)`,
    sql<SqlBool>`filesQueryRes.aperture > 0`,
  );
}

export function getApertureDistribution(params: ScopeParams) {
  const value = sql<number>`ROUND(filesQueryRes.aperture, 1)`;
  return _getNumericDistribution(
    params,
    value,
    sql<SqlBool>`filesQueryRes.aperture > 0`,
    APERTURE_RANGE_BOUNDS,
  );
}

export function getTopShutterSpeeds(params: ScopeParams & { limit?: number }) {
  return _getNumericBuckets(
    params,
    sql<number>`ROUND(filesQueryRes.shutterSpeed, 3)`,
    sql<SqlBool>`filesQueryRes.shutterSpeed > 0`,
  );
}

export function getShutterSpeedDistribution(params: ScopeParams) {
  const value = sql<number>`ROUND(filesQueryRes.shutterSpeed, 3)`;
  return _getNumericDistribution(
    params,
    value,
    sql<SqlBool>`filesQueryRes.shutterSpeed > 0`,
    SHUTTER_SPEED_RANGE_BOUNDS,
  );
}

export async function getRatingDistribution(params: ScopeParams): Promise<StatsRatingBucket[]> {
  const ids = uniqueAssetIds(params.assetIds);
  if (ids?.length === 0) return [null, 0, 1, 2, 3, 4, 5].map((rating) => ({ rating, count: 0 }));

  const rows = await selectFromDB(
    kyselyDB
      .selectFrom(scopedAssetsSubquery(params.searchQuery, ids))
      .select(['filesQueryRes.rating as rating', sql<number>`COUNT(*)`.as('count')])
      .groupBy('filesQueryRes.rating'),
  );
  const counts = new Map(rows.map((row) => [row.rating, row.count]));
  return [null, 0, 1, 2, 3, 4, 5].map((rating) => ({ rating, count: counts.get(rating) ?? 0 }));
}
