import { getFileExtensionFromPath, SupportedImageFormats } from '@/common/supportedFormats';
import { AppDataKey, AppDataService } from '@/db/api/services/appData.service';
import { AssetsService } from '@/db/api/services/assets.service';
import { selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { MetadataStage } from '@/db/models/AssetDTO';
import { AssetInClient } from '@/db/models/AssetInClient';
import { isImportWorkActive } from '@/media/import/importActivity';
import { overallProgress } from '@/media/import/importProgress';
import { getExistingThumbnailPath, resolveThumbnailPath } from '@/media/thumbnails/thumbnail';
import { ProcessKind } from '@/stores/processStore';
import { useSmartSearchSettingsStore } from '@/stores/smartSearchSettingsStore';
import { debugLog } from '@/system/devLogger';
import { HARDWARE_CONCURRENCY } from '@/system/hardware';
import { isProcessStopped } from '@/system/processCancellation';
import { ProcessReporter, trackProcess } from '@/system/processTracker';
import { chunked, mapWithConcurrency } from '@/utils/array.utils';
import { appTaskQueue } from '@/utils/taskQueue/taskQueue';
import { ClipImageSession } from './clipSidecar';
import { clearAssetEmbeddings, storeAssetEmbeddings } from './embeddingStore';
import { isModelDownloaded } from './models';

/** Images sent per session request (keeps memory and IPC payloads bounded). */
const INDEX_BATCH_SIZE = Math.max(32, Math.min(128, HARDWARE_CONCURRENCY * 4));
/** Conservative fallback-thumbnail fan-out: 2 on typical machines, capped at 4. */
const THUMBNAIL_CONCURRENCY = Math.max(2, Math.min(4, Math.floor(HARDWARE_CONCURRENCY / 4)));

const CLIP_DIRECT_IMAGE_FORMATS = new Set(
  [
    SupportedImageFormats.BMP,
    SupportedImageFormats.GIF,
    SupportedImageFormats.ICO,
    SupportedImageFormats.JPEG,
    SupportedImageFormats.JPG,
    SupportedImageFormats.PNG,
    SupportedImageFormats.TIF,
    SupportedImageFormats.TIFF,
    SupportedImageFormats.WEBP,
  ].map((format) => `.${format}`),
);

type IndexingPhase = 'preparing' | 'embedding';

/** Live (non-trashed) asset ids that have no CLIP embedding yet. */
async function _unindexedAssetIds(): Promise<string[]> {
  const rows = await selectFromDB(
    kyselyDB
      .selectFrom('assets')
      .leftJoin('smartSearch', 'smartSearch.assetId', 'assets.id')
      .where('smartSearch.assetId', 'is', null)
      .where('assets.trashedAt', 'is', null)
      .where('assets.metadataStage', '=', MetadataStage.Complete)
      .select('assets.id as id'),
  );
  return rows.map((row) => row.id);
}

/** Embed the thumbnails of `assets` with the active model and store the vectors. */
async function _indexAssets(
  assets: AssetInClient[],
  session: ClipImageSession,
  onProgress?: (done: number, total: number, phase: IndexingPhase) => void,
): Promise<void> {
  let prepared = 0;
  const imagePaths = await mapWithConcurrency(assets, THUMBNAIL_CONCURRENCY, async (asset) => {
    const existingThumbnail = await getExistingThumbnailPath(asset);
    const path =
      existingThumbnail ??
      (CLIP_DIRECT_IMAGE_FORMATS.has(getFileExtensionFromPath(asset.filename))
        ? asset.fullPath
        : await resolveThumbnailPath(asset));
    prepared += 1;
    onProgress?.(prepared, assets.length, 'preparing');
    return path;
  });
  const items = assets.flatMap((asset, index) => {
    const path = imagePaths[index];
    return path ? [{ id: asset.id, path }] : [];
  });

  if (items.length > 0) {
    const embeddings = await session.embedImages(items, (done) =>
      onProgress?.(done, assets.length, 'embedding'),
    );
    const toStore = [...embeddings].map(([assetId, embedding]) => ({ assetId, embedding }));
    if (toStore.length > 0) await storeAssetEmbeddings(toStore);
  }
  onProgress?.(assets.length, assets.length, 'embedding');
}

async function _indexPendingAssetsInQueuedBatches(reporter: ProcessReporter): Promise<number> {
  const { ids, modelId } = await appTaskQueue.add(
    async () => {
      reporter.throwIfStopped();
      const modelId = useSmartSearchSettingsStore.getState().activeModel;
      if ((await AppDataService.get(AppDataKey.SmartSearchModel)) !== modelId) {
        await clearAssetEmbeddings();
        await AppDataService.set(AppDataKey.SmartSearchModel, modelId);
      }
      const ids = (await isModelDownloaded(modelId)) ? await _unindexedAssetIds() : [];
      return { ids, modelId };
    },
    { signal: reporter.signal },
  );
  const total = ids.length;
  if (total === 0) return 0;

  const session = new ClipImageSession(modelId, reporter.signal);
  let considered = 0;

  try {
    for (const batchIds of chunked(ids, INDEX_BATCH_SIZE)) {
      reporter.throwIfStopped();
      const alreadyConsidered = considered;

      await appTaskQueue.add(
        async () => {
          reporter.throwIfStopped();
          const assets = await AssetsService.getFiles({ assetIds: batchIds });
          await _indexAssets(assets, session, (done, batchTotal, phase) => {
            const phaseWork = phase === 'preparing' ? done / 2 : batchTotal / 2 + done / 2;
            const progress = (alreadyConsidered + phaseWork) / Math.max(1, total);
            const overall = Math.min(total, Math.floor(alreadyConsidered + phaseWork));
            const action = phase === 'preparing' ? 'Preparing images for search' : 'Indexing for search';
            reporter.update({ message: `${action} · ${overall}/${total}`, progress });
          });
          reporter.throwIfStopped();

          // Assets without a thumbnail are skipped by `_indexAssets` but still count
          // as considered, so the bar reaches the end of a partially indexable batch.
          considered = alreadyConsidered + batchIds.length;
          const { progress } = overallProgress(considered, 0, total);
          reporter.update({ message: `Indexing for search · ${considered}/${total}`, progress });
        },
        { signal: reporter.signal },
      );
    }
  } finally {
    await session.shutdown();
  }

  return total;
}

// Prevents piling up parallel indexing processes when several imports/syncs
// finish close together. A trigger during an active run schedules exactly one
// rerun afterwards, so assets added mid-run are still picked up.
let indexingRunning = false;
let indexingRerun = false;

/**
 * Kick off backlog indexing as its *own* background process (separate from the
 * import/sync it may follow) on the shared serial task queue. Fire-and-forget:
 * it never blocks the caller, runs batch-by-batch so it doesn't hog the app,
 * and — since it only targets not-yet-indexed assets — resumes any backlog left
 * behind when the app was closed mid-run.
 */
export function startBackgroundIndexing(): void {
  if (isImportWorkActive()) {
    debugLog('smart-search', 'deferred', { reason: 'import-active' });
    return;
  }
  if (indexingRunning) {
    indexingRerun = true;
    return;
  }
  indexingRunning = true;
  debugLog('smart-search', 'started');

  void trackProcess(
    {
      kind: ProcessKind.Generic,
      title: 'Indexing for search',
      canStop: true,
      successMessage: false,
      errorMessage: (error) => `Could not index for search: ${String(error)}`,
    },
    (reporter) => _indexPendingAssetsInQueuedBatches(reporter),
  )
    .catch((error) => {
      if (isProcessStopped(error)) indexingRerun = false;
      // The process center already surfaced the error.
    })
    .finally(() => {
      indexingRunning = false;
      debugLog('smart-search', 'complete', { rerun: indexingRerun });
      if (indexingRerun) {
        indexingRerun = false;
        startBackgroundIndexing();
      }
    });
}
