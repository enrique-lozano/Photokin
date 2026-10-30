import { SearchCondition, SearchQuery } from '@/common/fileSearchFilters';
import { selectFirstFromDB, selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { AssetInClient } from '@/db/models/AssetInClient';
import { SqliteDbStructure } from '@/db/models/SqliteDbStructure';
import { useHiddenItemsStore } from '@/stores/hiddenItemsStore';
import { ExpressionBuilder, sql, SqlBool } from 'kysely';
import { assetWithAlbumQuery, toClientAssets } from './assetRows';
import {
  AssetsSearchTables,
  composedLocationLabelSql,
  scopedAssets,
  scopedAssetsSubquery,
  searchConditionExpression,
  uniqueAssetIds,
  withSearchConditions,
} from './assetScope';
import { AlbumFileIndexEntry, AssetDateField, ScopeParams, ScopePlace } from './assetTypes';

export async function getByUUID(id: string): Promise<AssetInClient> {
  const result = await selectFromDB(assetWithAlbumQuery.where('assets.id', '=', id).limit(1));

  const assetFromDB = result.at(0);
  if (!assetFromDB) {
    throw new Error(`No asset found with id "${id}"`);
  }

  return (await toClientAssets([assetFromDB]))[0];
}

/**
 * Ordered id list for a scope, matching the gallery's ordering and the
 * lightbox's prev/next walk (newest first; ties broken by id, same as
 * {@link getAdjacentFile}).
 *
 * Deliberately lightweight: it selects only `id` and skips building the full
 * {@link AssetInClient} (which parses metadata and resolves an absolute path).
 * This lets the filmstrip enumerate the whole page/filter — potentially
 * thousands of items — cheaply, resolving each asset on demand only when its
 * thumbnail scrolls into view.
 */
export async function getScopedAssetIds(
  params: ScopeParams & {
    dateField?: AssetDateField;
    /** Keep the order of `assetIds` instead of sorting by date. */
    preserveOrder?: boolean;
  },
): Promise<string[]> {
  const ids = uniqueAssetIds(params.assetIds);
  if (ids?.length === 0) {
    return [];
  }

  if (ids && params.preserveOrder) {
    const rows = await selectFromDB(scopedAssets(params.searchQuery, ids).select('assets.id'));
    const inScope = new Set(rows.map((row) => row.id));
    return ids.filter((id) => inScope.has(id));
  }

  const dateField = params.dateField ?? 'date';
  const rows = await selectFromDB(
    scopedAssets(params.searchQuery, ids)
      .select('assets.id')
      .orderBy(dateField, 'desc')
      .orderBy('assets.id', 'desc'),
  );

  return rows.map((row) => row.id);
}

export async function getFiles(
  params: ScopeParams & {
    /** Timestamp column to order by. Defaults to the capture `date`. */
    dateField?: AssetDateField;
  },
): Promise<AssetInClient[]> {
  const ids = uniqueAssetIds(params.assetIds);
  if (ids?.length === 0) {
    return [];
  }

  let query = withSearchConditions(assetWithAlbumQuery, params.searchQuery);
  if (ids) {
    query = query.where('assets.id', 'in', ids);
  }

  const result = await selectFromDB(query.orderBy(`${params.dateField ?? 'date'} desc`));

  return toClientAssets(result);
}

export async function getAdjacentFile(
  params: ScopeParams & {
    currentAsset: { id: string; date: Date };
    direction: 'previous' | 'next';
    /** Timestamp column to walk by. Defaults to the capture `date`. */
    dateField?: AssetDateField;
    /** Walk `assetIds` in the given order instead of by date. */
    preserveOrder?: boolean;
  },
): Promise<AssetInClient | null> {
  const ids = uniqueAssetIds(params.assetIds);
  if (ids?.length === 0) {
    return null;
  }

  if (ids && params.preserveOrder) {
    const ordered = await getScopedAssetIds(params);
    const index = ordered.indexOf(params.currentAsset.id);
    const adjacentId =
      index === -1 ? undefined : ordered[params.direction === 'previous' ? index - 1 : index + 1];
    return adjacentId ? getByUUID(adjacentId) : null;
  }

  let query = withSearchConditions(assetWithAlbumQuery, params.searchQuery);
  if (ids) {
    query = query.where('assets.id', 'in', ids);
  }

  const dateField = params.dateField ?? 'date';
  const normalizedDate = params.currentAsset.date.toISOString();
  const isPrevious = params.direction === 'previous';
  // Walking back means "older rows come first", so both the comparison and the
  // ordering flip together; ties are broken by id, like the gallery does.
  const beyondCurrent = (eb: ExpressionBuilder<SqliteDbStructure, AssetsSearchTables>) =>
    eb.or([
      eb(dateField, isPrevious ? '>' : '<', normalizedDate),
      eb.and([
        eb(dateField, '=', normalizedDate),
        eb('assets.id', isPrevious ? '>' : '<', params.currentAsset.id),
      ]),
    ]);
  const direction = isPrevious ? 'asc' : 'desc';

  const result = await selectFromDB(
    query.where(beyondCurrent).orderBy(dateField, direction).orderBy('assets.id', direction).limit(1),
  );

  const adjacentAsset = result.at(0);
  if (!adjacentAsset) {
    return null;
  }

  return (await toClientAssets([adjacentAsset]))[0];
}

export async function getFileCountByMonth(
  params: ScopeParams & {
    /** Timestamp column to bucket by. Defaults to the capture `date`. */
    dateField?: AssetDateField;
  },
) {
  const groupName = 'sectionId';
  const dateColumn = sql.ref(`filesQueryRes.${params.dateField ?? 'date'}`);
  const ids = uniqueAssetIds(params.assetIds);

  if (ids?.length === 0) {
    return [];
  }

  const query = kyselyDB
    .selectFrom(scopedAssetsSubquery(params.searchQuery, ids))
    .select([
      sql<string>`strftime('%Y-%m', ${dateColumn})`.as(groupName),
      sql<number>`COUNT(*)`.as('totalImages'),
      sql<number>`COALESCE(SUM(filesQueryRes.filesize), 0)`.as('totalSizeInBytes'),
    ]);

  return selectFromDB(query.groupBy(groupName).orderBy(groupName, 'desc'));
}

/**
 * Returns the oldest and newest asset date for the given scope (used by page
 * heroes to show a date range). `null` when there are no matching assets.
 */
export async function getDateRange(params: ScopeParams): Promise<{ min: string; max: string } | null> {
  const ids = uniqueAssetIds(params.assetIds);

  if (ids?.length === 0) {
    return null;
  }

  const row = await selectFirstFromDB(
    kyselyDB
      .selectFrom(scopedAssetsSubquery(params.searchQuery, ids))
      .select([
        sql<string>`MIN(filesQueryRes.date)`.as('min'),
        sql<string>`MAX(filesQueryRes.date)`.as('max'),
      ]),
  );

  return row && row.min && row.max ? { min: row.min, max: row.max } : null;
}

/**
 * Counts assets grouped by calendar year (`YYYY`), busiest years first. Powers
 * the intelligent temporal filter chips so each item only offers years that
 * actually contain photos.
 */
export async function getFileCountByYear(params: ScopeParams) {
  const groupName = 'year';
  const ids = uniqueAssetIds(params.assetIds);

  if (ids?.length === 0) {
    return [] as { year: string; totalImages: number }[];
  }

  const query = kyselyDB
    .selectFrom(scopedAssetsSubquery(params.searchQuery, ids))
    .select([
      sql<string>`strftime('%Y', filesQueryRes.date)`.as(groupName),
      sql<number>`COUNT(*)`.as('totalImages'),
    ]);

  return selectFromDB(query.groupBy(groupName).orderBy('totalImages', 'desc'));
}

/**
 * Counts assets grouped by calendar day (UTC `YYYY-MM-DD`). Used by the calendar
 * page to render a date heatmap. Dates are bucketed in UTC to stay consistent
 * with {@link getFileCountByMonth} and the timeline gallery.
 */
export async function getFileCountByDay(params: { searchQuery?: SearchQuery }) {
  const groupName = 'sectionId';

  const query = kyselyDB
    .selectFrom(scopedAssetsSubquery(params.searchQuery))
    .select([
      sql<string>`strftime('%Y-%m-%d', filesQueryRes.date)`.as(groupName),
      sql<number>`COUNT(*)`.as('totalImages'),
      sql<number>`COALESCE(SUM(filesQueryRes.filesize), 0)`.as('totalSizeInBytes'),
    ]);

  return selectFromDB(query.groupBy(groupName).orderBy(groupName, 'desc'));
}

/**
 * Counts assets grouped by their composed, human-readable location label (built
 * in SQL from the structured columns; there is no stored `locationName` column).
 * Powers the free-text location autocomplete and filter drawer. Assets without a
 * location are skipped, and groups are ordered by how many assets they hold
 * (busiest places first).
 */
export async function getFileCountByLocation(params: { searchQuery?: SearchQuery }) {
  const groupName = 'locationName';
  const label = composedLocationLabelSql('filesQueryRes.');

  const query = kyselyDB
    .selectFrom(scopedAssetsSubquery(params.searchQuery))
    .select([
      label.as(groupName),
      sql<number>`COUNT(*)`.as('totalImages'),
      sql<number>`COALESCE(SUM(filesQueryRes.filesize), 0)`.as('totalSizeInBytes'),
    ])
    .where(sql<SqlBool>`${label} IS NOT NULL`);

  return selectFromDB(query.groupBy(label).orderBy('totalImages', 'desc'));
}

/**
 * Counts assets grouped by the structured place columns (city / region /
 * country), which powers the hierarchical Places sidebar. Unlike
 * {@link getFileCountByLocation} (which groups on the composed `locationName`
 * string), this groups on the real columns so "Palma" and "Beach, Palma"
 * collapse into the same city. `NULLIF(TRIM(...))` normalizes blanks to NULL so
 * empty and whitespace values don't fragment groups.
 *
 * At the country level it groups by the canonical ISO code when present, so a
 * country stored in several languages ("Italy"/"Italia") collapses into one
 * group; without a code it falls back to the country name. `MAX(...)` keeps a
 * representative code/name per group (constant within a code group). Rows with
 * no place text at any level are skipped, and groups are ordered busiest-first.
 */
export async function getFileCountByPlace(params: { searchQuery?: SearchQuery }) {
  const countryKey = sql`COALESCE(NULLIF(TRIM(filesQueryRes.locationCountryCode), ''), NULLIF(TRIM(filesQueryRes.locationCountry), ''))`;

  const query = kyselyDB
    .selectFrom(scopedAssetsSubquery(params.searchQuery))
    .select([
      sql<string | null>`NULLIF(TRIM(COALESCE(filesQueryRes.locationCity, '')), '')`.as('city'),
      sql<string | null>`NULLIF(TRIM(COALESCE(filesQueryRes.locationState, '')), '')`.as('state'),
      sql<string | null>`MAX(NULLIF(TRIM(filesQueryRes.locationCountry), ''))`.as('country'),
      sql<string | null>`MAX(NULLIF(TRIM(filesQueryRes.locationCountryCode), ''))`.as('countryCode'),
      sql<number>`COUNT(*)`.as('totalImages'),
      sql<number>`COALESCE(SUM(filesQueryRes.filesize), 0)`.as('totalSizeInBytes'),
    ])
    .where(
      sql<SqlBool>`
          TRIM(COALESCE(filesQueryRes.locationCity, '')) != ''
          OR TRIM(COALESCE(filesQueryRes.locationState, '')) != ''
          OR TRIM(COALESCE(filesQueryRes.locationCountry, '')) != ''
          OR TRIM(COALESCE(filesQueryRes.locationCountryCode, '')) != ''
        `,
    );

  return selectFromDB(
    query
      .groupBy([
        countryKey,
        sql`NULLIF(TRIM(COALESCE(filesQueryRes.locationState, '')), '')`,
        sql`NULLIF(TRIM(COALESCE(filesQueryRes.locationCity, '')), '')`,
      ])
      .orderBy('totalImages', 'desc'),
  );
}

/**
 * Every geotagged asset in scope as bare coordinates, newest first, for the
 * Places map. Lightweight on purpose: the map clusters thousands of these and
 * only loads full assets for the few clusters it shows.
 */
export async function getGeoPoints(params: { searchQuery?: SearchQuery }) {
  return selectFromDB(
    kyselyDB
      .selectFrom(scopedAssetsSubquery(params.searchQuery))
      .select([
        'filesQueryRes.id as id',
        'filesQueryRes.latitude as latitude',
        'filesQueryRes.longitude as longitude',
      ])
      .where('filesQueryRes.latitude', 'is not', null)
      .where('filesQueryRes.longitude', 'is not', null)
      .orderBy('filesQueryRes.date', 'desc'),
  ) as Promise<{ id: string; latitude: number; longitude: number }[]>;
}

/**
 * Counts the assets matching a scope. Used by the intelligent filter chips to
 * score each candidate by how many results it would yield.
 */
export async function getCount(params: ScopeParams): Promise<number> {
  const ids = uniqueAssetIds(params.assetIds);

  if (ids?.length === 0) {
    return 0;
  }

  const row = await selectFirstFromDB(
    scopedAssets(params.searchQuery, ids).select(sql<number>`COUNT(*)`.as('count')),
  );
  return row?.count ?? 0;
}

/**
 * Counts, in a single pass over a scope, how many of its assets also match each
 * entry of `candidates` (that entry's conditions ANDed; an empty list counts the
 * whole scope). One query instead of a `getCount` per candidate: on SQLite over
 * IPC those run one after another, each re-scanning the scope.
 */
export async function getCountsWithin(
  params: ScopeParams,
  candidates: Record<string, SearchCondition[]>,
): Promise<Record<string, number>> {
  const keys = Object.keys(candidates);
  const ids = uniqueAssetIds(params.assetIds);
  if (keys.length === 0 || ids?.length === 0) return Object.fromEntries(keys.map((key) => [key, 0]));

  const row = await selectFirstFromDB(
    scopedAssets(params.searchQuery, ids).select((eb) =>
      keys.map((key, index) => {
        const conditions = candidates[key];
        const count =
          conditions.length === 0
            ? sql<number>`COUNT(*)`
            : sql<number>`COALESCE(SUM(CASE WHEN ${eb.and(
                conditions.map((condition) => searchConditionExpression(eb, condition)),
              )} THEN 1 ELSE 0 END), 0)`;
        return count.as(`c${index}`);
      }),
    ),
  );
  return Object.fromEntries(keys.map((key, index) => [key, Number(row?.[`c${index}`] ?? 0)]));
}

/**
 * Returns the people (confirmed face regions with a tag) that appear most often
 * within a scope, busiest first. Powers the "with {person}" filter chips so each
 * item only offers people that are actually present.
 */
export async function getTopPeopleInScope(
  params: ScopeParams & { limit?: number },
): Promise<{ tagId: string; totalImages: number }[]> {
  const ids = uniqueAssetIds(params.assetIds);

  if (ids?.length === 0) {
    return [];
  }

  let query = scopedAssets(params.searchQuery, ids)
    .innerJoin('tagRegionInfo', 'tagRegionInfo.assetId', 'assets.id')
    .innerJoin('tags', 'tags.id', 'tagRegionInfo.tagId')
    .where('tagRegionInfo.tagId', 'is not', null)
    .where('tagRegionInfo.confirmed', '=', 1)
    .select((eb) => [
      sql<string>`"tagRegionInfo"."tagId"`.as('tagId'),
      eb.fn.count<number>('assets.id').distinct().as('totalImages'),
    ])
    .groupBy('tagRegionInfo.tagId')
    .orderBy('totalImages', 'desc');
  if (!useHiddenItemsStore.getState().showHiddenItems) query = query.where('tags.isHidden', '=', 0);
  const rows = await selectFromDB(query.limit(params.limit ?? 6));

  return rows.filter((row): row is { tagId: string; totalImages: number } => Boolean(row.tagId));
}

/**
 * The busiest places within a scope, bucketed by city and falling back to the
 * country for assets that only carry one (so "Madrid" and "Italy" can sit side by
 * side without overlapping). Powers the place filter chips, so each bucket
 * carries the values needed to filter back to it.
 */
export async function getTopPlacesInScope(params: ScopeParams & { limit?: number }): Promise<ScopePlace[]> {
  const ids = uniqueAssetIds(params.assetIds);

  if (ids?.length === 0) {
    return [];
  }

  const city = sql<string | null>`NULLIF(TRIM(COALESCE(filesQueryRes.locationCity, '')), '')`;
  const country = sql<string | null>`NULLIF(TRIM(COALESCE(filesQueryRes.locationCountry, '')), '')`;
  const countryCode = sql<string | null>`NULLIF(TRIM(COALESCE(filesQueryRes.locationCountryCode, '')), '')`;
  // Assets with a city group by it; the rest fall back to their country (by
  // canonical code when present, so "Italy"/"Italia" stay one bucket).
  const bucket = sql`COALESCE(${city}, ${countryCode}, ${country})`;

  const query = kyselyDB
    .selectFrom(scopedAssetsSubquery(params.searchQuery, ids))
    .select([
      city.as('city'),
      sql<string | null>`MAX(${country})`.as('country'),
      sql<string | null>`MAX(${countryCode})`.as('countryCode'),
      sql<number>`COUNT(*)`.as('totalImages'),
    ])
    .where(sql<SqlBool>`${bucket} IS NOT NULL`);

  return selectFromDB(
    query
      .groupBy(bucket)
      .orderBy('totalImages', 'desc')
      .limit(params.limit ?? 3),
  );
}

/**
 * Lightweight index of an album's assets (filename + tracking fields) used by the
 * library sync to diff against disk without loading full metadata.
 */
export async function getAlbumFileIndex(albumId: string): Promise<AlbumFileIndexEntry[]> {
  const rows = await selectFromDB(
    kyselyDB
      .selectFrom('assets')
      .select(['id', 'filename', 'fileMtime', 'inode', 'filesize'])
      .where('albumId', '=', albumId)
      // Trashed assets have been moved out of the album folder on purpose, so
      // the sync must not treat their absence on disk as a deletion.
      .where('trashedAt', 'is', null),
  );

  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    fileMtime: row.fileMtime ?? null,
    inode: row.inode ?? null,
    filesize: row.filesize,
  }));
}
