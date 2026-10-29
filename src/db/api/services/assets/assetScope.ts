import { BYTES_PER_MB } from '@/common/bytes';
import { SearchCondition, SearchQuery, SearchQueryType } from '@/common/fileSearchFilters';
import {
  DatePartFilterCriteria,
  FilterCriteria,
  filterCriteriaWhereIndex,
  TextFilterCriteria,
} from '@/common/query/filters/FilterCriteria';
import {
  MediaTypeFilter,
  NumberRangeFilter,
  SearchFilter,
  TextFilter,
} from '@/common/query/filters/FilterTypes';
import { numberOperatorToDBOperator } from '@/common/query/operators/Operators';
import { getConditions } from '@/common/searchQueryUtils';
import { SupportedFormatsWithDots } from '@/common/supportedFormats';
import { kyselyDB } from '@/db/connection/kysely';
import { SqliteDbStructure } from '@/db/models/SqliteDbStructure';
import { FaceStatus } from '@/db/models/TagRegionInfoDTO';
import { useHiddenItemsStore } from '@/stores/hiddenItemsStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { isIn } from '@/utils/array.utils';
import { Expression, ExpressionBuilder, SelectQueryBuilder, sql, SqlBool } from 'kysely';

/** The tables a scoped asset query can reach through its filter sub-queries. */
export type AssetsSearchTables = 'assets' | 'fileTags' | 'tagRegionInfo';

/**
 * SQL expression that composes the human-readable location label from the
 * structured columns, mirroring `composeLocationName` (skip blanks, join with
 * ", "). It replaces the dropped `locationName` column and is shared by the
 * free-text location search's suggestion source and its match target so both
 * stay consistent. `qualifier` is the table alias prefix ("filesQueryRes." or
 * "" for the base `assets` table). Note: unlike the JS helper this does not
 * de-duplicate repeated segments, which only differs in the rare case where a
 * city, region and country share the same name.
 */
export function composedLocationLabelSql(qualifier: string) {
  const segment = (col: string) =>
    sql`COALESCE(NULLIF(TRIM(COALESCE(${sql.ref(`${qualifier}${col}`)}, '')), '') || ', ', '')`;
  return sql<string | null>`NULLIF(TRIM(
    ${segment('locationSublocation')} ||
    ${segment('locationCity')} ||
    ${segment('locationState')} ||
    ${segment('locationCountry')}
  , ', '), '')`;
}

/** De-duplicated id allow-list, or `undefined` when the scope isn't limited to one. */
export function uniqueAssetIds(assetIds?: string[]): string[] | undefined {
  return assetIds ? [...new Set(assetIds)] : undefined;
}

/** `assets` narrowed to a scope: the search filters plus an optional id allow-list. */
export function scopedAssets(searchQuery?: SearchQuery, assetIds?: string[]) {
  const query = withSearchConditions(kyselyDB.selectFrom('assets'), searchQuery);
  return assetIds ? query.where('assets.id', 'in', assetIds) : query;
}

/**
 * The same scope as a `filesQueryRes` sub-query exposing every asset column,
 * which is what the aggregate queries group and filter over.
 */
export function scopedAssetsSubquery(searchQuery?: SearchQuery, assetIds?: string[]) {
  return (eb: ExpressionBuilder<SqliteDbStructure, never>) => {
    const query = withSearchConditions(eb.selectFrom('assets').selectAll(), searchQuery);
    return (assetIds ? query.where('assets.id', 'in', assetIds) : query).as('filesQueryRes');
  };
}

export function videoAssetExpression(qualifier: 'assets.' | 'filesQueryRes.') {
  const filename = sql.ref(`${qualifier}filename`);
  const duration = sql.ref(`${qualifier}duration`);
  const hasVideoExtension = sql<SqlBool>`${sql.join(
    SupportedFormatsWithDots.videos.map(
      (extension) => sql<SqlBool>`lower(${filename}) LIKE ${`%${extension}`}`,
    ),
    sql` OR `,
  )}`;

  return sql<SqlBool>`((${hasVideoExtension}) OR ${duration} > 0)`;
}

