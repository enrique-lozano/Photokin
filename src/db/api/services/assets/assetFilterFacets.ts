import { EXPOSURE_STOPS, ExposureField, stopBucketBounds } from '@/common/exposureStops';
import { selectFirstFromDB, selectFromDB } from '@/db/connection/db.service';
import { sql, SqlBool } from 'kysely';
import { scopedAssets, uniqueAssetIds } from './assetScope';
import { ScopeParams } from './assetTypes';

export type ExposureHistograms = Record<ExposureField, number[]> & {
  /** Assets whose EXIF says anything about the flash; 0 hides the flash filter. */
  flashCount: number;
};

/**
 * Same value expressions the exposure filters compare against (see
 * `assetScope`), so a bar's photos are exactly the ones its slider range keeps.
 */
const _EXPOSURE_SQL: Record<ExposureField, { value: string; valid: string }> = {
  iso: { value: '"assets"."iso"', valid: '"assets"."iso" > 0' },
  aperture: { value: 'ROUND("assets"."aperture", 1)', valid: '"assets"."aperture" > 0' },
  shutterSpeed: { value: 'ROUND("assets"."shutterSpeed", 3)', valid: '"assets"."shutterSpeed" > 0' },
  focalLength: {
    value: 'ROUND(CAST("assets"."focalLength" AS REAL))',
    valid: `TRIM(COALESCE("assets"."focalLength", '')) GLOB '[0-9]*' AND CAST("assets"."focalLength" AS REAL) > 0`,
  },
};

async function _histogram(params: ScopeParams, field: ExposureField, ids?: string[]): Promise<number[]> {
  const stops = EXPOSURE_STOPS[field];
  const value = sql.raw<number>(_EXPOSURE_SQL[field].value);
  const cases = stopBucketBounds(stops).map((bound, index) => sql`WHEN ${value} <= ${bound} THEN ${index}`);
  const bucket = sql<number>`CASE ${sql.join(cases, sql` `)} ELSE ${stops.length - 1} END`;

  const rows = await selectFromDB(
    scopedAssets(params.searchQuery, ids)
      .select([bucket.as('bucket'), sql<number>`COUNT(*)`.as('count')])
      .where(sql.raw<SqlBool>(_EXPOSURE_SQL[field].valid))
      .groupBy(bucket),
  );

  const counts = stops.map(() => 0);
  for (const row of rows) counts[row.bucket] = row.count;
  return counts;
}

/**
 * Photo counts per exposure stop (one bucket per entry of `EXPOSURE_STOPS`),
 * drawn behind the filter drawer's sliders.
 */
export async function getExposureHistograms(params: ScopeParams): Promise<ExposureHistograms> {
  const ids = uniqueAssetIds(params.assetIds);
  const empty = (field: ExposureField) => EXPOSURE_STOPS[field].map(() => 0);
  if (ids?.length === 0) {
    return {
      iso: empty('iso'),
      aperture: empty('aperture'),
      shutterSpeed: empty('shutterSpeed'),
      focalLength: empty('focalLength'),
      flashCount: 0,
    };
  }

  const iso = await _histogram(params, 'iso', ids);
  const aperture = await _histogram(params, 'aperture', ids);
  const shutterSpeed = await _histogram(params, 'shutterSpeed', ids);
  const focalLength = await _histogram(params, 'focalLength', ids);
  const flash = await selectFirstFromDB(
    scopedAssets(params.searchQuery, ids)
      .select(sql<number>`COUNT(*)`.as('count'))
      .where(sql<SqlBool>`TRIM(COALESCE("assets"."flash", '')) != ''`),
  );

  return { iso, aperture, shutterSpeed, focalLength, flashCount: flash?.count ?? 0 };
}
