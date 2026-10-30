import { SupportedFormatsWithDots } from '@/common/supportedFormats';
import {
  executeInDB,
  safelyExecuteBatchInsert,
  selectFirstFromDB,
  selectFromDB,
} from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { PersonInfo, PersonKind, PersonRegion } from '@/db/models/PersonInfo';
import { AreaBox, FaceStatus, TagRegionInfoDTO, TagRegionInfoInClient } from '@/db/models/TagRegionInfoDTO';
import { useAppStore } from '@/stores/appState';
import { useHiddenItemsStore } from '@/stores/hiddenItemsStore';
import { joinPathSync } from '@/system/diskManager';
import { sql, SqlBool } from 'kysely';
import { assertAssetsMetadataScanned, assertRegionAssetsMetadataScanned } from './assets/assetMetadataGuard';
import { writeRegionsForAssets } from './assets/regionFileWrites';
import { writeKeywordsForAssets } from './assets/tagFileWrites';
import { TagsService } from './tags.service';

/**
 * The person a face row belongs to: its named tag, else its cluster, else the
 * shared "unsorted" bucket. Returns a fresh expression per call so it can be
 * used in `select` and `groupBy` of the same query.
 */
const personGroupKey = () =>
  sql<string>`COALESCE("tagRegionInfo"."tagId", "tagRegionInfo"."clusterId", 'unsorted')`;

/** Keeps filename/confirmed flags above any pixel-area term in the avatar rank. */
const REPRESENTATIVE_RANK_SCALE = 1_000_000_000_000;

/** Face regions are a still-photo feature; videos must never surface in people flows. */
export const photoAssetSql = () => {
  const videoExtensions = SupportedFormatsWithDots.videos.map(
    (extension) => sql<boolean>`lower("assets"."filename") LIKE ${`%${extension}`}`,
  );
  return sql<boolean>`(
    "assets"."id" IS NULL OR NOT (
      (${sql.join(videoExtensions, sql` OR `)})
      OR COALESCE("assets"."duration", 0) > 0
    )
  )`;
};

const visibleAlbumSql = () => sql<boolean>`(
  "albums"."id" IS NULL
  OR (
  "albums"."relativePath" NOT GLOB '.*'
  AND "albums"."relativePath" NOT GLOB '*/.*'
  AND replace("rootAlbums"."path", char(92), '/') NOT GLOB '*/.*'
  AND NOT EXISTS (
    SELECT 1 FROM albums AS hiddenAncestor
    WHERE hiddenAncestor.rootAlbumId = "albums"."rootAlbumId"
      AND hiddenAncestor.isHidden = 1
      AND (
        hiddenAncestor.relativePath = '/'
        OR
        "albums"."relativePath" = hiddenAncestor.relativePath
        OR "albums"."relativePath" LIKE rtrim(hiddenAncestor.relativePath, '/') || '/%'
      )
  ))
)`;

// Aggregate scans check ancestry once per album; scoped face queries keep the direct check.
const visibleAlbumListSql = () => sql<boolean>`(
  "albums"."id" IS NULL
  OR "albums"."id" IN (
    SELECT "albums"."id" FROM albums
    LEFT JOIN rootAlbums ON "rootAlbums"."id" = "albums"."rootAlbumId"
    WHERE ${visibleAlbumSql()}
  )
)`;

/**
 * Share of the smaller box two faces in one photo must cover to be the same face
 * detected twice. Keep in sync with `ALREADY_TAGGED_OVERLAP_THRESHOLD` in the scanner.
 */
const SAME_FACE_OVERLAP = 0.5;

/** Reports how many of the affected files have been written so far. */
type FileWriteProgress = (processed: number, total: number) => void;

/** One face that carries several boxes for the same person in one photo. */
export type FaceIssue = {
  /** Best box to keep first: confirmed, then named. */
  regions: PersonRegion[];
};

class _RegionsService {
  constructor() {}

  async getRepresentativeRegions(): Promise<Map<string, PersonRegion>> {
    return this._fetchRepresentativeRegions();
  }

  async getRegionTags() {
    // Everything here is per-person, never per-face: the People pages only need
    // totals and one avatar each, so loading every region in the library (and
    // resolving a path for each) would cost seconds on a real collection.
    const [allTags, counts, representativeByPerson] = await Promise.all([
      TagsService.getAll(),
      this._fetchPersonCounts(),
      this.getRepresentativeRegions(),
    ]);
    const tagById = new Map(allTags.map((tag) => [tag.id, tag]));

    const people = counts.map((row): PersonInfo => {
      const kind: PersonKind = row.isKnown ? 'known' : row.hasCluster ? 'unknown' : 'unsorted';
      const tag = kind === 'known' ? tagById.get(row.id) : undefined;

      return {
        id: row.id,
        kind,
        displayName:
          kind === 'known'
            ? (tag?.name ?? 'Unknown person')
            : kind === 'unsorted'
              ? 'Unsorted faces (no stable group yet)'
              : '',
        totalResults: row.totalResults,
        tag,
        unconfirmedResults: row.unconfirmedResults,
        representativeRegion: representativeByPerson.get(row.id),
      };
    });

    const unknownGroups = people
      .filter((group) => group.kind === 'unknown')
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const [index, group] of unknownGroups.entries()) {
      group.displayName = `Unknown #${index + 1}`;
    }

