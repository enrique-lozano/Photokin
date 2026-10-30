import { executeInDB, safelyExecuteBatchInsert } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { MetadataStage } from '@/db/models/AssetDTO';
import { AssetInClient } from '@/db/models/AssetInClient';
import { isSupportedVideoPath } from '@/common/supportedFormats';
import type { ParsedExiftoolTags } from '@/media/metadata/exiftool/exiftool-fields';
import {
  getParsedRegions,
  getParsedTagSet,
  hasEmbeddedCaptureDate,
  mapParsedExiftoolToAssetMetadata,
} from '@/media/metadata/exiftool/read/exiftool-pipeline';
import { readFromExiftool } from '@/media/metadata/exiftool/read/exiftool-read';
import { parseRawExiftoolTags } from '@/media/metadata/exiftool/read/exiftool-reader';
import { useAppStore } from '@/stores/appState';
import { normalizeAllPathSep } from '@/system/diskManager';
import { earliestDate } from '@/utils/date.utils';
import { TagsService } from '../tags.service';
import { getByUUID } from './assetQueries';
import { locationColumnsByAsset, regionRows, statFile } from './assetRows';
import { FileTrackingStat } from './assetTypes';

/** An asset paired with the exiftool output read for it, ready to be persisted. */
interface BatchMetadataEntry {
  asset: Pick<AssetInClient, 'id' | 'fullPath'>;
  parsed: ParsedExiftoolTags;
}

/**
 * What a reload does with the place of files that embed no place text:
 * - `keep`: leave the stored place (automatic rescans).
 * - `defer`: drop it; assets with GPS become `LocationPending` for the geocode stage.
 * - `inline`: drop it and geocode the GPS while reading the files.
 */
export type ReloadPlaceMode = 'keep' | 'defer' | 'inline';

/**
 * Re-read the metadata of a single asset straight from disk and refresh the
 * database with it (asset row, keyword tags and face regions).
 *
 * This only reads the file: the original media and its embedded metadata are
 * never modified. Returns the refreshed asset.
 */
export async function reloadMetadataForAsset(
  asset: Pick<AssetInClient, 'id' | 'fullPath'>,
): Promise<AssetInClient> {
  const exiftoolRes = await readFromExiftool([asset.fullPath], undefined, { includeGeolocation: true });
  const rawMetadata = Array.isArray(exiftoolRes) ? exiftoolRes.at(0) : exiftoolRes;

  if (!rawMetadata) {
    throw new Error(`Could not read metadata for "${asset.fullPath}"`);
  }

  const failures = new Map<string, string>();
  await _applyReloadedMetadataBatch([{ asset, parsed: parseRawExiftoolTags(rawMetadata) }], false, failures);

  const failure = failures.get(asset.id);
  if (failure) throw new Error(failure);

  return getByUUID(asset.id);
}

/**
 * Re-reads metadata from disk for many assets and refreshes the database with it
 * in a single exiftool process. Returns how many were reloaded plus a map of
 * `assetId → error message` for the ones that could not be read/applied.
 * `onProgress` fires per file read.
 *
 * `place` defaults to `keep`. A refresh the user asked for uses `defer` (bulk)
 * and runs the geocode stage afterwards, or `inline` for a handful of files.
 */
export async function reloadMetadataForAssets(
  assets: Pick<AssetInClient, 'id' | 'fullPath'>[],
  onProgress?: (processed: number, total: number) => void,
  options?: { place?: ReloadPlaceMode },
): Promise<{ reloaded: number; failures: Map<string, string> }> {
  const failures = new Map<string, string>();
  if (assets.length === 0) return { reloaded: 0, failures };

  const place = options?.place ?? 'keep';

  // Reading is the slow part, so progress follows exiftool's own per-file output.
  const exiftoolRes = await readFromExiftool(
    assets.map((asset) => asset.fullPath),
    onProgress,
    { includeGeolocation: place === 'inline' },
  );
  const rawList = Array.isArray(exiftoolRes) ? exiftoolRes : [exiftoolRes];

  // Pair each parsed result to its asset by source path — exiftool may drop
  // unreadable files, so we can't rely on positional alignment.
  const parsedByPath = new Map<string, ParsedExiftoolTags>();
  for (const raw of rawList) {
    const parsed = parseRawExiftoolTags(raw);
    if (parsed.SourceFile) parsedByPath.set(normalizeAllPathSep(parsed.SourceFile), parsed);
  }

  const entries: BatchMetadataEntry[] = [];
  for (const asset of assets) {
    const parsed = parsedByPath.get(normalizeAllPathSep(asset.fullPath));
    if (parsed) {
      entries.push({ asset, parsed });
    } else {
      failures.set(asset.id, 'could not read metadata');
    }
  }

  const reloaded = await _applyReloadedMetadataBatch(entries, place === 'keep', failures);
  onProgress?.(assets.length, assets.length);

  return { reloaded, failures };
}

/**
 * Writes already-parsed exiftool metadata into existing asset rows and rebuilds
 * their keyword tags and face regions from scratch. The files themselves are
 * never modified — this only refreshes the database.
 *
 * Failures are reported per asset in `failures`; the return value counts the
 * applied ones.
 */