export function withSearchConditions<T>(
  query: SelectQueryBuilder<SqliteDbStructure, 'assets', T>,
  searchQuery?: SearchQuery,
): SelectQueryBuilder<SqliteDbStructure, AssetsSearchTables, T> {
  let result = query as SelectQueryBuilder<SqliteDbStructure, AssetsSearchTables, T>;

  const conditions = searchQuery ? getConditions(searchQuery) : [];

  // Trashed assets are hidden from every view by default; only a query that
  // explicitly carries a `trashed` filter (the Trash tab) opts back in.
  const opensTrash = conditions.some((condition) =>
    condition.filters.some((filter) => filter.filterCriteria === FilterCriteria.trashed),
  );
  if (!opensTrash) {
    result = result.where('assets.trashedAt', 'is', null);
  }
  if (!useHiddenItemsStore.getState().showHiddenItems) {
    // Resolved once over `albums` rather than correlated on `assets.albumId`:
    // as an `EXISTS` sub-query SQLite re-ran the whole album walk (including a
    // full scan for the hidden ancestor) for every asset row it visited, which
    // dominated the cost of the lightbox's prev/next lookups. `albums.id` is a
    // primary key, so the list can never contain NULL and `NOT IN` is safe.
    result = result.where(
      sql<SqlBool>`assets.albumId NOT IN (
        SELECT currentAlbum.id
        FROM albums AS currentAlbum
        INNER JOIN rootAlbums AS currentRoot ON currentRoot.id = currentAlbum.rootAlbumId
        WHERE currentAlbum.relativePath GLOB '.*'
          OR currentAlbum.relativePath GLOB '*/.*'
          OR replace(currentRoot.path, char(92), '/') GLOB '*/.*'
          OR EXISTS (
            SELECT 1 FROM albums AS hiddenAncestor
            WHERE hiddenAncestor.rootAlbumId = currentAlbum.rootAlbumId
              AND hiddenAncestor.isHidden = 1
              AND (
                hiddenAncestor.relativePath = '/'
                OR
                currentAlbum.relativePath = hiddenAncestor.relativePath
                OR currentAlbum.relativePath LIKE rtrim(hiddenAncestor.relativePath, '/') || '/%'
              )
          )
      )`,
    );
  }

  // Each condition is applied through correlated `EXISTS`/scalar sub-queries
  // (see `_filterExpression`) rather than joins, so multiple person/tag
  // conditions compose with AND across conditions (e.g. "with X" AND "with Y")
  // without the row duplication a shared join would introduce.
  for (const condition of conditions) {
    result = result.where((eb) => searchConditionExpression(eb, condition));
  }

  return result;
}

/** One search condition as a boolean expression over `assets`: its filters joined by AND (default) or OR. */
export function searchConditionExpression(
  eb: ExpressionBuilder<SqliteDbStructure, AssetsSearchTables>,
  condition: SearchCondition,
): Expression<SqlBool> {
  const filtersSQL = condition.filters.map((filter) => _filterExpression(eb, filter));
  return condition.type === SearchQueryType.OR ? eb.or(filtersSQL) : eb.and(filtersSQL);
}

/**
 * `strftime` format per date-part criterion. `%w` is SQLite's day of week, where
 * 0 is Sunday.
 */
const _DATE_PART_SQL_FORMAT: Record<(typeof DatePartFilterCriteria)[number], string> = {
  [FilterCriteria.year]: '%Y',
  [FilterCriteria.month]: '%m',
  [FilterCriteria.day]: '%d',
  [FilterCriteria.weekday]: '%w',
};