    return people.sort((a, b) => {
      if (a.kind !== b.kind) {
        const order: Record<PersonKind, number> = { known: 0, unknown: 1, unsorted: 2 };
        return order[a.kind] - order[b.kind];
      }

      return a.displayName.localeCompare(b.displayName);
    });
  }

  /**
   * Inserts a detected region unless an identical one already exists, returning
   * the resulting region id and whether it was newly inserted. The caller uses
   * the id to attach the face embedding (stored separately as a BLOB via Rust);
   * `inserted: false` means the embedding is already present and can be skipped.
   */
  async insertRegionIfNotDuplicate(region: TagRegionInfoDTO): Promise<{ id: string; inserted: boolean }> {
    const existing = await selectFirstFromDB(
      kyselyDB
        .selectFrom('tagRegionInfo')
        .select('id')
        .where('assetId', '=', region.assetId)
        .where('x', '=', region.x)
        .where('y', '=', region.y)
        .where('w', '=', region.w)
        .where('h', '=', region.h)
        .$if(region.tagId == null, (query) => query.where('tagId', 'is', null))
        .$if(region.tagId != null, (query) => query.where('tagId', '=', region.tagId!)),
    );

    if (existing) {
      return { id: existing.id, inserted: false };
    }

    await executeInDB(kyselyDB.insertInto('tagRegionInfo').values(region), ['tagRegionInfo']);
    return { id: region.id, inserted: true };
  }

  async getImageRegions(imgId: string) {
    const dbItems = await selectFromDB(
      kyselyDB
        .selectFrom('tagRegionInfo')
        .leftJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
        .where('tagRegionInfo.assetId', '=', imgId)
        .where('tagRegionInfo.faceStatus', '!=', FaceStatus.Rejected)
        .where(photoAssetSql())
        .selectAll('tagRegionInfo'),
    );

    return dbItems.map((item) => TagRegionInfoInClient.fromDB(item));
  }

  /**
   * The face regions that belong in each asset's file metadata: confirmed and
   * linked to a named person (see {@link TagRegionInfoDTO.confirmed}). Each is
   * paired with its person's tag name — exactly the `Name` the reader matches a
   * region back to on import — so writes and reads stay symmetric. Detected
   * suggestions (unconfirmed) and unnamed detections are excluded, since the
   * reader could not re-import a region whose name matches no person tag anyway.
   * The area stays in Photokin's display-oriented, normalized, center-based
   * space; the writer converts it to the file's raw frame.
   */
  async getWritableRegionsForAssets(
    assetIds: string[],
  ): Promise<Map<string, { name: string; area: AreaBox }[]>> {
    const byAsset = new Map<string, { name: string; area: AreaBox }[]>();
    if (assetIds.length === 0) return byAsset;

    const rows = await selectFromDB(
      kyselyDB
        .selectFrom('tagRegionInfo')
        .innerJoin('tags', 'tags.id', 'tagRegionInfo.tagId')
        .leftJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
        .select([
          'tagRegionInfo.assetId as assetId',
          'tags.name as name',
          'tagRegionInfo.x as x',
          'tagRegionInfo.y as y',
          'tagRegionInfo.w as w',
          'tagRegionInfo.h as h',
        ])
        .where('tagRegionInfo.assetId', 'in', assetIds)
        .where('tagRegionInfo.confirmed', '=', 1)
        .where(photoAssetSql()),
    );

    for (const row of rows) {
      const list = byAsset.get(row.assetId) ?? [];
      list.push({ name: row.name, area: { x: row.x, y: row.y, w: row.w, h: row.h } });
      byAsset.set(row.assetId, list);
    }

    return byAsset;
  }

  /** Counts face regions for each requested asset. */
  async getRegionCountsForAssets(assetIds: string[]): Promise<Map<string, number>> {
    if (assetIds.length === 0) return new Map();

    const rows = await selectFromDB(
      kyselyDB
        .selectFrom('tagRegionInfo')
        .leftJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
        .select('tagRegionInfo.assetId as assetId')
        .select(sql<number>`COUNT(*)`.as('count'))
        .where('tagRegionInfo.assetId', 'in', assetIds)
        .where('tagRegionInfo.faceStatus', '!=', FaceStatus.Rejected)
        .where(photoAssetSql())
        .groupBy('tagRegionInfo.assetId'),
    );

    return new Map(rows.map((row) => [row.assetId, row.count]));
  }

  /**
   * How many faces a Recognize run would re-check: every unconfirmed region, which
   * is the same candidate set {@link matchFacesToPeople} builds. Counted in SQL so
   * the header actions can gate on it without loading the regions themselves.
   */
  async getUnconfirmedRegionCount(): Promise<number> {
    const row = await selectFirstFromDB(
      kyselyDB
        .selectFrom('tagRegionInfo')
        .leftJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
        .select(sql<number>`COUNT(*)`.as('count'))
        .where('tagRegionInfo.faceStatus', '=', FaceStatus.Pending)
        .where(photoAssetSql()),
    );

    return row?.count ?? 0;
  }

  /**
   * Faces the matcher linked to a named person that nobody has confirmed yet.
   * Powers the Suggested faces page, where they only need a yes or a no.
   */
  async getSuggestedRegions(): Promise<PersonRegion[]> {
    const query = this._buildFaceRegionsQuery()
      .where('tagRegionInfo.faceStatus', '=', FaceStatus.Pending)
      .where('tagRegionInfo.tagId', 'is not', null);
    const rows = await this._rowsWithPathFromQuery(query);
    return rows.map((row) => this._toPersonRegion(row));
  }

  /**
   * Faces not linked to anyone yet — clustered groups and unsorted singles
   * alike. Powers the Unknown faces page, where they still need a name.
   */
  async getUnknownRegions(): Promise<PersonRegion[]> {
    const query = this._buildFaceRegionsQuery()
      .where('tagRegionInfo.faceStatus', '=', FaceStatus.Pending)
      .where('tagRegionInfo.tagId', 'is', null);
    const rows = await this._rowsWithPathFromQuery(query);
    return rows.map((row) => this._toPersonRegion(row));
  }

  /**
   * Detector score and box area in source pixels of every unnamed, ungrouped
   * pending face, for the Unsorted faces clean-up. `pixelArea` is `null` when
   * the photo size is unknown.
   */
  async getUnsortedFaceQuality(): Promise<
    { id: string; detectionScore: number | null; pixelArea: number | null }[]
  > {
    const rows = await selectFromDB(
      kyselyDB
        .selectFrom('tagRegionInfo')
        .leftJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
        .select([
          'tagRegionInfo.id as id',
          'tagRegionInfo.detectionScore as detectionScore',
          sql<
            number | null
          >`CASE WHEN assets.width > 0 AND assets.height > 0 THEN tagRegionInfo.w * tagRegionInfo.h * assets.width * assets.height END`.as(
            'pixelArea',
          ),
        ])
        .where('tagRegionInfo.faceStatus', '=', FaceStatus.Pending)
        .where('tagRegionInfo.tagId', 'is', null)
        .where('tagRegionInfo.clusterId', 'is', null),
    );
    return rows.map((row) => ({ ...row, detectionScore: row.detectionScore ?? null }));
  }

  async getPersonRegions(params: { personId: string; kind: PersonKind }): Promise<PersonRegion[]> {
    let query = this._buildFaceRegionsQuery();

    if (params.kind === 'known') {
      query = query.where('tagRegionInfo.tagId', '=', params.personId);
    } else if (params.kind === 'unknown') {
      query = query
        .where('tagRegionInfo.tagId', 'is', null)
        .where('tagRegionInfo.clusterId', '=', params.personId);
    } else {
      query = query.where('tagRegionInfo.tagId', 'is', null).where('tagRegionInfo.clusterId', 'is', null);
    }

    const rows = await this._rowsWithPathFromQuery(query);
    return rows.map((row) => this._toPersonRegion(row));
  }

  /**
   * Promotes suggested faces to confirmed and mirrors them into their files.
   * Returns `assetId → message` for the files that could not be written: the
   * library change is committed either way, so a partial failure is data the
   * caller reports, not an error that hides what did go through.
   */
  async confirmRegions(
    regionIds: string[],
    onFileProgress?: FileWriteProgress,
  ): Promise<Map<string, string>> {
    if (regionIds.length === 0) return new Map();

    await assertRegionAssetsMetadataScanned(regionIds);
    const assignments = await this._regionAssignments(regionIds);
    await executeInDB(
      kyselyDB
        .updateTable('tagRegionInfo')
        .set({ confirmed: 1, faceStatus: FaceStatus.Confirmed })
        .where('id', 'in', regionIds)
        .where('tagId', 'is not', null),
      ['tagRegionInfo'],
    );

    return this._writeFaceMetadata(assignments, onFileProgress);
  }

  async assignRegionsToPerson(regionIds: string[], tagId: string, options: { confirm?: boolean } = {}) {
    const failures = await this.assignRegionsToPersonWithOutcome(regionIds, tagId, options);
    if (failures.size > 0) {
      throw new Error(
        `Face names were saved, but ${failures.size} file${failures.size === 1 ? '' : 's'} could not be updated`,
      );
    }
  }

  /** Assignment variant for dialogs that surface per-file results inline. */
  async assignRegionsToPersonWithOutcome(
    regionIds: string[],
    tagId: string,
    options: { confirm?: boolean; onFileProgress?: FileWriteProgress } = {},
  ): Promise<Map<string, string>> {
    if (regionIds.length === 0) return new Map();

    const previousAssignments = options.confirm ? await this._regionAssignments(regionIds) : [];
    if (options.confirm) {
      await assertRegionAssetsMetadataScanned(regionIds);
    }
    await executeInDB(
      kyselyDB
        .updateTable('tagRegionInfo')
        .set({
          tagId,
          clusterId: null,
          confirmed: options.confirm ? 1 : 0,
          faceStatus: options.confirm ? FaceStatus.Confirmed : FaceStatus.Pending,
        })
        .where('id', 'in', regionIds),
      ['tagRegionInfo'],
    );

    // Only a confirmed assignment belongs in the file; the identify pass assigns
    // unconfirmed suggestions library-wide and must not touch a single file.
    if (options.confirm) {
      return this._writeFaceMetadata(
        [...previousAssignments, ...(await this._regionAssignments(regionIds))],
        options.onFileProgress,
      );
    }
    return new Map();
  }

  async clearUnconfirmedAssignments(regionIds: string[]) {
    if (regionIds.length === 0) return;

    await executeInDB(
      kyselyDB
        .updateTable('tagRegionInfo')
        .set({ tagId: sql<string>`NULL`, clusterId: null })
        .where('id', 'in', regionIds)
        .where('faceStatus', '=', FaceStatus.Pending),
      ['tagRegionInfo'],
    );
  }

  async createPersonFromRegions(
    personName: string,
    regionIds: string[],
    options: { confirm?: boolean } = {},
  ) {
    const { person, fileFailures } = await this.createPersonFromRegionsWithOutcome(
      personName,
      regionIds,
      options,
    );
    if (fileFailures.size > 0) {
      throw new Error(
        `Created ${person.name}, but ${fileFailures.size} file${
          fileFailures.size === 1 ? '' : 's'
        } could not be updated`,
      );
    }
    return person;
  }

  /** Person-creation variant for dialogs that surface per-file results inline. */
  async createPersonFromRegionsWithOutcome(
    personName: string,
    regionIds: string[],
    options: { confirm?: boolean; onFileProgress?: FileWriteProgress } = {},
  ) {
    const normalizedName = personName.replaceAll('/', ' ').replace(/\s+/g, ' ').trim();
    if (!normalizedName) {
      throw new Error('A person name can not be empty');
    }

    const [conflict] = await TagsService.findByNamesOrPaths([normalizedName]);
    if (conflict) {
      throw new Error(
        `A tag named "${conflict.fullPath}" already exists. Use the existing tag as this person.`,
      );
    }

    if (options.confirm) {
      await assertRegionAssetsMetadataScanned(regionIds);
    }
    const tag = await TagsService.createTag(`People/${normalizedName}`);
    const fileFailures = await this.assignRegionsToPersonWithOutcome(regionIds, tag.id, options);
    return { person: tag, fileFailures };
  }

  /** Permanently marks detections as not faces while retaining their boxes for future scans. */
  async rejectRegions(regionIds: string[], onFileProgress?: FileWriteProgress): Promise<Map<string, string>> {
    if (regionIds.length === 0) return new Map();

    await assertRegionAssetsMetadataScanned(regionIds);
    // Captured before the rejection: a face that was already written has
    // to leave its file too, which means rewriting what the asset still has.
    const assignments = await this._regionAssignments(regionIds, { confirmedOnly: true });
    await executeInDB(
      kyselyDB
        .updateTable('tagRegionInfo')
        .set({ tagId: sql<string>`NULL`, clusterId: null, confirmed: 0, faceStatus: FaceStatus.Rejected })
        .where('id', 'in', regionIds),
      ['tagRegionInfo'],
    );

    return this._writeFaceMetadata(assignments, onFileProgress);
  }

  /** Marks real faces as intentionally unnamed and excludes them from future matching/review. */
  async hideRegions(regionIds: string[], onFileProgress?: FileWriteProgress): Promise<Map<string, string>> {
    if (regionIds.length === 0) return new Map();
    await assertRegionAssetsMetadataScanned(regionIds);
    const assignments = await this._regionAssignments(regionIds, { confirmedOnly: true });
    await executeInDB(
      kyselyDB
        .updateTable('tagRegionInfo')
        .set({ tagId: sql<string>`NULL`, clusterId: null, confirmed: 0, faceStatus: FaceStatus.Unknown })
        .where('id', 'in', regionIds),
      ['tagRegionInfo'],
    );
    return this._writeFaceMetadata(assignments, onFileProgress);
  }

  /** Unlinks faces from their person, returning them to the Unknown faces review queue. */
  async unassignRegions(
    regionIds: string[],
    onFileProgress?: FileWriteProgress,
  ): Promise<Map<string, string>> {
    if (regionIds.length === 0) return new Map();
    await assertRegionAssetsMetadataScanned(regionIds);
    const assignments = await this._regionAssignments(regionIds, { confirmedOnly: true });
    await executeInDB(
      kyselyDB
        .updateTable('tagRegionInfo')
        .set({ tagId: sql<string>`NULL`, clusterId: null, confirmed: 0, faceStatus: FaceStatus.Pending })
        .where('id', 'in', regionIds),
      ['tagRegionInfo'],
    );
    return this._writeFaceMetadata(assignments, onFileProgress);
  }

  async getHiddenRegions(): Promise<PersonRegion[]> {
    const rows = await this._rowsWithPathFromQuery(
      this._buildFaceRegionsQuery().where('tagRegionInfo.faceStatus', '=', FaceStatus.Unknown),
    );
    return rows.map((row) => this._toPersonRegion(row));
  }

  async getHiddenRegionCount(): Promise<number> {
    const row = await selectFirstFromDB(
      kyselyDB
        .selectFrom('tagRegionInfo')
        .select(sql<number>`COUNT(*)`.as('count'))
        .where('faceStatus', '=', FaceStatus.Unknown),
    );
    return row?.count ?? 0;
  }

  /**
   * Faces of a photo carrying more than one box for the same person, optionally
   * only those involving `personId`. Overlapping boxes named as different people
   * are left alone: the user assigned both on purpose. The same person on
   * separate faces is not reported either — collages and reflections make that
   * legitimate.
   */
  async getFaceIssues(personId?: string): Promise<FaceIssue[]> {
    const overlap = sql<number>`
      MAX(0, MIN("a"."x" + "a"."w" / 2, "b"."x" + "b"."w" / 2) - MAX("a"."x" - "a"."w" / 2, "b"."x" - "b"."w" / 2))
      * MAX(0, MIN("a"."y" + "a"."h" / 2, "b"."y" + "b"."h" / 2) - MAX("a"."y" - "a"."h" / 2, "b"."y" - "b"."h" / 2))
      / MIN("a"."w" * "a"."h", "b"."w" * "b"."h")`;
    const pairs = await selectFromDB(
      kyselyDB
        .selectFrom('tagRegionInfo as a')
        .innerJoin('tagRegionInfo as b', (join) =>
          join.onRef('a.assetId', '=', 'b.assetId').onRef('a.id', '<', 'b.id'),
        )
        .select(['a.id as aId', 'b.id as bId'])
        .where('a.faceStatus', 'in', [FaceStatus.Pending, FaceStatus.Confirmed])
        .where('b.faceStatus', 'in', [FaceStatus.Pending, FaceStatus.Confirmed])
        .where(overlap, '>', SAME_FACE_OVERLAP)
        .$if(personId != null, (query) =>
          query.where(sql<SqlBool>`${personId} IN ("a"."tagId", "b"."tagId")`),
        ),
    );

    // Boxes chained by overlap are one face, even when three scans each left one.
    const parent = new Map<string, string>();
    const faceOf = (id: string): string => {
      const next = parent.get(id) ?? id;
      return next === id ? id : faceOf(next);
    };
    for (const { aId, bId } of pairs) parent.set(faceOf(bId), faceOf(aId));

    const ids = pairs.flatMap(({ aId, bId }) => [aId, bId]);
    if (ids.length === 0) return [];
    const rows = await this._rowsWithPathFromQuery(
      this._buildFaceRegionsQuery().where('tagRegionInfo.id', 'in', ids).orderBy('tagRegionInfo.assetId'),
    );
    const byFace = new Map<string, PersonRegion[]>();
    for (const row of rows) {
      const face = faceOf(row.id);
      byFace.set(face, [...(byFace.get(face) ?? []), this._toPersonRegion(row)]);
    }

    const rank = (region: PersonRegion) => (region.confirmed ? 2 : 0) + (region.tagId ? 1 : 0);
    return [...byFace.values()]
      .filter((regions) => {
        if (regions.length < 2) return false;
        // Different named people on one face are not duplicates — leave them.
        return new Set(regions.flatMap((region) => region.tagId ?? [])).size <= 1;
      })
      .map((regions) => ({
        regions: regions.sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id)),
      }));
  }

  /** Returns intentionally unnamed faces to the normal unverified review queue. */
  async restoreHiddenRegions(regionIds: string[]): Promise<void> {
    if (regionIds.length === 0) return;
    await executeInDB(
      kyselyDB
        .updateTable('tagRegionInfo')
        .set({ faceStatus: FaceStatus.Pending })
        .where('id', 'in', regionIds)
        .where('faceStatus', '=', FaceStatus.Unknown),
      ['tagRegionInfo'],
    );
  }

  /** Full DB rows for the given regions, used to snapshot them before a discard. */
  async getRegionsByIds(regionIds: string[]): Promise<TagRegionInfoDTO[]> {
    if (regionIds.length === 0) return [];

    return selectFromDB(kyselyDB.selectFrom('tagRegionInfo').selectAll().where('id', 'in', regionIds));
  }

  /** Re-inserts previously discarded regions verbatim (undo of {@link rejectRegions}). */
  async restoreRegions(rows: TagRegionInfoDTO[]) {
    if (rows.length === 0) return;

    await assertAssetsMetadataScanned(rows.map((row) => row.assetId));
    await executeInDB(kyselyDB.insertInto('tagRegionInfo').values(rows), ['tagRegionInfo']);

    await this._writeFaceMetadataOrThrow(
      rows
        .filter((row) => row.confirmed === 1 && row.tagId != null)
        .map((row) => ({ assetId: row.assetId, tagId: row.tagId! })),
    );
  }

  /** Restores assignment/confirmation state without deleting region rows or embeddings. */
  async restoreRegionStates(rows: TagRegionInfoDTO[]) {
    if (rows.length === 0) return;

    await assertAssetsMetadataScanned(rows.map((row) => row.assetId));
    const currentAssignments = await this._regionAssignments(
      rows.map((row) => row.id),
      { confirmedOnly: true },
    );
    const when = <T>(value: (row: TagRegionInfoDTO) => T) =>
      sql.join(
        rows.map((row) => sql`WHEN ${row.id} THEN ${value(row)}`),
        sql` `,
      );
    await executeInDB(
      kyselyDB
        .updateTable('tagRegionInfo')
        .set({
          tagId: sql<string>`CASE id ${when((row) => row.tagId)} ELSE tagId END`,
          clusterId: sql<string>`CASE id ${when((row) => row.clusterId)} ELSE clusterId END`,
          confirmed: sql<0 | 1>`CASE id ${when((row) => row.confirmed)} ELSE confirmed END`,
          faceStatus: sql<
            TagRegionInfoDTO['faceStatus']
          >`CASE id ${when((row) => row.faceStatus)} ELSE faceStatus END`,
        })
        .where(
          'id',
          'in',
          rows.map((row) => row.id),
        ),
      ['tagRegionInfo'],
    );
    const restoredAssignments = rows
      .filter((row) => row.confirmed === 1 && row.tagId != null)
      .map((row) => ({ assetId: row.assetId, tagId: row.tagId! }));
    await this._writeFaceMetadataOrThrow([...currentAssignments, ...restoredAssignments]);
  }

  /** Deletes every detected face region belonging to the given assets. */
  async removeRegionsForAssets(assetIds: string[]) {
    if (assetIds.length === 0) return;

    await executeInDB(kyselyDB.deleteFrom('tagRegionInfo').where('assetId', 'in', assetIds), [
      'tagRegionInfo',
    ]);
  }

  async clearRegionClusters(regionIds: string[]) {
    if (regionIds.length === 0) return;

    await executeInDB(
      kyselyDB
        .updateTable('tagRegionInfo')
        .set({ clusterId: null })
        .where('tagId', 'is', null)
        .where('faceStatus', '=', FaceStatus.Pending)
        .where('id', 'in', regionIds),
      ['tagRegionInfo'],
    );
  }

  async assignCluster(regionIds: string[], clusterId: string) {
    if (regionIds.length === 0) return;

    await executeInDB(
      kyselyDB
        .updateTable('tagRegionInfo')
        .set({ clusterId })
        .where('tagId', 'is', null)
        .where('faceStatus', '=', FaceStatus.Pending)
        .where('id', 'in', regionIds),
      ['tagRegionInfo'],
    );
  }

  /**
   * One confirmed face per person tag, keyed by tag id. Used as the avatar in
   * compact UI (filter chips) — unlike {@link getRegionTags} it never loads the
   * whole library's regions, so it stays cheap for a handful of people.
   */
  async getRepresentativeRegionsByTag(tagIds: string[]): Promise<Map<string, PersonRegion>> {
    if (tagIds.length === 0) return new Map();
    return this._fetchRepresentativeRegions([...new Set(tagIds)], true);
  }

  /** Named face assignments represented by the requested region rows. */
  private async _regionAssignments(
    regionIds: string[],
    options: { confirmedOnly?: boolean } = {},
  ): Promise<{ assetId: string; tagId: string }[]> {
    if (regionIds.length === 0) return [];

    return selectFromDB(
      kyselyDB
        .selectFrom('tagRegionInfo')
        .select(['assetId', 'tagId'])
        .where('id', 'in', regionIds)
        .where('tagId', 'is not', null)
        .$if(options.confirmedOnly === true, (query) => query.where('confirmed', '=', 1)),
    ) as Promise<{ assetId: string; tagId: string }[]>;
  }

  /**
   * Makes keyword membership match confirmed face membership for the affected
   * person/asset pairs. Other tags on those assets are left untouched.
   */
  private async _syncPersonKeywords(assignments: { assetId: string; tagId: string }[]) {
    const assetIds = [...new Set(assignments.map((row) => row.assetId))];
    const tagIds = [...new Set(assignments.map((row) => row.tagId))];
    if (assetIds.length === 0 || tagIds.length === 0) return;

    const pairKey = (assetId: string, tagId: string) => `${assetId}\0${tagId}`;
    const candidateKeys = new Set(assignments.map((row) => pairKey(row.assetId, row.tagId)));
    const [confirmed, current] = await Promise.all([
      selectFromDB(
        kyselyDB
          .selectFrom('tagRegionInfo')
          .select(['assetId', 'tagId'])
          .distinct()
          .where('assetId', 'in', assetIds)
          .where('tagId', 'in', tagIds)
          .where('confirmed', '=', 1),
      ),
      selectFromDB(
        kyselyDB
          .selectFrom('fileTags')
          .select(['assetId', 'tagId'])
          .where('assetId', 'in', assetIds)
          .where('tagId', 'in', tagIds),
      ),
    ]);
    const desired = confirmed.filter(
      (row): row is { assetId: string; tagId: string } =>
        row.tagId != null && candidateKeys.has(pairKey(row.assetId, row.tagId)),
    );
    const desiredKeys = new Set(desired.map((row) => pairKey(row.assetId, row.tagId)));
    const currentKeys = new Set(current.map((row) => pairKey(row.assetId, row.tagId)));
    const additions = desired.filter((row) => !currentKeys.has(pairKey(row.assetId, row.tagId)));
    const removals = current.filter(
      (row) =>
        candidateKeys.has(pairKey(row.assetId, row.tagId)) &&
        !desiredKeys.has(pairKey(row.assetId, row.tagId)),
    );

    if (additions.length > 0) {
      await safelyExecuteBatchInsert('fileTags', additions);
    }
    const removalsByTag = new Map<string, typeof removals>();
    for (const row of removals) {
      const rows = removalsByTag.get(row.tagId) ?? [];
      rows.push(row);
      removalsByTag.set(row.tagId, rows);
    }
    for (const [tagId, rows] of removalsByTag) {
      await executeInDB(
        kyselyDB
          .deleteFrom('fileTags')
          .where('tagId', '=', tagId)
          .where(
            'assetId',
            'in',
            rows.map((row) => row.assetId),
          ),
        'fileTags',
      );
    }

    const changedAssetIds = [...new Set([...additions, ...removals].map((row) => row.assetId))];
    if (changedAssetIds.length > 0) {
      useAppStore.getState().markAssetChanged(changedAssetIds);
    }
  }

  /**
   * Pushes the affected assets' current face regions and person keywords into
   * their files, respecting the configured metadata write-back policy. Returns
   * `assetId → message` per file that could not be written.
   */
  private async _writeFaceMetadata(
    assignments: { assetId: string; tagId: string }[],
    onFileProgress?: FileWriteProgress,
  ): Promise<Map<string, string>> {
    const assetIds = [...new Set(assignments.map((row) => row.assetId))];
    if (assetIds.length === 0) return new Map();

    await this._syncPersonKeywords(assignments);

    // Regions and keywords are two passes over the same assets with their own
    // entry counts, so each drives half of the single ramp the caller shows.
    const reportHalf = (half: 0 | 1) =>
      onFileProgress &&
      ((processed: number, total: number) =>
        onFileProgress(
          Math.round(((half + (total > 0 ? processed / total : 1)) / 2) * assetIds.length),
          assetIds.length,
        ));

    const regionsByAsset = await this.getWritableRegionsForAssets(assetIds);
    const regionFailures = await writeRegionsForAssets(
      assetIds.map((assetId) => ({ assetId, regions: regionsByAsset.get(assetId) ?? [] })),
      { onProgress: reportHalf(0) },
    );
    const keywordFailures = await writeKeywordsForAssets(assetIds, reportHalf(1));

    const failures = new Map(regionFailures);
    for (const [assetId, message] of keywordFailures) {
      if (!failures.has(assetId)) failures.set(assetId, message);
    }

    return failures;
  }

  /**
   * {@link _writeFaceMetadata} for the callers that have nowhere to show a
   * partial failure — notably the undo paths, whose toast only knows "worked"
   * and "didn't".
   */
  private async _writeFaceMetadataOrThrow(assignments: { assetId: string; tagId: string }[]) {
    const failures = await this._writeFaceMetadata(assignments);
    if (failures.size > 0) {
      throw new Error(
        `Face names were saved, but ${failures.size} file${failures.size === 1 ? '' : 's'} could not be updated`,
      );
    }
  }

  /**
   * The album is reached through plain joins rather than a correlated JSON
   * subquery: the unverified grid can pull tens of thousands of rows, and a
   * per-row JSON object costs a serialize in SQLite plus a parse in the client
   * for a path we rebuild from three columns anyway.
   */
  private _buildFaceRegionsQuery() {
    let query = kyselyDB
      .selectFrom('tagRegionInfo')
      .leftJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
      .leftJoin('albums', 'albums.id', 'assets.albumId')
      .leftJoin('rootAlbums', 'rootAlbums.id', 'albums.rootAlbumId')
      .select([
        'tagRegionInfo.id as id',
        'tagRegionInfo.assetId as assetId',
        'tagRegionInfo.tagId as tagId',
        'tagRegionInfo.clusterId as clusterId',
        'tagRegionInfo.confirmed as confirmed',
        'tagRegionInfo.faceStatus as faceStatus',
        'tagRegionInfo.x as x',
        'tagRegionInfo.y as y',
        'tagRegionInfo.w as w',
        'tagRegionInfo.h as h',
        'assets.filename as filename',
        'albums.relativePath as relativePath',
        'rootAlbums.path as rootPath',
      ])
      .where(photoAssetSql());
    if (!useHiddenItemsStore.getState().showHiddenItems) {
      query = query.where(visibleAlbumSql());
    }
    return query;
  }

  /** One row per person/cluster with its face totals, counted by SQLite. */
  private async _fetchPersonCounts() {
    let query = kyselyDB
      .selectFrom('tagRegionInfo')
      .leftJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
      .leftJoin('albums', 'albums.id', 'assets.albumId')
      .leftJoin('rootAlbums', 'rootAlbums.id', 'albums.rootAlbumId')
      .select(personGroupKey().as('id'))
      .select(sql<0 | 1>`MAX("tagRegionInfo"."tagId" IS NOT NULL)`.as('isKnown'))
      .select(sql<0 | 1>`MAX("tagRegionInfo"."clusterId" IS NOT NULL)`.as('hasCluster'))
      .select(sql<number>`COUNT(*)`.as('totalResults'))
      .select(sql<number>`SUM("tagRegionInfo"."confirmed" = 0)`.as('unconfirmedResults'))
      .where('tagRegionInfo.faceStatus', 'in', [FaceStatus.Pending, FaceStatus.Confirmed])
      .where(photoAssetSql());
    if (!useHiddenItemsStore.getState().showHiddenItems) query = query.where(visibleAlbumListSql());
    return selectFromDB(query.groupBy(personGroupKey()));
  }

  /**
   * One face per person/cluster, to use as its avatar. Grouped like
   * `TagsService.getTagCovers`: the bare columns take their values from the row
   * holding the MAX: an eligible pinned portrait, otherwise an existing,
   * preferably confirmed, highest-res face crop.
   */
  private async _fetchRepresentativeRegions(
    tagIds?: string[],
    confirmedOnly = false,
  ): Promise<Map<string, PersonRegion>> {
    let query = kyselyDB
      .selectFrom('tagRegionInfo')
      .leftJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
      .leftJoin('albums', 'albums.id', 'assets.albumId')
      .leftJoin('rootAlbums', 'rootAlbums.id', 'albums.rootAlbumId')
      .leftJoin('tags as portraitTag', 'portraitTag.id', 'tagRegionInfo.tagId')
      .select([
        'tagRegionInfo.id as id',
        'tagRegionInfo.assetId as assetId',
        'tagRegionInfo.tagId as tagId',
        'tagRegionInfo.clusterId as clusterId',
        'tagRegionInfo.confirmed as confirmed',
        'tagRegionInfo.faceStatus as faceStatus',
        'tagRegionInfo.x as x',
        'tagRegionInfo.y as y',
        'tagRegionInfo.w as w',
        'tagRegionInfo.h as h',
        'assets.filename as filename',
        'albums.relativePath as relativePath',
        'rootAlbums.path as rootPath',
      ])
      .select(personGroupKey().as('groupKey'))
      // The pinned portrait wins only while valid and available. Otherwise
      // prefer an available asset, confirmation, then the largest pixel crop.
      .select(
        sql<number>`MAX(
            ((CASE WHEN "assets"."filename" IS NULL OR "rootAlbums"."path" IS NULL THEN 0 ELSE 2 END)
              + (CASE WHEN "assets"."filename" IS NOT NULL AND "rootAlbums"."path" IS NOT NULL
                  AND "portraitTag"."profileRegionId" = "tagRegionInfo"."id"
                  AND "tagRegionInfo"."confirmed" = 1
                  AND "tagRegionInfo"."faceStatus" = 'confirmed'
                THEN 4 ELSE 0 END)
              + "tagRegionInfo"."confirmed") * ${REPRESENTATIVE_RANK_SCALE}
            + COALESCE("assets"."width", 0) * COALESCE("assets"."height", 0) * "tagRegionInfo"."w" * "tagRegionInfo"."h"
          )`.as('rank'),
      )
      .where(photoAssetSql())
      .where('assets.trashedAt', 'is', null)
      .where('tagRegionInfo.faceStatus', 'in', [FaceStatus.Pending, FaceStatus.Confirmed])
      .groupBy(personGroupKey());
    if (tagIds) query = query.where('tagRegionInfo.tagId', 'in', tagIds);
    if (confirmedOnly) query = query.where('tagRegionInfo.confirmed', '=', 1);
    if (!useHiddenItemsStore.getState().showHiddenItems) query = query.where(visibleAlbumListSql());
    const rows = await selectFromDB(query);

    return new Map(
      rows.map((row) => [
        row.groupKey,
        this._toPersonRegion({
          ...row,
          path:
            row.rootPath && row.filename
              ? joinPathSync(row.rootPath, row.relativePath ?? '', row.filename)
              : '',
        }),
      ]),
    );
  }

  private async _rowsWithPathFromQuery(query: ReturnType<_RegionsService['_buildFaceRegionsQuery']>): Promise<
    {
      id: string;
      assetId: string;
      tagId?: string;
      clusterId?: string;
      confirmed: 0 | 1;
      faceStatus: TagRegionInfoDTO['faceStatus'];
      x: number;
      y: number;
      w: number;
      h: number;
      path: string;
    }[]
  > {
    const rows = (await selectFromDB(query)) as {
      id: string;
      assetId: string;
      tagId?: string;
      clusterId?: string;
      confirmed: 0 | 1;
      faceStatus: TagRegionInfoDTO['faceStatus'];
      x: number;
      y: number;
      w: number;
      h: number;
      filename?: string | null;
      relativePath?: string | null;
      rootPath?: string | null;
    }[];

    // Built synchronously: a person with thousands of faces would otherwise
    // pay one `join()` IPC round-trip per row before the grid can render.
    return rows.map(({ filename, relativePath, rootPath, ...row }) => ({
      ...row,
      path: rootPath && filename ? joinPathSync(rootPath, relativePath ?? '', filename) : '',
    }));
  }

  private _toPersonRegion(
    region: {
      id: string;
      assetId: string;
      tagId?: string;
      clusterId?: string | null;
      confirmed: 0 | 1;
      faceStatus: TagRegionInfoDTO['faceStatus'];
      path: string;
    } & AreaBox,
  ): PersonRegion {
    return {
      id: region.id,
      assetId: region.assetId,
      tagId: region.tagId,
      clusterId: region.clusterId ?? null,
      confirmed: region.confirmed === 1,
      faceStatus: region.faceStatus,
      area: { x: region.x, y: region.y, w: region.w, h: region.h },
      path: region.path,
    };
  }
}

export const RegionsService = new _RegionsService();
