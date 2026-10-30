import { executeInDB, safelyExecuteBatchInsert } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { AssetInClient } from '@/db/models/AssetInClient';
import { AssetDTO } from '@/db/models/AssetDTO';
import { SqliteDbStructure } from '@/db/models/SqliteDbStructure';
import { EditableFileMetadata, writeMetadataToFiles } from '@/media/metadata/exiftool/write/exiftool-write';
import {
  isMetadataWriteEnabled,
  shouldWriteBackOnSync,
  shouldWriteRatingToFile,
} from '@/media/metadata/exiftool/write/metadataWritePolicy';
import {
  CaptureDateWriteOptions,
  writeCaptureDatesToFiles,
} from '@/media/metadata/exiftool/write/write-capture-date';
import { writeLocationsToFiles } from '@/media/metadata/exiftool/write/write-location';
import { OrientationRotationDirection, rotateOrientation } from '@/media/metadata/fields/orientation';
import { normalizeCountryCode } from '@/media/metadata/location/countryCode';
import { EditableLocation, normalizePlaceName } from '@/media/metadata/location/locationDraft';
import { editedPlaceSource } from '@/media/metadata/location/locationSource';
import { applyTagMembershipChanges } from '@/media/metadata/tags/tagAssignments';
import { deletePreviewOfFile, needsGeneratedPreview } from '@/media/thumbnails/preview';
import { regenerateThumbnailOfFile } from '@/media/thumbnails/thumbnail';
import { useAppStore } from '@/stores/appState';
import { errorLog } from '@/system/devLogger';
import { Updateable } from 'kysely';
import { RegionsService } from '../regions.service';
import { assertAssetsMetadataScanned } from './assetMetadataGuard';
import { writeRegionsForAssets } from './regionFileWrites';
import { writeKeywordsForAssets } from './tagFileWrites';
import { getByUUID } from './assetQueries';
import {
  locationColumnsByAsset,
  markLocationSavedToFile,
  refreshFileTracking,
  statFile,
  tagIdsByAsset,
  updateAssetRow,
} from './assetRows';

export type EditableAssetFields = Partial<
  Pick<
    AssetDTO,
    | 'lens'
    | 'iso'
    | 'aperture'
    | 'shutterSpeed'
    | 'meteringMode'
    | 'exposureProgram'
    | 'whiteBalance'
    | 'flash'
    | 'focalLength'
  >
> & {
  title?: string | null;
  description?: string | null;
  rating?: number | null;
  make?: string | null;
  model?: string | null;
  exposureCompensation?: string | null;
};

function _normalizedEditableChanges(fields: EditableAssetFields) {
  const changes: Partial<SqliteDbStructure['assets']> = {};
  if ('title' in fields) changes.title = _emptyToNull(fields.title);
  if ('description' in fields) changes.description = _emptyToNull(fields.description);
  if ('rating' in fields) changes.rating = fields.rating || null;
  if ('make' in fields) changes.make = _emptyToNull(fields.make);
  if ('model' in fields) changes.model = _emptyToNull(fields.model);
  for (const key of ['lens', 'exposureProgram', 'whiteBalance', 'flash', 'focalLength'] as const) {
    if (key in fields) changes[key] = _emptyToNull(fields[key]);
  }
  for (const key of ['iso', 'aperture', 'shutterSpeed', 'meteringMode'] as const) {
    if (key in fields) changes[key] = fields[key] ?? null;
  }
  if ('exposureCompensation' in fields) changes.exposure = _emptyToNull(fields.exposureCompensation);
  return changes;
}

/**
 * Persists the user-editable metadata fields of a single asset. Only the keys
 * present in `fields` are written, so callers can update one field (e.g. a rating
 * click) without touching the rest. Empty text collapses to `null` and a `0`
 * rating means "unrated", matching how scans store these columns.
 *
 * The database is always updated. In `full` metadata mode the edit also reaches
 * the original file — right away, or on the next sync when write-back is deferred
 * (see `flushPendingFileWrites`); `readonly` never touches files. Throws when an
 * immediate file write fails, so the caller can say so.
 */