async function _applyReloadedMetadataBatch(
  entries: BatchMetadataEntry[],
  preserveDerivedLocation: boolean,
  failures: Map<string, string>,
): Promise<number> {
  const statted: (BatchMetadataEntry & { stat: FileTrackingStat })[] = [];
  await Promise.all(
    entries.map(async (entry) => {
      try {
        statted.push({ ...entry, stat: await statFile(entry.asset.fullPath) });
      } catch (error) {
        failures.set(entry.asset.id, `could not stat file (${String(error)})`);
      }
    }),
  );

  if (statted.length === 0) return 0;

  const assetIds = statted.map(({ asset }) => asset.id);
  // One tag-hierarchy read for the batch instead of one per file. `idByName` also
  // resolves the people the embedded face regions reference.
  const keywordsByAsset = new Map(
    statted.map(({ asset, parsed }) => [asset.id, [...getParsedTagSet(parsed)]]),
  );
  const { idByFullPath, idByName } = await TagsService.ensureTagFullPaths(
    [...keywordsByAsset.values()].flat(),
  );

  await _rewriteFileTags(assetIds, keywordsByAsset, idByFullPath);
  await _rewriteEmbeddedRegions(statted, idByName);

  const preservedLocations = preserveDerivedLocation ? await locationColumnsByAsset(assetIds) : null;
  const lastScanned = new Date().toISOString();
  const appliedIds: string[] = [];

  for (const { asset, parsed, stat } of statted) {
    try {
      const assetMetadata = mapParsedExiftoolToAssetMetadata(parsed);

      // Files with no embedded date fall back to their earliest filesystem date.
      if (!hasEmbeddedCaptureDate(parsed)) {
        assetMetadata.date = earliestDate([stat.fileCreatedAt, stat.fileMtime]) ?? assetMetadata.date;
      }

      const location = assetMetadata.location;
      const hasParsedPlace = location?.sublocation || location?.city || location?.state || location?.country;
      const metadataRow = assetMetadata.toDB();
      const preserved = hasParsedPlace ? undefined : preservedLocations?.get(asset.id);
      if (preserved) {
        metadataRow.locationSublocation = preserved.locationSublocation;
        metadataRow.locationCity = preserved.locationCity;
        metadataRow.locationState = preserved.locationState;
        metadataRow.locationCountry = preserved.locationCountry;
        metadataRow.locationCountryCode = metadataRow.locationCountryCode ?? preserved.locationCountryCode;
        metadataRow.locationSource = preserved.locationSource;
      }

      const hasPlace =
        hasParsedPlace ||
        Boolean(
          preserved?.locationSublocation ||
          preserved?.locationCity ||
          preserved?.locationState ||
          preserved?.locationCountry,
        );
      const needsGeocode = location?.latitude != null && location.longitude != null && !hasPlace;

      // The stage moves with the metadata, so an interrupted batch keeps its
      // unreached assets at their old stage and is simply repeated.
      await executeInDB(
        kyselyDB
          .updateTable('assets')
          .set({
            ...metadataRow,
            filesize: stat.filesize,
            fileMtime: stat.fileMtime.toISOString(),
            inode: stat.inode,
            lastScanned,
            metadataStage: needsGeocode ? MetadataStage.LocationPending : MetadataStage.Complete,
          })
          .where('id', '=', asset.id),
        'assets',
      );
      appliedIds.push(asset.id);
    } catch (error) {
      failures.set(asset.id, String(error));
    }
  }

  useAppStore.getState().markAssetChanged(appliedIds);

  return appliedIds.length;
}

/** Replaces the keyword associations of a whole batch with two statements. */
async function _rewriteFileTags(
  assetIds: string[],
  keywordsByAsset: Map<string, string[]>,
  idByFullPath: Map<string, string>,
): Promise<void> {
  await executeInDB(kyselyDB.deleteFrom('fileTags').where('assetId', 'in', assetIds), 'fileTags');

  const rows: { assetId: string; tagId: string }[] = [];
  for (const [assetId, keywords] of keywordsByAsset) {
    for (const keyword of keywords) {
      const tagId = idByFullPath.get(keyword);
      if (tagId) rows.push({ assetId, tagId });
    }
  }

  await safelyExecuteBatchInsert('fileTags', rows);
}

/** Same as {@link _rewriteFileTags} for the face regions embedded in the files. */
async function _rewriteEmbeddedRegions(
  entries: BatchMetadataEntry[],
  idByName: Map<string, string>,
): Promise<void> {
  await executeInDB(
    kyselyDB.deleteFrom('tagRegionInfo').where(
      'assetId',
      'in',
      entries.map(({ asset }) => asset.id),
    ),
    'tagRegionInfo',
  );

  await safelyExecuteBatchInsert(
    'tagRegionInfo',
    entries.flatMap(({ asset, parsed }) =>
      isSupportedVideoPath(asset.fullPath) ? [] : regionRows(asset.id, getParsedRegions(parsed), idByName),
    ),
  );
}
