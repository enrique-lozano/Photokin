import { executeInDB, selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { AssetWithAlbumFromDB } from '@/db/models/AssetDTO';
import { AssetInClient } from '@/db/models/AssetInClient';
import { LocationSource } from '@/db/models/AssetLocation';
import { SqliteDbStructure } from '@/db/models/SqliteDbStructure';
import { FaceStatus, TagRegionInfoDTO, TagRegionInfoInClient } from '@/db/models/TagRegionInfoDTO';
import { ParsedExiftoolRegion } from '@/media/metadata/exiftool/exiftool-fields';
import type { EditableLocation } from '@/media/metadata/location/locationDraft';
import { hasPlaceText, placeColumns } from '@/media/metadata/location/locationSource';
import { useAppStore } from '@/stores/appState';
import { errorLog } from '@/system/devLogger';
import { tauriFileStat } from '@/system/diskManager';
import { getTrashDir } from '@/system/trashPaths';
import { epochMsToDate } from '@/utils/date.utils';
import { jsonObjectFrom } from 'kysely/helpers/sqlite';
import { Updateable } from 'kysely';
import { TagsService } from '../tags.service';
import { FileTrackingStat } from './assetTypes';

/** Every column the client model needs, with the owning album inlined as JSON. */
export const assetWithAlbumQuery = kyselyDB
  .selectFrom('assets')
  .select((eb) => [
    'assets.id',
    'filename',
    'date',
    'height',
    'width',
    'orientation',
    'filesize',
    'duration',
    'exposure',
    'rating',
    'exposureProgram',
    'whiteBalance',
    'flash',
    'iso',
    'make',
    'model',
    'lens',
    'software',
    'aperture',
    'shutterSpeed',
    'meteringMode',
    'focalLength',
    'title',
    'description',
    'latitude',
    'longitude',
    'altitude',
    'locationSublocation',
    'locationCity',
    'locationState',
    'locationCountry',
    'locationCountryCode',
    'locationSource',
    'creator',
    'copyright',
    'credit',
    'source',
    'colorSpace',
    'bitDepth',
    'lastScanned',
    'dateAdded',
    'trashedAt',
    jsonObjectFrom(
      eb
        .selectFrom('albums')
        .innerJoin('rootAlbums', 'rootAlbums.id', 'albums.rootAlbumId')
        .select([
          'rootAlbums.path as rootPath',
          'albums.id',
          'albums.lastModified',
          'albums.relativePath',
          'albums.rootAlbumId',
        ])
        .whereRef('albums.id', '=', 'assets.albumId'),
    ).as('album'),
  ]);

/** Turns rows into models, resolving the Trash directory `fromDB` needs once. */
export async function toClientAssets(rows: AssetWithAlbumFromDB[]): Promise<AssetInClient[]> {
  await getTrashDir();

  return rows.map((row) => AssetInClient.fromDB(row));
}

/**
 * Applies column changes to a single asset row and bumps its per-asset revision
 * so any live UI (lightbox DB row, info panel) re-reads it. Every single-asset
 * update funnels through here so the signal can never be forgotten; the table
 * observable is still notified for collection views.
 */
export async function updateAssetRow(
  id: string,
  changes: Updateable<SqliteDbStructure['assets']>,
): Promise<void> {
  await executeInDB(kyselyDB.updateTable('assets').set(changes).where('id', '=', id), 'assets');
  useAppStore.getState().markAssetChanged(id);
}

/** A completed write only marks the snapshot that actually reached the file. */
export async function markLocationSavedToFile(id: string, location: EditableLocation): Promise<void> {
  let query = kyselyDB
    .updateTable('assets')
    .set({ locationSource: hasPlaceText(location) ? LocationSource.File : null })
    .where('id', '=', id);
  for (const [key, value] of Object.entries(placeColumns(location))) {
    query = query.where(key as keyof ReturnType<typeof placeColumns>, value === null ? 'is' : '=', value);
  }
  await executeInDB(query, 'assets');
  useAppStore.getState().markAssetChanged(id);
}

/** Reads the tracking-relevant stat (size, mtime, ctime, inode) for a single file. */
export async function statFile(filePath: string): Promise<FileTrackingStat> {
  const stat = await tauriFileStat(filePath);
  return {
    filesize: stat.size,
    fileMtime: epochMsToDate(stat.mtime) ?? new Date(0),
    fileCreatedAt: epochMsToDate(stat.ctime),
    inode: stat.inode ?? '',
  };
}

/**
 * Re-stats a file whose content/mtime we just changed and writes the fresh
 * tracking columns back, so the next sync doesn't mistake our own write for an
 * external change. Updating through {@link updateAssetRow} also signals live UI
 * (e.g. the info panel's modified date) to re-read it. Best-effort: a stat
 * failure only means slightly stale tracking, and the edit is already persisted.
 */
export async function refreshFileTracking(id: string, fullPath: string): Promise<void> {
  try {
    const stat = await statFile(fullPath);
    await updateAssetRow(id, {
      filesize: stat.filesize,
      fileMtime: stat.fileMtime.toISOString(),
      inode: stat.inode,
      lastScanned: new Date().toISOString(),
    });
  } catch (error) {
    errorLog('assets', 'tracking-refresh-failed', error, { asset: id });
  }
}

/**
 * Face-region rows for one asset's embedded regions. Regions naming a person we
 * could not resolve to a tag are dropped: the row needs a tag to be reachable.
 */
export function regionRows(
  assetId: string,
  regions: ParsedExiftoolRegion[],
  idByName: Map<string, string>,
): TagRegionInfoDTO[] {
  return regions.flatMap((region) => {
    const tagId = idByName.get(region.tagName);
    if (!tagId) return [];

    return [
      TagRegionInfoInClient.fromDB({
        assetId,
        ...region.area,
        tagId,
        confirmed: 1,
        faceStatus: FaceStatus.Confirmed,
      }).toDB(),
    ];
  });
}

/** Location columns of many assets, keyed by asset id. */
export async function locationColumnsByAsset(assetIds: string[]) {
  const rows = await selectFromDB(
    kyselyDB
      .selectFrom('assets')
      .select([
        'id',
        'locationSublocation',
        'locationCity',
        'locationState',
        'locationCountry',
        'locationCountryCode',
        'locationSource',
      ])
      .where('id', 'in', assetIds),
  );

  return new Map(rows.map((row) => [row.id, row]));
}

/** Current `fileTags` associations for the given assets, as `assetId → tagIds`. */
export async function tagIdsByAsset(assetIds: string[]): Promise<Map<string, Set<string>>> {
  const byAsset = new Map<string, Set<string>>(assetIds.map((id) => [id, new Set<string>()]));
  if (assetIds.length === 0) return byAsset;

  const rows = await selectFromDB(
    kyselyDB.selectFrom('fileTags').select(['assetId', 'tagId']).where('assetId', 'in', assetIds),
  );
  for (const row of rows) byAsset.get(row.assetId)?.add(row.tagId);
  return byAsset;
}

/**
 * Keyword memberships written to files. Confirmed person regions also count:
 * assigning a face in Photokin intentionally mirrors that person into keywords.
 */
export async function keywordTagIdsByAsset(assetIds: string[]): Promise<Map<string, Set<string>>> {
  const byAsset = await tagIdsByAsset(assetIds);
  if (assetIds.length === 0) return byAsset;

  const regionRows = await selectFromDB(
    kyselyDB
      .selectFrom('tagRegionInfo')
      .select(['assetId', 'tagId'])
      .where('assetId', 'in', assetIds)
      .where('tagId', 'is not', null)
      .where('confirmed', '=', 1),
  );
  for (const row of regionRows) {
    if (row.tagId) byAsset.get(row.assetId)?.add(row.tagId);
  }
  return byAsset;
}

/** Current tag memberships as write-ready `/`-separated paths, tagged assets only. */
export async function tagPathsByAsset(assetIds: string[]): Promise<Map<string, string[]>> {
  const tagIds = await tagIdsByAsset(assetIds);
  const fullPathByTagId = new Map((await TagsService.getAll()).map((tag) => [tag.id, tag.fullPath]));

  const byAsset = new Map<string, string[]>();
  for (const [assetId, ids] of tagIds) {
    const paths = [...ids].map((tagId) => fullPathByTagId.get(tagId)).filter((path) => path != null);
    if (paths.length > 0) byAsset.set(assetId, paths);
  }
  return byAsset;
}