export async function updateAssetEditableFields(id: string, fields: EditableAssetFields): Promise<void> {
  const failure = (await updateAssetsEditableFields([{ id, fields }])).get(id);
  if (failure) throw new Error(failure);
}

/** Applies varying editable fields in one policy-aware, batched file write. */
export async function updateAssetsEditableFields(
  entries: { id: string; fields: EditableAssetFields }[],
  onProgress?: (processed: number, total: number) => void,
): Promise<Map<string, string>> {
  const failures = new Map<string, string>();
  const normalized = entries
    .map((entry) => ({ ...entry, changes: _normalizedEditableChanges(entry.fields) }))
    .filter((entry) => Object.keys(entry.changes).length > 0);
  if (normalized.length === 0) return failures;

  const ids = normalized.map((entry) => entry.id);
  await assertAssetsMetadataScanned(ids);
  for (const entry of normalized) await updateAssetRow(entry.id, entry.changes);

  if (!isMetadataWriteEnabled() || (await _deferFileWrite(ids))) {
    onProgress?.(ids.length, ids.length);
    return failures;
  }

  const writes: { id: string; fullPath: string; fields: EditableFileMetadata }[] = [];
  for (const entry of normalized) {
    try {
      const asset = await getByUUID(entry.id);
      const { shutterSpeed, exposure, ...rest } = entry.changes;
      const fields: EditableFileMetadata = { ...rest };
      if ('shutterSpeed' in entry.changes)
        fields.shutterSpeed = shutterSpeed == null ? null : String(shutterSpeed / 1000);
      if ('exposure' in entry.changes) fields.exposureCompensation = exposure;
      if ('rating' in fields && !shouldWriteRatingToFile()) delete fields.rating;
      if (Object.keys(fields).length > 0) writes.push({ id: entry.id, fullPath: asset.fullPath, fields });
    } catch (error) {
      failures.set(entry.id, String(error));
    }
  }

  const pathFailures = await writeMetadataToFiles(
    writes.map(({ fullPath, fields }) => ({ fullPath, fields })),
    onProgress,
  );
  await _trackWrittenFiles(writes, pathFailures, failures);
  return failures;
}

/**
 * Sets one rating on many assets through the shared batched write-back path.
 * Returns how many took and a per-asset failure map.
 */
export async function rateAssets(
  ids: string[],
  rating: number,
  onProgress?: (processed: number, total: number) => void,
): Promise<{ rated: number; failures: Map<string, string> }> {
  const failures = new Map<string, string>();
  const uniqueIds = [...new Set(ids)];

  const batchFailures = await updateAssetsEditableFields(
    uniqueIds.map((id) => ({ id, fields: { rating } })),
    onProgress,
  );
  for (const [id, message] of batchFailures) failures.set(id, message);

  return { rated: uniqueIds.length - failures.size, failures };
}

/**
 * Rotates assets non-destructively by composing their EXIF orientation with a
 * quarter-turn. Original pixels are untouched; each successful file write is
 * followed by a thumbnail rebuild and the matching DB orientation/dimension flip,
 * so the call only resolves (and the caller reports success) once the gallery can
 * actually show the rotated result. `onProgress` spans both the file-write and
 * thumbnail phases so the bar keeps moving throughout.
 */
export async function rotateAssets(
  ids: string[],
  direction: OrientationRotationDirection,
  onProgress?: (processed: number, total: number) => void,
): Promise<{ rotated: number; failures: Map<string, string> }> {
  const failures = new Map<string, string>();
  await assertAssetsMetadataScanned(ids);
  const entries: {
    asset: AssetInClient;
    orientation: AssetInClient['metadata']['orientation'];
  }[] = [];

  for (const id of new Set(ids)) {
    try {
      const asset = await getByUUID(id);
      entries.push({ asset, orientation: rotateOrientation(asset.metadata.orientation, direction) });
    } catch (error) {
      failures.set(id, `could not resolve file (${String(error)})`);
    }
  }

  // Writing EXIF and rebuilding thumbnails each account for one step per asset,
  // so progress advances through the (slower) cache phase instead of stalling.
  const totalSteps = entries.length * 2;
  const pathFailures = await writeMetadataToFiles(
    entries.map(({ asset, orientation }) => ({ fullPath: asset.fullPath, fields: { orientation } })),
    (written) => onProgress?.(written, totalSteps),
  );

  let rotated = 0;
  for (const [index, { asset, orientation }] of entries.entries()) {
    const failure = pathFailures.get(asset.fullPath);
    if (failure) {
      failures.set(asset.id, failure);
    } else {
      await _applyRotation(asset, orientation);
      rotated += 1;
    }
    onProgress?.(entries.length + index + 1, totalSteps);
  }

  return { rotated, failures };
}