function _filterExpression(
  eb: ExpressionBuilder<SqliteDbStructure, AssetsSearchTables>,
  filter: SearchFilter,
): Expression<SqlBool> {
  if (filter.filterCriteria === FilterCriteria.trashed) {
    return filter.value
      ? sql<SqlBool>`"assets"."trashedAt" IS NOT NULL`
      : sql<SqlBool>`"assets"."trashedAt" IS NULL`;
  }
  if (filter.filterCriteria === FilterCriteria.rated) {
    return filter.value
      ? sql<SqlBool>`"assets"."rating" IS NOT NULL`
      : sql<SqlBool>`"assets"."rating" IS NULL`;
  }
  // EXIF Flash is stored as ExifTool's description ("Fired", "On, Fired",
  // "Off, Did not fire", "No Flash", …): every "fired" variant says "Fired".
  if (filter.filterCriteria === FilterCriteria.flash) {
    const fired = sql<SqlBool>`lower("assets"."flash") LIKE '%fired%'`;
    return filter.value ? fired : sql<SqlBool>`TRIM(COALESCE("assets"."flash", '')) != '' AND NOT (${fired})`;
  }
  // Free-text location matches against a label composed in SQL from the
  // structured columns (there is no stored `locationName`). Handled before the
  // generic text path because it has no single backing column. The same
  // composed expression powers the autocomplete suggestions, so a picked
  // suggestion round-trips as a `contains` match.
  if (filter.filterCriteria === FilterCriteria.location) {
    const f = filter as TextFilter;
    const label = composedLocationLabelSql('assets.');
    if (f.operator === 'equals') {
      if (f.value === '') return sql<SqlBool>`${label} IS NULL`;
      return sql<SqlBool>`${label} = ${f.value}`;
    }
    return sql<SqlBool>`instr(${label}, ${f.value}) > 0`;
  }
  if (filter.filterCriteria === FilterCriteria.camera) {
    const f = filter as TextFilter;
    const camera = sql<string>`TRIM(COALESCE("assets"."make" || ' ', '') || COALESCE("assets"."model", ''))`;
    return f.operator === 'equals'
      ? sql<SqlBool>`${camera} = ${f.value}`
      : sql<SqlBool>`instr(${camera}, ${f.value}) > 0`;
  }

  if (isIn(TextFilterCriteria, filter.filterCriteria)) {
    const f = filter as TextFilter;

    const column = filterCriteriaWhereIndex(filter.filterCriteria);

    if (f.operator === 'equals') {
      // An empty target means "this place has no value at this level" (e.g. a
      // city with no region). SQLite's `= ''` never matches NULL, so match
      // NULL and blank alike; this is what pins a Places selection to the
      // exact structured group, including its missing levels.
      if (f.value === '') {
        return sql<SqlBool>`TRIM(COALESCE(${sql.ref(column)}, '')) = ''`;
      }
      return eb(column, '=', f.value);
    } else if (f.operator === 'contains') {
      // `sql.ref` is required here: a bare string would be bound as a parameter,
      // so the search would look inside the column *name* and never match.
      return eb(sql`instr(${sql.ref(column)}, ${f.value})`, '>', 0);
    }
  }
  if (filter.filterCriteria === FilterCriteria.date) {
    return eb('date', numberOperatorToDBOperator(filter.operator), filter.value.toISOString());
  }
  if (filter.filterCriteria === FilterCriteria.dateAdded) {
    return eb('dateAdded', numberOperatorToDBOperator(filter.operator), filter.value.toISOString());
  }
  if (isIn(DatePartFilterCriteria, filter.filterCriteria)) {
    const format = _DATE_PART_SQL_FORMAT[filter.filterCriteria];
    const f = filter as NumberRangeFilter;
    return eb(
      sql<number>`CAST(strftime(${format}, "assets"."date") AS INTEGER)`,
      numberOperatorToDBOperator(f.operator),
      f.value,
    );
  }
  if (filter.filterCriteria === FilterCriteria.size) {
    return eb('filesize', numberOperatorToDBOperator(filter.operator), filter.value * BYTES_PER_MB);
  }
  if (filter.filterCriteria === FilterCriteria.path) {
    return eb(
      'albumId',
      'in',
      filter.value.map((x) => x.id),
    );
  }
  if (filter.filterCriteria === FilterCriteria.tag) {
    const ids = _resolvedEntityIds(filter.value);
    if (ids.length === 0) return eb(sql<number>`1`, '=', 0);

    // A person tag can be associated through a confirmed face region even when
    // the source file did not originally contain a matching keyword.
    return eb.or([
      eb.exists(
        eb
          .selectFrom('fileTags')
          .select(sql`1`.as('one'))
          .whereRef('fileTags.assetId', '=', 'assets.id')
          .where('fileTags.tagId', 'in', ids),
      ),
      eb.exists(
        eb
          .selectFrom('tagRegionInfo')
          .select(sql`1`.as('one'))
          .whereRef('tagRegionInfo.assetId', '=', 'assets.id')
          .where('tagRegionInfo.confirmed', '=', 1)
          .where('tagRegionInfo.tagId', 'in', ids),
      ),
    ]);
  }
  if (filter.filterCriteria === FilterCriteria.person) {
    const ids = _resolvedEntityIds(filter.value);
    if (ids.length === 0) return eb(sql<number>`1`, '=', 0);

    // Confirmed regions only, so this matches what the people pages count as
    // "a photo of X" and stays consistent with `person_count` below.
    return eb.exists(
      eb
        .selectFrom('tagRegionInfo')
        .select(sql`1`.as('one'))
        .whereRef('tagRegionInfo.assetId', '=', 'assets.id')
        .where('tagRegionInfo.confirmed', '=', 1)
        .where('tagRegionInfo.tagId', 'in', ids),
    );
  }
  if (filter.filterCriteria === FilterCriteria.person_count) {
    const f = filter as NumberRangeFilter;
    const statuses = useSettingsStore.getState().countUnverifiedFaces
      ? [FaceStatus.Pending, FaceStatus.Unknown, FaceStatus.Confirmed]
      : [FaceStatus.Unknown, FaceStatus.Confirmed];
    return eb(
      sql<number>`(select count(*) from "tagRegionInfo" where "tagRegionInfo"."assetId" = "assets"."id" and "tagRegionInfo"."faceStatus" in (${sql.join(statuses)}))`,
      numberOperatorToDBOperator(f.operator),
      f.value,
    );
  }
  if (filter.filterCriteria === FilterCriteria.tag_count) {
    const f = filter as NumberRangeFilter;
    return eb(
      sql<number>`(select count(*) from "fileTags" where "fileTags"."assetId" = "assets"."id")`,
      numberOperatorToDBOperator(f.operator),
      f.value,
    );
  }
  if (filter.filterCriteria === FilterCriteria.rating) {
    const f = filter as NumberRangeFilter;
    return eb('rating', numberOperatorToDBOperator(f.operator), f.value);
  }
  if (filter.filterCriteria === FilterCriteria.iso) {
    const f = filter as NumberRangeFilter;
    const value =
      f.operator === 'equals'
        ? sql<number>`CAST(ROUND("assets"."iso") AS INTEGER)`
        : sql<number>`"assets"."iso"`;
    return eb(value, numberOperatorToDBOperator(f.operator), f.value);
  }
  if (filter.filterCriteria === FilterCriteria.focalLength) {
    const f = filter as NumberRangeFilter;
    return eb(
      sql<number>`ROUND(CAST("assets"."focalLength" AS REAL))`,
      numberOperatorToDBOperator(f.operator),
      f.value,
    );
  }
  if (filter.filterCriteria === FilterCriteria.aperture) {
    const f = filter as NumberRangeFilter;
    return eb(sql<number>`ROUND("assets"."aperture", 1)`, numberOperatorToDBOperator(f.operator), f.value);
  }
  if (filter.filterCriteria === FilterCriteria.shutterSpeed) {
    const f = filter as NumberRangeFilter;
    return eb(
      sql<number>`ROUND("assets"."shutterSpeed", 3)`,
      numberOperatorToDBOperator(f.operator),
      f.value,
    );
  }
  if (filter.filterCriteria === FilterCriteria.mediaType) {
    const f = filter as MediaTypeFilter;
    const isVideoExpression = videoAssetExpression('assets.');

    if (f.value === 'video') {
      return isVideoExpression;
    }

    return sql<SqlBool>`NOT (${isVideoExpression})`;
  }

  throw new Error(`No SQL expression for filter "${String(filter.filterCriteria)}"`);
}

function _resolvedEntityIds(values: Array<string | { id: string }>): string[] {
  const ids: string[] = [];
  for (const value of values) {
    if (typeof value === 'string') {
      throw new Error('Tag and person search values must be resolved before querying assets');
    }
    ids.push(value.id);
  }
  return ids;
}
