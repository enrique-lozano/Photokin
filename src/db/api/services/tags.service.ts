import { writeRegionsForAssets } from '@/db/api/services/assets/regionFileWrites';
import { describeFileWriteFailures, writeKeywordsForAssets } from '@/db/api/services/assets/tagFileWrites';
import { assertAssetsMetadataScanned } from '@/db/api/services/assets/assetMetadataGuard';
import { useAppStore } from '@/stores/appState';
import type { BulkItemFailure } from '@/system/bulkOutcome';
import { joinPathSync } from '@/system/diskManager';
import { sql } from 'kysely';
import {
  executeInDB,
  safelyExecuteBatchInsert,
  selectFirstFromDB,
  selectFromDB,
} from '../../connection/db.service.ts';
import { kyselyDB } from '../../connection/kysely.ts';
import { generateID } from '../../models/dbEntityWithID.ts';
import { TagDTO, TagInClient } from '../../models/TagDTO.ts';
import { AreaBox, FaceStatus } from '../../models/TagRegionInfoDTO.ts';
import { photoAssetSql, RegionsService } from './regions.service';

/**
 * A representative image used as a tag's cover in the overview grid. When the
 * tag is a person/face the `region` describes the face box to crop to;
 * otherwise the full asset thumbnail is shown.
 */
export interface TagCover {
  assetId: string;
  /** Absolute path of the source asset (used to resolve/generate a thumbnail). */
  path: string;
  /** Face box (normalized 0..1, centered) when the tag represents a person. */
  region?: AreaBox;
}

export interface TagCatalogWriteResult {
  warnings: string[];
  fileCount: number;
  fileFailures: BulkItemFailure[];
}

const EMPTY_CATALOG_WRITE_RESULT: TagCatalogWriteResult = {
  warnings: [],
  fileCount: 0,
  fileFailures: [],
};

type TagHierarchyNode = Pick<TagDTO, 'id' | 'parentId' | 'name'>;

/** Returns a user-facing reason when a tag cannot be moved, otherwise `null`. */
export function getTagMoveError(
  tags: TagHierarchyNode[],
  sourceId: string,
  targetParentId: string | null,
): string | null {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const source = byId.get(sourceId);
  if (!source) return 'The tag no longer exists.';
  if (source.parentId === targetParentId) return 'The tag is already in that location.';
  if (targetParentId === sourceId) return 'A tag cannot be moved into itself.';

  if (targetParentId) {
    let ancestor = byId.get(targetParentId);
    if (!ancestor) return 'The destination tag no longer exists.';

    while (ancestor) {
      if (ancestor.id === sourceId) return 'A tag cannot be moved into one of its nested tags.';
      ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
    }
  }

  const hasNameCollision = tags.some(
    (tag) => tag.id !== sourceId && tag.parentId === targetParentId && tag.name === source.name,
  );
  return hasNameCollision ? `A tag named "${source.name}" already exists in that location.` : null;
}

class _TagsService {
  constructor() {}

  async getAll(): Promise<TagInClient[]> {
    const query = this._getTagsRecursiveQuery();

    const rows = await selectFromDB(query);
    return rows.map((row) => TagInClient.fromDB(row));
  }

  async getImageTags(imgID: string): Promise<TagInClient[]> {
    const query = this._getTagsRecursiveQuery()
      .leftJoin('fileTags', 'fileTags.tagId', 'tagHierarchy.id')
      .where('fileTags.assetId', '=', imgID);

    const rows = await selectFromDB(query);
    return rows.map((row) => TagInClient.fromDB(row));
  }

  async getByUUID(id: string): Promise<TagInClient> {
    const row = await selectFirstFromDB(this._getTagsRecursiveQuery().where('id', '=', id));
    if (!row) {
      throw new Error(`No tag found with id "${id}"`);
    }

    return TagInClient.fromDB(row);
  }