/**
 * Updates the capture date of many assets. The database date is always updated
 * for every asset; files are only touched when `options` asks for it (rewriting
 * embedded date tags, setting the filesystem modification time, or both). File
 * writes are batched into as few exiftool processes as possible, so a DB date
 * update always stands even if a file could not be stamped. Returns the file
 * failures keyed by asset id so callers can report which ones didn't reach disk.
 * `onFileProgress` reports progress of the (slow) file-writing phase.
 */
export async function updateAssetsCaptureDate(
  updates: { id: string; date: Date }[],
  options: CaptureDateWriteOptions,
  onFileProgress?: (processed: number, total: number) => void,
  serviceOptions: { skipDatabaseUpdate?: boolean } = {},
): Promise<{ fileFailures: Map<string, string> }> {
  const fileFailures = new Map<string, string>();
  if (updates.length === 0) return { fileFailures };

  await assertAssetsMetadataScanned(updates.map(({ id }) => id));
  if (!serviceOptions.skipDatabaseUpdate) {
    for (const { id, date } of updates) {
      await updateAssetRow(id, { date: date.toISOString() });
    }
  }

  if (
    !options.writeTaken &&
    !options.writeDigitized &&
    !options.writeModified &&
    !options.setFileModifyTime
  ) {
    return { fileFailures };
  }

  const entries: { id: string; fullPath: string; date: Date }[] = [];
  for (const { id, date } of updates) {
    try {
      const asset = await getByUUID(id);
      entries.push({ id, fullPath: asset.fullPath, date });
    } catch (error) {
      fileFailures.set(id, `could not resolve file (${String(error)})`);
    }
  }

  const pathFailures = await writeCaptureDatesToFiles(
    entries.map(({ fullPath, date }) => ({ fullPath, date })),
    options,
    onFileProgress,
  );

  await _trackWrittenFiles(entries, pathFailures, fileFailures);

  return { fileFailures };
}

/**
 * Updates location columns in SQLite first. In full metadata mode, the whole
 * geolocation (coordinates, altitude and structured place text) is mirrored into
 * the original files atomically — all of it or none, never a partial write;
 * read-only mode leaves files untouched. Disk failures do not roll back the
 * library edit.
 */
export async function updateAssetsLocation(
  updates: { id: string; location: EditableLocation }[],
  onFileProgress?: (processed: number, total: number) => void,
): Promise<{ fileFailures: Map<string, string> }> {
  const fileFailures = new Map<string, string>();
  if (updates.length === 0) return { fileFailures };

  await assertAssetsMetadataScanned(updates.map(({ id }) => id));
  const currentLocations = await locationColumnsByAsset(updates.map(({ id }) => id));
  for (const { id, location } of updates) {
    await updateAssetRow(id, {
      latitude: location.latitude,
      longitude: location.longitude,
      altitude: location.altitude,
      locationSublocation: normalizePlaceName(location.sublocation),
      locationCity: normalizePlaceName(location.city),
      locationState: normalizePlaceName(location.state),
      locationCountry: normalizePlaceName(location.country),
      locationCountryCode: normalizeCountryCode(location.countryCode),
      locationSource: editedPlaceSource(location, currentLocations.get(id)),
    });
  }

  if (!isMetadataWriteEnabled() || (await _deferFileWrite(updates.map(({ id }) => id)))) {
    return { fileFailures };
  }

  const entries: { id: string; fullPath: string; location: EditableLocation }[] = [];
  for (const { id, location } of updates) {
    try {
      const asset = await getByUUID(id);
      entries.push({ id, fullPath: asset.fullPath, location });
    } catch (error) {
      fileFailures.set(id, `could not resolve file (${String(error)})`);
    }
  }

  const pathFailures = await writeLocationsToFiles(
    entries.map(({ fullPath, location }) => ({ fullPath, location })),
    onFileProgress,
  );

  for (const entry of entries) {
    if (!pathFailures.has(entry.fullPath)) {
      await markLocationSavedToFile(entry.id, entry.location);
    }
  }
  await _trackWrittenFiles(entries, pathFailures, fileFailures);

  return { fileFailures };
}

