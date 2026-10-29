import { AssetsService } from '@/db/api/services/assets.service';
import { MetadataStage } from '@/db/models/AssetDTO';
import { reverseGeocode } from '@/media/metadata/location/geocode';
import { startBackgroundIndexing } from '@/media/smartSearch/indexing';
import { ProcessReporter } from '@/system/processTracker';
import { createTraceId, debugLog, timingsSince, warningLog } from '@/system/devLogger';
import { beginImportWork, endImportWork } from './importActivity';
import { IMPORT_BATCH_SIZE, overallProgress } from './importProgress';
let activeDrain: Promise<void> | null = null;

export function drainImportBacklog(
  reporter?: ProcessReporter,
  options?: { startSearch?: boolean; traceId?: string },
): Promise<void> {
  if (activeDrain) return activeDrain;
  activeDrain = _drain(reporter, options).finally(() => {
    activeDrain = null;
  });
  return activeDrain;
}

async function _drain(
  reporter?: ProcessReporter,
  options?: { startSearch?: boolean; traceId?: string },
): Promise<void> {
  const traceId = options?.traceId ?? createTraceId('import');
  beginImportWork();
  try {
    reporter?.throwIfStopped();
    reporter?.update({ title: 'Reading photo details' });
    const metadataTotal = await AssetsService.getPendingMetadataCount(MetadataStage.Discovered);
    debugLog(traceId, 'metadata-start', { files: metadataTotal, batchSize: IMPORT_BATCH_SIZE });
    const metadataStartedAt = performance.now();
    let processed = 0;
    let batchNumber = 0;
    let metadataCursor: string | undefined;
    while (true) {
      reporter?.throwIfStopped();
      const batch = await AssetsService.getPendingMetadataAssets(
        MetadataStage.Discovered,
        IMPORT_BATCH_SIZE,
        metadataCursor,
      );
      if (batch.length === 0) break;
      metadataCursor = batch.at(-1)?.id;
      batchNumber += 1;
      const startedAt = performance.now();
      const result = await AssetsService.reloadMetadataForAssets(
        batch,
        (current) => {
          const { done, progress } = overallProgress(processed, current, metadataTotal);
          reporter?.update({ message: `Reading metadata · ${done}/${metadataTotal} files`, progress });
        },
        { place: 'defer' },
      );
      processed += batch.length;
      debugLog(traceId, 'metadata-batch', {
        batch: batchNumber,
        files: batch.length,
        processed,
        failures: result.failures.size,
        ...timingsSince(startedAt, batch.length),
      });
      if (result.failures.size > 0) {
        warningLog(traceId, 'metadata-batch-incomplete', {
          batch: batchNumber,
          failures: result.failures.size,
        });
      }
    }
    debugLog(traceId, 'metadata-complete', {
      files: processed,
      ...timingsSince(metadataStartedAt, processed),
    });

    await geocodePendingLocations(reporter, traceId);
  } finally {
    endImportWork();
  }

  reporter?.throwIfStopped();
  if (options?.startSearch !== false) {
    debugLog(traceId, 'smart-search-queued');
    startBackgroundIndexing();
  }
}

/**
 * Reverse-geocodes every asset still waiting in the `LocationPending` stage, in
 * batches. Coordinates are cached by `reverseGeocode`, so photos taken in the
 * same spot cost one lookup. Also used after a bulk metadata reload.
 */
export async function geocodePendingLocations(
  reporter?: ProcessReporter,
  traceId = createTraceId('geocode'),
): Promise<void> {
  const locationTotal = await AssetsService.getPendingMetadataCount(MetadataStage.LocationPending);
  debugLog(traceId, 'geocode-start', { files: locationTotal });
  const geocodeStartedAt = performance.now();
  let locationProcessed = 0;
  let locationBatch = 0;
  let locationCursor: string | undefined;
  while (true) {
    reporter?.throwIfStopped();
    const locations = await AssetsService.getPendingMetadataAssets(
      MetadataStage.LocationPending,
      IMPORT_BATCH_SIZE,
      locationCursor,
    );
    if (locations.length === 0) break;
    locationCursor = locations.at(-1)?.id;
    locationBatch += 1;
    const startedAt = performance.now();
    const updates: { id: string; place: Awaited<ReturnType<typeof reverseGeocode>> }[] = [];
    for (const asset of locations) {
      reporter?.throwIfStopped();
      updates.push({
        id: asset.id,
        place:
          asset.latitude != null && asset.longitude != null
            ? await reverseGeocode(asset.latitude, asset.longitude)
            : null,
      });
      locationProcessed += 1;
      const { progress } = overallProgress(locationProcessed, 0, locationTotal);
      reporter?.update({
        message: `Finding places · ${locationProcessed}/${locationTotal} files`,
        progress,
      });
    }
    await AssetsService.applyDeferredLocations(updates);
    debugLog(traceId, 'geocode-batch', {
      batch: locationBatch,
      files: locations.length,
      processed: locationProcessed,
      ...timingsSince(startedAt, locations.length),
    });
  }
  debugLog(traceId, 'geocode-complete', {
    files: locationProcessed,
    ...timingsSince(geocodeStartedAt, locationProcessed),
  });
}
