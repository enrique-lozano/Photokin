import { executeInDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { AreaBox } from '@/db/models/TagRegionInfoDTO';
import { isSupportedVideoPath } from '@/common/supportedFormats';
import {
  isMetadataWriteEnabled,
  shouldWriteBackOnSync,
} from '@/media/metadata/exiftool/write/metadataWritePolicy';
import { clearRegionsInFiles, writeRegionsToFiles } from '@/media/metadata/exiftool/write/write-regions';
import { getByUUID } from './assetQueries';
import { refreshFileTracking } from './assetRows';

/** An asset together with the face regions that belong in its file right now. */
export type AssetRegionsToWrite = {
  assetId: string;
  regions: { name: string; area: AreaBox }[];
};

/**
 * Mirrors confirmed face regions into the original files, under the same
 * write-back policy as every other editor: `readonly` never touches a file,
 * "on sync" queues the assets for the next sync, "immediately" writes now.
 *
 * Assets left without confirmed regions are skipped rather than cleared, like
 * {@link writeCurrentMetadataToFiles} does: a file may hold regions Photokin
 * never imported — unless `clearIfEmpty` is set, which strips region metadata
 * so a deleted person does not linger in the file. Returns `assetId → message`
 * for files that could not be written; the database change itself is already
 * committed.
 */
export async function writeRegionsForAssets(
  entries: AssetRegionsToWrite[],
  options: {
    clearIfEmpty?: boolean;
    onProgress?: (processed: number, total: number) => void;
  } = {},
): Promise<Map<string, string>> {
  const fileFailures = new Map<string, string>();
  if (entries.length === 0 || !isMetadataWriteEnabled()) return fileFailures;

  if (shouldWriteBackOnSync()) {
    const photoAssetIds: string[] = [];
    for (const entry of entries) {
      try {
        const asset = await getByUUID(entry.assetId);
        if (!isSupportedVideoPath(asset.fullPath)) photoAssetIds.push(entry.assetId);
      } catch (error) {
        fileFailures.set(entry.assetId, `could not resolve file (${String(error)})`);
      }
    }
    if (photoAssetIds.length === 0) return fileFailures;

    await executeInDB(
      kyselyDB.updateTable('assets').set({ pendingFileWrite: 1 }).where('id', 'in', photoAssetIds),
      'assets',
    );
    return fileFailures;
  }

  const toWrite: { id: string; fullPath: string; args: Parameters<typeof writeRegionsToFiles>[0][number] }[] =
    [];
  const toClear: { id: string; fullPath: string }[] = [];

  for (const entry of entries) {
    try {
      const asset = await getByUUID(entry.assetId);
      if (isSupportedVideoPath(asset.fullPath)) continue;
      if (entry.regions.length > 0) {
        toWrite.push({
          id: entry.assetId,
          fullPath: asset.fullPath,
          args: {
            fullPath: asset.fullPath,
            orientation: asset.metadata.orientation,
            displayWidth: asset.metadata.width,
            displayHeight: asset.metadata.height,
            regions: entry.regions,
          },
        });
      } else if (options.clearIfEmpty) {
        toClear.push({ id: entry.assetId, fullPath: asset.fullPath });
      }
    } catch (error) {
      fileFailures.set(entry.assetId, `could not resolve file (${String(error)})`);
    }
  }

  const writeEntries = toWrite.map((entry) => entry.args);
  const clearEntries = toClear.map(({ fullPath }) => ({ fullPath }));
  const writeFailures = options.onProgress
    ? await writeRegionsToFiles(writeEntries, options.onProgress)
    : await writeRegionsToFiles(writeEntries);
  const clearFailures = options.onProgress
    ? await clearRegionsInFiles(clearEntries, options.onProgress)
    : await clearRegionsInFiles(clearEntries);

  for (const entry of [...toWrite, ...toClear]) {
    const failure = writeFailures.get(entry.fullPath) ?? clearFailures.get(entry.fullPath);
    if (failure) fileFailures.set(entry.id, failure);
    else await refreshFileTracking(entry.id, entry.fullPath);
  }

  return fileFailures;
}