export async function saveAssetLocationToFile(id: string, location: EditableLocation): Promise<void> {
  if (!isMetadataWriteEnabled()) throw new Error('Enable Write mode to save a place to the file');
  const { fileFailures } = await updateAssetsLocation([{ id, location }]);
  if (fileFailures.has(id)) throw new Error(fileFailures.get(id));
  if (shouldWriteBackOnSync()) {
    const asset = await getByUUID(id);
    const failures = await writeLocationsToFiles([{ fullPath: asset.fullPath, location }]);
    if (failures.has(asset.fullPath)) throw new Error(failures.get(asset.fullPath));
    await markLocationSavedToFile(id, location);
    await refreshFileTracking(id, asset.fullPath);
  }
}

/**
 * Bulk-applies a keyword edit to many assets: the given tags are added to every
 * selected asset that lacks them and removed from every one that has them, while
 * tags left untouched keep their per-asset membership (so an "indeterminate" tag
 * is preserved). The `fileTags` associations are updated in SQLite first; in full
 * metadata mode each *changed* file's keyword set is then mirrored across every
 * scheme (see `write-keywords.ts`). Disk failures do not roll back the library
 * edit.
 */
export async function updateAssetsTags(
  params: { assetIds: string[]; addTagIds: string[]; removeTagIds: string[] },
  onFileProgress?: (processed: number, total: number) => void,
): Promise<{ updated: number; fileFailures: Map<string, string> }> {
  const fileFailures = new Map<string, string>();

  const assetIds = [...new Set(params.assetIds)];
  const addTagIds = [...new Set(params.addTagIds)];
  const removeTagIds = [...new Set(params.removeTagIds)].filter((id) => !addTagIds.includes(id));

  if (assetIds.length === 0 || (addTagIds.length === 0 && removeTagIds.length === 0)) {
    return { updated: 0, fileFailures };
  }

  await assertAssetsMetadataScanned(assetIds);
  // Snapshot current memberships so only assets that truly change are written.
  const currentByAsset = await tagIdsByAsset(assetIds);
  const { changedAssetIds } = applyTagMembershipChanges(currentByAsset, addTagIds, removeTagIds);
  if (changedAssetIds.length === 0) return { updated: 0, fileFailures };

  // DB: insert the genuinely missing associations and drop the removed ones.
  const additionRows = assetIds.flatMap((assetId) => {
    const current = currentByAsset.get(assetId) ?? new Set<string>();
    return addTagIds.filter((tagId) => !current.has(tagId)).map((tagId) => ({ assetId, tagId }));
  });
  if (additionRows.length > 0) await safelyExecuteBatchInsert('fileTags', additionRows);

  if (removeTagIds.length > 0) {
    await executeInDB(
      kyselyDB.deleteFrom('fileTags').where('assetId', 'in', assetIds).where('tagId', 'in', removeTagIds),
      'fileTags',
    );
  }

  useAppStore.getState().markAssetChanged(changedAssetIds);

  const keywordFailures = await writeKeywordsForAssets(changedAssetIds, onFileProgress);
  for (const [id, message] of keywordFailures) fileFailures.set(id, message);

  return { updated: changedAssetIds.length, fileFailures };
}

