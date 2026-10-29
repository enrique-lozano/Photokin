import { executeInDB, selectFirstFromDB, selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { AssetInClient } from '@/db/models/AssetInClient';
import { hasLocationData } from '@/db/models/AssetLocation';
import { isSupportedVideoPath } from '@/common/supportedFormats';
import { EditableFileMetadata, writeMetadataToFiles } from '@/media/metadata/exiftool/write/exiftool-write';
import {
  isMetadataWriteEnabled,
  shouldWriteRatingToFile,
} from '@/media/metadata/exiftool/write/metadataWritePolicy';
import { writeKeywordsToFiles } from '@/media/metadata/exiftool/write/write-keywords';
import { writeLocationsToFiles } from '@/media/metadata/exiftool/write/write-location';
import { writeRegionsToFiles } from '@/media/metadata/exiftool/write/write-regions';
import { editableLocationFrom } from '@/media/metadata/location/locationDraft';
import { RegionsService } from '../regions.service';
import { getByUUID } from './assetQueries';
import { assertAssetsMetadataScanned } from './assetMetadataGuard';
import { markLocationSavedToFile, refreshFileTracking, tagPathsByAsset } from './assetRows';

/**
 * Force-writes each asset's current database metadata (orientation, title,
 * description, rating, make, model, location, keywords and confirmed face
 * regions) into its original file, regardless of the metadata-mode setting — an
 * explicit user action, not an automatic write-back. The rating is gated by the
 * favorites embedding preference. Writes are batched into as few exiftool
 * processes as possible. Returns how many files were written plus a map of
 * `assetId → error message` for any failures. `onProgress` reports progress of
 * the file-writing phase.
 */
export async function writeCurrentMetadataToFiles(
  ids: string[],
  onProgress?: (processed: number, total: number) => void,
  options: { writeEmptyKeywords?: boolean } = {},
): Promise<{ written: number; failures: Map<string, string> }> {
  const failures = new Map<string, string>();
  if (ids.length === 0) return { written: 0, failures };

  await assertAssetsMetadataScanned(ids);
  const embedRating = shouldWriteRatingToFile();
  const entries: { id: string; fullPath: string; fields: EditableFileMetadata; asset: AssetInClient }[] = [];
  for (const id of ids) {
    try {
      const asset = await getByUUID(id);
      entries.push({
        id,
        fullPath: asset.fullPath,
        fields: _editableFieldsFromAsset(asset, embedRating),
        asset,
      });
    } catch (error) {
      failures.set(id, `could not resolve file (${String(error)})`);
    }
  }

  const fieldFailures = await writeMetadataToFiles(
    entries.map(({ fullPath, fields }) => ({ fullPath, fields })),
    onProgress,
  );

  // Mirror the whole geolocation atomically too (coordinates + structured place
  // text), so this explicit action also bakes reverse-geocoded place names into
  // the files, consistent with the editor's write policy.
  const locationFailures = await writeLocationsToFiles(
    entries
      .filter((entry) => hasLocationData(entry.asset.metadata.location))
      .map((entry) => ({
        fullPath: entry.fullPath,
        location: editableLocationFrom(entry.asset.metadata.location),
      })),
  );
  for (const entry of entries) {
    if (hasLocationData(entry.asset.metadata.location) && !locationFailures.has(entry.fullPath)) {
      await markLocationSavedToFile(entry.id, editableLocationFrom(entry.asset.metadata.location));
    }
  }

  // Keywords, from the current tag memberships. The explicit "Write metadata"
  // action leaves untagged assets alone so it never wipes keywords Photokin did
  // not import. A pending-edit flush *does* write an empty set: the database is
  // the source of truth for those queued files (e.g. the last tag was removed).
  const tagPaths = await tagPathsByAsset(entries.map((entry) => entry.id));
  const keywordFailures = await writeKeywordsToFiles(
    entries
      .filter((entry) => options.writeEmptyKeywords || tagPaths.has(entry.id))
      .map((entry) => ({
        fullPath: entry.fullPath,
        tagPaths: tagPaths.get(entry.id) ?? [],
      })),
  );

  // Bake the confirmed, named face regions into each file's MWG RegionInfo, so
  // this explicit action persists people boxes too (symmetric with how reload
  // re-imports them). Assets without confirmed named faces are left untouched
  // rather than cleared, so regions Photokin never imported (e.g. names with no
  // matching person tag) are preserved.
  const regionsByAsset = await RegionsService.getWritableRegionsForAssets(entries.map((e) => e.id));
  const regionFailures = await writeRegionsToFiles(
    entries
      .filter(
        (entry) => !isSupportedVideoPath(entry.fullPath) && (regionsByAsset.get(entry.id)?.length ?? 0) > 0,
      )
      .map((entry) => ({
        fullPath: entry.fullPath,
        orientation: entry.asset.metadata.orientation,
        displayWidth: entry.asset.metadata.width,
        displayHeight: entry.asset.metadata.height,
        regions: regionsByAsset.get(entry.id)!,
      })),
  );

  let written = 0;
  for (const entry of entries) {
    const failure =
      fieldFailures.get(entry.fullPath) ??
      locationFailures.get(entry.fullPath) ??
      keywordFailures.get(entry.fullPath) ??
      regionFailures.get(entry.fullPath);
    if (failure) {
      failures.set(entry.id, failure);
      continue;
    }
    written += 1;
    await refreshFileTracking(entry.id, entry.fullPath);
  }

  return { written, failures };
}

/**
 * Writes every edit that was deferred while `writeBackTiming` is `on sync` into
 * its original file, then clears the flag for the files that took it (the rest
 * stay queued for the next sync). The database is the source of truth, so the
 * queue is just a list of asset ids: the current row is what gets written, which
 * also makes a re-run after a crash or a partial failure idempotent.
 */
export async function flushPendingFileWrites(
  onProgress?: (processed: number, total: number) => void,
): Promise<{ written: number; failures: Map<string, string> }> {
  // A switch to read-only after the edits were queued wins: they stay queued.
  if (!isMetadataWriteEnabled()) return { written: 0, failures: new Map() };

  const rows = await selectFromDB(
    kyselyDB
      .selectFrom('assets')
      .select('id')
      .where('pendingFileWrite', '=', 1)
      .where('trashedAt', 'is', null),
  );
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return { written: 0, failures: new Map() };

  const { written, failures } = await writeCurrentMetadataToFiles(ids, onProgress, {
    writeEmptyKeywords: true,
  });

  const flushed = ids.filter((id) => !failures.has(id));
  if (flushed.length > 0) {
    await executeInDB(
      kyselyDB.updateTable('assets').set({ pendingFileWrite: 0 }).where('id', 'in', flushed),
      'assets',
    );
  }

  return { written, failures };
}

/** How many live assets have edits queued for the next sync write-back. */
export async function getPendingFileWriteCount(): Promise<number> {
  const row = await selectFirstFromDB(
    kyselyDB
      .selectFrom('assets')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .where('pendingFileWrite', '=', 1)
      .where('trashedAt', 'is', null),
  );
  return Number(row?.count ?? 0);
}

/** The app-managed editable fields of an asset, as an exiftool write payload. */
function _editableFieldsFromAsset(asset: AssetInClient, embedRating: boolean): EditableFileMetadata {
  const { metadata } = asset;
  const fields: EditableFileMetadata = {
    orientation: metadata.orientation,
    title: metadata.title ?? null,
    description: metadata.description ?? null,
    make: metadata.camera.Make ?? null,
    model: metadata.camera.Model ?? null,
    lens: metadata.camera.Lens,
    iso: metadata.camera.ISO,
    aperture: metadata.camera.Aperture,
    shutterSpeed: metadata.camera.ShutterSpeed == null ? null : String(metadata.camera.ShutterSpeed / 1000),
    focalLength: metadata.camera.FocalLength,
    meteringMode: metadata.camera.MeteringMode,
    exposureCompensation: metadata.camera.ExposureCompensation,
    exposureProgram: metadata.camera.ExposureProgram,
    whiteBalance: metadata.camera.WhiteBalance,
    flash: metadata.camera.Flash,
  };
  if (embedRating) fields.rating = metadata.rating ?? null;
  return fields;
}