  /**
   * Tags whose full path *or* leaf name matches any of `values`, ignoring case.
   * Resolves the names typed in the search bar (`person:"Ana Lopez"`) into the
   * tag entities that the search filters match on.
   */
  async findByNamesOrPaths(values: string[]): Promise<TagInClient[]> {
    const wanted = [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
    if (wanted.length === 0) {
      return [];
    }

    const rows = await selectFromDB(
      this._getTagsRecursiveQuery().where((eb) =>
        eb.or([
          eb(sql<string>`lower("fullPath")`, 'in', wanted),
          eb(sql<string>`lower("name")`, 'in', wanted),
        ]),
      ),
    );

    return rows.map((row) => TagInClient.fromDB(row));
  }

  async delete(
    id: string,
    onFileProgress?: (processed: number, total: number) => void,
  ): Promise<TagCatalogWriteResult> {
    const subtreeIds = await this._subtreeTagIds([id]);
    const taggedAssetIds = await this._assetIdsForTagColumn('fileTags', subtreeIds);
    const regionAssetIds = await this._assetIdsForTagColumn('tagRegionInfo', subtreeIds);
    await this._assertWriteBackTargets([...taggedAssetIds, ...regionAssetIds]);

    await executeInDB(kyselyDB.deleteFrom('tags').where('id', '=', id), [
      'tags',
      'fileTags',
      'tagRegionInfo',
    ]);

    return this._writeBackCatalogChange(taggedAssetIds, regionAssetIds, onFileProgress, {
      clearEmptyRegions: true,
    });
  }

  insertInDB(tag: TagDTO) {
    return executeInDB(kyselyDB.insertInto('tags').values(tag), 'tags');
  }

  async setProfileRegion(id: string, regionId: string | null): Promise<void> {
    await this.getByUUID(id);
    const query = kyselyDB.updateTable('tags').set({ profileRegionId: regionId }).where('id', '=', id);
    const result = await executeInDB(
      regionId === null
        ? query
        : query.where((eb) =>
            eb.exists(
              eb
                .selectFrom('tagRegionInfo')
                .innerJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
                .innerJoin('albums', 'albums.id', 'assets.albumId')
                .innerJoin('rootAlbums', 'rootAlbums.id', 'albums.rootAlbumId')
                .select('tagRegionInfo.id')
                .where('tagRegionInfo.id', '=', regionId)
                .where('tagRegionInfo.tagId', '=', id)
                .where('tagRegionInfo.confirmed', '=', 1)
                .where('tagRegionInfo.faceStatus', '=', FaceStatus.Confirmed)
                .where(photoAssetSql())
                .where('assets.trashedAt', 'is', null),
            ),
          ),
      'tags',
    );
    if (result.rowsAffected === 0) {
      throw new Error('Choose a confirmed face that still belongs to this person.');
    }
  }

  /**
   * Create a tag from a (possibly hierarchical) full path such as
   * `"Travel/Spain/Madrid"`. Missing ancestors are created as needed and the
   * optional `color` is applied when the leaf is a root tag (nested tags inherit
   * their root's color). If the root already exists its color is updated.
   *
   * @returns The leaf tag.
   */
  async createTag(fullPath: string, color: string | null = null): Promise<TagInClient> {
    const segments = fullPath
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    if (segments.length === 0) {
      throw new Error('A tag name can not be empty');
    }

    const leafPath = segments.join('/');
    const { idByFullPath } = await this.ensureTagFullPaths([leafPath]);
    const leafId = idByFullPath.get(leafPath)!;

    // `ensureTagFullPaths` creates tags uncolored, so the leaf's color is
    // applied here — which also covers recoloring a leaf that already existed.
    // Nested tags inherit their root's color, so only a root takes one.
    const leaf = await this.getByUUID(leafId);
    if (leaf.parentId !== null || color === leaf.color) {
      return leaf;
    }

    await this.update(leafId, { color });
    return this.getByUUID(leafId);
  }

  /** Update the editable fields of a tag (its name, color and person metadata). */
  async update(
    id: string,
    changes: {
      name?: string;
      color?: string | null;
      sex?: TagDTO['sex'];
      dateBirth?: string | null;
      dateDead?: string | null;
      description?: string | null;
    },
    onFileProgress?: (processed: number, total: number) => void,
  ): Promise<TagCatalogWriteResult> {
    const values: Partial<TagDTO> = {};

    if (changes.name !== undefined) {
      const trimmed = changes.name.trim();
      if (trimmed.length === 0) {
        throw new Error('A tag name can not be empty');
      }
      values.name = trimmed;
    }

    if (changes.color !== undefined) {
      values.color = changes.color;
    }

    if (changes.sex !== undefined) {
      values.sex = changes.sex;
    }

    if (changes.dateBirth !== undefined) {
      values.dateBirth = changes.dateBirth?.trim() || null;
    }

    if (changes.dateDead !== undefined) {
      values.dateDead = changes.dateDead?.trim() || null;
    }

    if (changes.description !== undefined) {
      values.description = changes.description?.trim() || null;
    }

    if (Object.keys(values).length === 0) return EMPTY_CATALOG_WRITE_RESULT;

    const previous = values.name !== undefined ? await this.getByUUID(id) : null;
    const nameChanged = previous != null && previous.name !== values.name;
    if (nameChanged) {
      const subtreeIds = await this._subtreeTagIds([id]);
      await this._assertWriteBackTargets([
        ...(await this._assetIdsForTagColumn('fileTags', subtreeIds)),
        ...(await this._assetIdsForTagColumn('tagRegionInfo', subtreeIds)),
      ]);
    }

    await executeInDB(kyselyDB.updateTable('tags').set(values).where('id', '=', id), 'tags');

    if (!nameChanged) return EMPTY_CATALOG_WRITE_RESULT;

    const subtreeIds = await this._subtreeTagIds([id]);
    return this._writeBackCatalogChange(
      await this._assetIdsForTagColumn('fileTags', subtreeIds),
      await this._assetIdsForTagColumn('tagRegionInfo', subtreeIds),
      onFileProgress,
    );
  }

  /** Move a tag and its subtree below another tag, or to the top level. */
  async move(
    id: string,
    parentId: string | null,
    onFileProgress?: (processed: number, total: number) => void,
  ): Promise<TagCatalogWriteResult> {
    const tags = await this.getAll();
    const moveError = getTagMoveError(tags, id, parentId);
    if (moveError) throw new Error(moveError);

    const subtreeIds = await this._subtreeTagIds([id]);
    const taggedAssetIds = await this._assetIdsForTagColumn('fileTags', subtreeIds);
    const regionAssetIds = await this._assetIdsForTagColumn('tagRegionInfo', subtreeIds);
    await this._assertWriteBackTargets([...taggedAssetIds, ...regionAssetIds]);

    await executeInDB(kyselyDB.updateTable('tags').set({ parentId }).where('id', '=', id), 'tags');

    return this._writeBackCatalogChange(taggedAssetIds, regionAssetIds, onFileProgress);
  }

  /** Toggle the "favorite" flag used to surface a tag/person in the overview pages. */
  async setFavorite(id: string, isFavorite: boolean): Promise<void> {
    await executeInDB(
      kyselyDB
        .updateTable('tags')
        .set({ isFavorite: isFavorite ? 1 : 0 })
        .where('id', '=', id),
      'tags',
    );
  }

  async setHidden(id: string, isHidden: boolean): Promise<void> {
    await executeInDB(
      kyselyDB
        .updateTable('tags')
        .set({ isHidden: isHidden ? 1 : 0 })
        .where('id', '=', id),
      'tags',
    );
  }

  /**
   * Merge one or more source tags into a target tag. Every photo/video tagged
   * with a source tag is re-tagged with the target (duplicates are ignored),
   * any nested tags and face regions are re-pointed to the target, and the
   * source tags are then deleted. In full metadata mode the new keyword (and
   * face-name) set is then mirrored into the original files.
   */
  async mergeTags(
    sourceIds: string[],
    targetId: string,
    onFileProgress?: (processed: number, total: number) => void,
  ): Promise<TagCatalogWriteResult> {
    const sources = Array.from(new Set(sourceIds)).filter((id) => id !== targetId);
    if (sources.length === 0) return EMPTY_CATALOG_WRITE_RESULT;

    const sourceSubtreeIds = await this._subtreeTagIds(sources);
    const taggedAssetIds = await this._assetIdsForTagColumn('fileTags', sourceSubtreeIds);
    const regionAssetIds = await this._assetIdsForTagColumn('tagRegionInfo', sourceSubtreeIds);
    await this._assertWriteBackTargets([...taggedAssetIds, ...regionAssetIds]);

    // Re-tag every asset of the source tags with the target, ignoring rows that
    // already exist (the `(tagId, assetId)` primary key prevents duplicates).
    await executeInDB(
      kyselyDB
        .insertInto('fileTags')
        .columns(['tagId', 'assetId'])
        .expression((eb) =>
          eb
            .selectFrom('fileTags')
            .select([eb.val(targetId).as('tagId'), 'assetId'])
            .where('tagId', 'in', sources),
        )
        .onConflict((oc) => oc.doNothing()),
      'fileTags',
    );

    // Re-parent any nested tags so the hierarchy below the source tags survives.
    await executeInDB(
      kyselyDB.updateTable('tags').set({ parentId: targetId }).where('parentId', 'in', sources),
      'tags',
    );

    // Move face regions (only relevant when merging people) onto the target.
    await executeInDB(
      kyselyDB.updateTable('tagRegionInfo').set({ tagId: targetId }).where('tagId', 'in', sources),
      'tagRegionInfo',
    );

    // Removing the source tags cascades any leftover associations away.
    await executeInDB(kyselyDB.deleteFrom('tags').where('id', 'in', sources), [
      'tags',
      'fileTags',
      'tagRegionInfo',
    ]);

    return this._writeBackCatalogChange(taggedAssetIds, regionAssetIds, onFileProgress);
  }

  /**
   * Returns a `tagId -> distinct asset count` map for every tag that is directly
   * applied to at least one asset (no subtree aggregation). Powers the counts in
   * the tags overview grid in a single query.
   */
  async getDirectAssetCounts(): Promise<Record<string, number>> {
    const rows = await selectFromDB(
      kyselyDB
        .selectFrom((eb) =>
          eb
            .selectFrom('fileTags')
            .select(['tagId', 'assetId'])
            .union(
              eb
                .selectFrom('tagRegionInfo')
                .select([sql<string>`"tagRegionInfo"."tagId"`.as('tagId'), 'assetId'])
                .where('tagId', 'is not', null)
                .where('confirmed', '=', 1),
            )
            .as('tagAssets'),
        )
        .select(['tagId'])
        .select(sql<number>`COUNT(*)`.as('count'))
        .groupBy('tagId'),
    );

    return Object.fromEntries(rows.map((row) => [row.tagId, row.count]));
  }

  /**
   * Returns a `tagId -> number of the given assets that carry it` map, scoped to
   * a specific set of assets. Powers the tri-state checkboxes in the bulk tag
   * editor (a tag is fully checked when its count equals the selection size).
   */
  async getTagCountsForAssets(assetIds: string[]): Promise<Map<string, number>> {
    if (assetIds.length === 0) return new Map();

    const rows = await selectFromDB(
      kyselyDB
        .selectFrom('fileTags')
        .select(['tagId'])
        .select(sql<number>`COUNT(DISTINCT assetId)`.as('count'))
        .where('assetId', 'in', assetIds)
        .groupBy('tagId'),
    );

    return new Map(rows.map((row) => [row.tagId, row.count]));
  }

  /**
   * Returns a `tagId -> representative cover image` map used by the tags
   * overview grid. A tag that represents a person/face resolves to its face
   * region (so it shows the same crop as the People pages); any other tag
   * resolves to one of its tagged assets. Face covers are resolved first so
   * the keyword query skips tags whose cover would be overwritten anyway.
   */
  async getTagCovers(): Promise<Record<string, TagCover>> {
    const regionRows = [...(await RegionsService.getRepresentativeRegions()).values()].filter(
      (region) => region.tagId && region.path,
    );

    const faceTagIds = regionRows.map((row) => row.tagId).filter((id): id is string => id != null);
    const fileTagRows = await selectFromDB(
      kyselyDB
        .selectFrom('fileTags')
        .innerJoin('assets', 'assets.id', 'fileTags.assetId')
        .innerJoin('albums', 'albums.id', 'assets.albumId')
        .innerJoin('rootAlbums', 'rootAlbums.id', 'albums.rootAlbumId')
        .$if(faceTagIds.length > 0, (query) => query.where('fileTags.tagId', 'not in', faceTagIds))
        .select([
          'fileTags.tagId as tagId',
          'fileTags.assetId as assetId',
          'assets.filename as filename',
          'albums.relativePath as relativePath',
          'rootAlbums.path as rootPath',
        ])
        // SQLite's bare columns follow the row holding this MAX.
        .select(sql<string>`MAX("assets"."date")`.as('latest'))
        .groupBy('fileTags.tagId'),
    );

    const covers: Record<string, TagCover> = {};

    for (const row of fileTagRows) {
      if (!row.tagId) continue;
      covers[row.tagId] = {
        assetId: row.assetId,
        path: joinPathSync(row.rootPath, row.relativePath, row.filename),
      };
    }

    // Face regions win over keyword assets so people-tags show their face crop.
    for (const row of regionRows) {
      if (!row.tagId) continue;
      covers[row.tagId] = {
        assetId: row.assetId,
        path: row.path,
        region: row.area,
      };
    }

    return covers;
  }

  /**
   * Count how many distinct assets are tagged with the given tag or any of its
   * descendants. Used to warn the user before deleting tags.
   */
  async getAssetCount(tagId: string): Promise<number> {
    const row = await selectFirstFromDB(
      kyselyDB
        .withRecursive('subtree', (eb) =>
          eb
            .selectFrom('tags')
            .select('id')
            .where('id', '=', tagId)
            .unionAll(
              eb.selectFrom('tags as t').innerJoin('subtree as s', 't.parentId', 's.id').select('t.id'),
            ),
        )
        .selectFrom((eb) =>
          eb
            .selectFrom('fileTags')
            .innerJoin('subtree', 'subtree.id', 'fileTags.tagId')
            .select('fileTags.assetId as assetId')
            .union(
              eb
                .selectFrom('tagRegionInfo')
                .innerJoin('subtree', 'subtree.id', 'tagRegionInfo.tagId')
                .select('tagRegionInfo.assetId as assetId')
                .where('tagRegionInfo.confirmed', '=', 1),
            )
            .as('tagAssets'),
        )
        .select(sql<number>`COUNT(DISTINCT assetId)`.as('count')),
    );

    return row?.count ?? 0;
  }

  /** Count face regions that will cascade away with a tag and its descendants. */
  async getFaceRegionCount(tagId: string): Promise<number> {
    const row = await selectFirstFromDB(
      kyselyDB
        .withRecursive('subtree', (eb) =>
          eb
            .selectFrom('tags')
            .select('id')
            .where('id', '=', tagId)
            .unionAll(
              eb.selectFrom('tags as t').innerJoin('subtree as s', 't.parentId', 's.id').select('t.id'),
            ),
        )
        .selectFrom('tagRegionInfo')
        .innerJoin('subtree', 'subtree.id', 'tagRegionInfo.tagId')
        .select(sql<number>`COUNT(*)`.as('count')),
    );

    return row?.count ?? 0;
  }

  /**
   * Returns the ids of every tag whose whole subtree has no assets assigned
   * (i.e. neither the tag nor any of its descendants appear in `fileTags`).
   */
  async getUnusedTagIds(): Promise<string[]> {
    const tags = await this.getAll();

    const [keywordRows, regionRows] = await Promise.all([
      selectFromDB(kyselyDB.selectFrom('fileTags').select('tagId').distinct()),
      selectFromDB(
        kyselyDB.selectFrom('tagRegionInfo').select('tagId').distinct().where('tagId', 'is not', null),
      ),
    ]);
    const usedTagIds = new Set([
      ...keywordRows.map((row) => row.tagId),
      ...regionRows.flatMap((row) => (row.tagId ? [row.tagId] : [])),
    ]);

    const childrenByParent = new Map<string, string[]>();
    for (const tag of tags) {
      if (!tag.parentId) continue;
      const siblings = childrenByParent.get(tag.parentId) ?? [];
      siblings.push(tag.id);
      childrenByParent.set(tag.parentId, siblings);
    }

    const subtreeHasAssetsCache = new Map<string, boolean>();

    const subtreeHasAssets = (tagId: string): boolean => {
      const cached = subtreeHasAssetsCache.get(tagId);
      if (cached !== undefined) return cached;

      let hasAssets = usedTagIds.has(tagId);

      if (!hasAssets) {
        const children = childrenByParent.get(tagId) ?? [];
        hasAssets = children.some((childId) => subtreeHasAssets(childId));
      }

      subtreeHasAssetsCache.set(tagId, hasAssets);
      return hasAssets;
    };

    return tags.filter((tag) => !subtreeHasAssets(tag.id)).map((tag) => tag.id);
  }

  /**
   * Delete every tag that is not assigned (directly or through descendants) to
   * any asset.
   *
   * @returns The number of tags that were removed.
   */
  async deleteUnusedTags(): Promise<number> {
    const unusedIds = await this.getUnusedTagIds();

    if (unusedIds.length === 0) return 0;

    // Deleting a parent cascades to its children, but `unusedIds` can include
    // both. Deleting an already-removed row is a no-op, so it is safe to delete
    // them all in a single statement.
    await executeInDB(kyselyDB.deleteFrom('tags').where('id', 'in', unusedIds), [
      'tags',
      'fileTags',
      'tagRegionInfo',
    ]);

    return unusedIds.length;
  }

  /**
   * Parse an array of tags (ex: `["tag123/tag23/tag72", "tag35", "tag123/tag89"]`)
   * and insert the tags that are not present in the DB (parents and childrens).
   *
   * Thin wrapper around {@link ensureTagFullPaths}: it resolves/creates every
   * tag in bulk and then maps each requested path back to its leaf tag.
   *
   * @returns The DB items of the (leaf) tags specified in the params
   */
  async parseAndInsertNeccesaryTags(tags: Iterable<string>): Promise<TagDTO[]> {
    const tagStrings = [...tags];
    const { idByFullPath } = await this.ensureTagFullPaths(tagStrings);

    const toReturn: TagDTO[] = [];
    for (const fullPath of tagStrings) {
      const id = idByFullPath.get(fullPath);
      if (!id) continue;

      const segments = fullPath.split('/');
      const parentPath = segments.slice(0, -1).join('/');

      toReturn.push({
        id,
        name: segments[segments.length - 1],
        parentId: parentPath ? (idByFullPath.get(parentPath) ?? null) : null,
        color: null,
      });
    }

    return toReturn;
  }

  /**
   * Resolves (and creates when missing) every given tag — and all of its
   * ancestors — while reading the existing tag hierarchy only once and writing
   * the missing tags in a single batched insert, instead of a recursive-CTE
   * lookup plus an insert per path segment per tag. Hierarchical paths use `/`
   * as the separator, e.g. `"Travel/Spain/Madrid"`.
   *
   * @returns Lookup maps from a tag's full path → id and from a tag's bare name
   *   → id (the latter is used to attach face regions, which reference a person
   *   by name).
   */
  async ensureTagFullPaths(
    tagStrings: Iterable<string>,
  ): Promise<{ idByFullPath: Map<string, string>; idByName: Map<string, string> }> {
    const existing = await this.getAll();

    const idByFullPath = new Map<string, string>();
    const idByName = new Map<string, string>();
    for (const tag of existing) {
      idByFullPath.set(tag.fullPath, tag.id);
      if (!idByName.has(tag.name)) {
        idByName.set(tag.name, tag.id);
      }
    }

    // Missing tags to create, kept in creation order so a parent is always
    // inserted before any of its children (safe for the `parentId` foreign key,
    // even if the batched insert is split into several statements).
    const newTags: TagDTO[] = [];

    const ensurePath = (fullPath: string) => {
      const segments = fullPath.split('/');
      let parentId: string | null = null;
      let currentPath = '';

      for (let index = 0; index < segments.length; index += 1) {
        const name = segments[index];
        currentPath = index === 0 ? name : `${currentPath}/${name}`;

        let id = idByFullPath.get(currentPath);
        if (!id) {
          id = generateID();
          idByFullPath.set(currentPath, id);
          if (!idByName.has(name)) {
            idByName.set(name, id);
          }
          newTags.push({ id, name, parentId, color: null });
        }

        parentId = id;
      }
    };

    for (const tagString of tagStrings) {
      if (!tagString) continue;
      ensurePath(tagString);
    }

    await safelyExecuteBatchInsert('tags', newTags);

    return { idByFullPath, idByName };
  }

  private _getTagsRecursiveQuery() {
    return kyselyDB
      .withRecursive('tagHierarchy', (eb) => {
        return eb
          .selectFrom('tags')
          .select([
            'id',
            'parentId',
            'name',
            'color',
            'sex',
            'dateBirth',
            'dateDead',
            'description',
            'isFavorite',
            'isHidden',
            'profileRegionId',
          ])
          .select('name as fullPath')
          .select(sql<number>`0`.as('depth'))
          .select('id as rootId')
          .where('parentId', 'is', null)
          .unionAll(
            eb
              .selectFrom('tags as t')
              .innerJoin('tagHierarchy as th', 't.parentId', 'th.id')
              .select([
                't.id',
                't.parentId',
                't.name',
                'th.color',
                't.sex',
                't.dateBirth',
                't.dateDead',
                't.description',
                't.isFavorite',
                't.isHidden',
                't.profileRegionId',
              ])
              .select(sql<string>`th.fullPath || '/' || t.name`.as('fullPath'))
              .select(sql<number>`th.depth + 1`.as('depth'))
              .select('th.rootId'),
          );
      })
      .selectFrom('tagHierarchy')
      .selectAll();
  }

  /** The given tags plus every descendant, in one recursive query. */
  private async _subtreeTagIds(rootIds: string[]): Promise<string[]> {
    const unique = [...new Set(rootIds)];
    if (unique.length === 0) return [];

    const rows = await selectFromDB(
      kyselyDB
        .withRecursive('subtree', (eb) =>
          eb
            .selectFrom('tags')
            .select('id')
            .where('id', 'in', unique)
            .unionAll(
              eb.selectFrom('tags as t').innerJoin('subtree as s', 't.parentId', 's.id').select('t.id'),
            ),
        )
        .selectFrom('subtree')
        .select('id'),
    );

    return rows.map((row) => row.id);
  }

  private async _assetIdsForTagColumn(
    table: 'fileTags' | 'tagRegionInfo',
    tagIds: string[],
  ): Promise<string[]> {
    if (tagIds.length === 0) return [];

    const rows = await selectFromDB(
      kyselyDB.selectFrom(table).select('assetId').distinct().where('tagId', 'in', tagIds),
    );
    return rows.map((row) => row.assetId);
  }

  private async _assertWriteBackTargets(assetIds: string[]): Promise<void> {
    const unique = [...new Set(assetIds)];
    if (unique.length === 0) return;
    await assertAssetsMetadataScanned(unique);
  }

  /**
   * After a catalog-level tag change, mirror the new keyword (and face-name) set
   * into each affected file under the same write-back policy as photo tag edits.
   */
  private async _writeBackCatalogChange(
    taggedAssetIds: string[],
    regionAssetIds: string[],
    onFileProgress?: (processed: number, total: number) => void,
    options: { clearEmptyRegions?: boolean } = {},
  ): Promise<TagCatalogWriteResult> {
    const keywordIds = [...new Set(taggedAssetIds)];
    const regionIds = [...new Set(regionAssetIds)];
    const changedIds = [...new Set([...keywordIds, ...regionIds])];
    if (changedIds.length > 0) useAppStore.getState().markAssetChanged(changedIds);

    // Confirmed face regions are also person-keyword memberships. Include their
    // assets even when they had no pre-existing `fileTags` row.
    const fileFailures = await writeKeywordsForAssets(changedIds, onFileProgress);

    if (regionIds.length > 0) {
      const regionsByAsset = await RegionsService.getWritableRegionsForAssets(regionIds);
      const regionFailures = await writeRegionsForAssets(
        regionIds.map((assetId) => ({ assetId, regions: regionsByAsset.get(assetId) ?? [] })),
        { clearIfEmpty: options.clearEmptyRegions === true },
      );
      for (const [id, message] of regionFailures) {
        if (!fileFailures.has(id)) fileFailures.set(id, message);
      }
    }

    const describedFailures = await describeFileWriteFailures(fileFailures);
    return {
      warnings: describedFailures.map((failure) => `${failure.label}: ${failure.reason}`),
      fileCount: changedIds.length,
      fileFailures: describedFailures,
    };
  }
}

export const TagsService = new _TagsService();