/** Restores exact tag memberships for an undo in one DB/file-write batch. */
export async function restoreAssetsTags(
  entries: { id: string; beforeTagIds: string[]; expectedTagIds: string[] }[],
): Promise<Map<string, string>> {
  const ids = entries.map((entry) => entry.id);
  const current = await tagIdsByAsset(ids);
  for (const entry of entries) {
    const actual = [...(current.get(entry.id) ?? [])].sort();
    const expected = [...entry.expectedTagIds].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('One or more files had their tags edited again');
    }
  }

  await executeInDB(kyselyDB.deleteFrom('fileTags').where('assetId', 'in', ids), 'fileTags');
  const rows = entries.flatMap((entry) => entry.beforeTagIds.map((tagId) => ({ assetId: entry.id, tagId })));
  if (rows.length > 0) await safelyExecuteBatchInsert('fileTags', rows);
  useAppStore.getState().markAssetChanged(ids);
  return writeKeywordsForAssets(ids);
}

/** Removes face data from the library and, when enabled, the source files. */
export async function removeFaceData(
  assets: AssetInClient[],
  onFileProgress?: (processed: number, total: number) => void,
): Promise<{ fileFailures: Map<string, string> }> {
  const fileFailures = new Map<string, string>();
  if (assets.length === 0) return { fileFailures };

  const assetIds = assets.map((asset) => asset.id);
  await assertAssetsMetadataScanned(assetIds);

  // Keep the library deletion even if metadata write-back later fails.
  await RegionsService.removeRegionsForAssets(assetIds);
  useAppStore.getState().markAssetChanged(assetIds);

  return {
    fileFailures: await writeRegionsForAssets(
      assetIds.map((assetId) => ({ assetId, regions: [] })),
      { clearIfEmpty: true, onProgress: onFileProgress },
    ),
  };
}

/**
 * Queues an edit for the next sync when write-back is deferred, and reports
 * whether it did — callers skip their immediate file write when it returns true.
 */
async function _deferFileWrite(ids: string[]): Promise<boolean> {
  if (!shouldWriteBackOnSync()) return false;
  if (ids.length > 0) {
    await executeInDB(
      kyselyDB.updateTable('assets').set({ pendingFileWrite: 1 }).where('id', 'in', ids),
      'assets',
    );
  }
  return true;
}

/**
 * Splits a batch of file writes into failures (reported per asset id) and
 * successes (whose tracking columns are refreshed so the next sync doesn't read
 * our own write as an external change).
 */
async function _trackWrittenFiles(
  entries: { id: string; fullPath: string }[],
  pathFailures: Map<string, string>,
  fileFailures: Map<string, string>,
): Promise<void> {
  for (const entry of entries) {
    const failure = pathFailures.get(entry.fullPath);
    if (failure) fileFailures.set(entry.id, failure);
    else await refreshFileTracking(entry.id, entry.fullPath);
  }
}

/**
 * Rebuilds a rotated asset's thumbnails, then flips its DB orientation + swapped
 * dimensions (and refreshed file tracking) in a single row update. Rebuilding
 * *before* the geometry flip keeps the gallery consistent: a tile's box only
 * takes the new aspect ratio once the thumbnail that fills it has the matching
 * orientation baked in. Both DEFAULT and XS thumbnails are rebuilt so neither
 * layer paints the stale ratio; the full preview is only invalidated (rebuilt
 * lazily when the lightbox asks for it). Tracking is best-effort — a stat failure
 * only means slightly stale metadata, so the flip still stands.
 */
async function _applyRotation(
  asset: AssetInClient,
  orientation: AssetInClient['metadata']['orientation'],
): Promise<void> {
  try {
    await regenerateThumbnailOfFile(asset);
    if (needsGeneratedPreview(asset.filename)) {
      await deletePreviewOfFile(asset.id);
    }
  } catch (error) {
    errorLog('assets', 'rotation-cache-refresh-failed', error, { asset: asset.id });
  }

  const changes: Updateable<SqliteDbStructure['assets']> = {
    orientation,
    width: asset.metadata.height,
    height: asset.metadata.width,
  };
  try {
    const stat = await statFile(asset.fullPath);
    changes.filesize = stat.filesize;
    changes.fileMtime = stat.fileMtime.toISOString();
    changes.inode = stat.inode;
    changes.lastScanned = new Date().toISOString();
  } catch (error) {
    errorLog('assets', 'tracking-refresh-failed', error, { asset: asset.id });
  }
  await updateAssetRow(asset.id, changes);
}

/** Trims a text value and turns blank/undefined into `null` for storage. */
function _emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
