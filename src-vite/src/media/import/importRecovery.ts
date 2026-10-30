import { RootAlbumsService } from '@/db/api/services/rootAlbums.service';
import { AssetsService } from '@/db/api/services/assets.service';
import { MetadataStage } from '@/db/models/AssetDTO';
import { trackProcess } from '@/system/processTracker';
import { appTaskQueue } from '@/utils/taskQueue/taskQueue';
import { createTraceId, debugLog, errorLog } from '@/system/devLogger';
import { drainImportBacklog } from './importPipeline';
import { ProcessKind } from '@/stores/processStore';

let recoveryPromise: Promise<void> | null = null;

/** Resume only work explicitly left incomplete; this is independent of full startup sync. */
export function recoverIncompleteImports(): Promise<void> {
  if (recoveryPromise) return recoveryPromise;

  recoveryPromise = (async () => {
    const traceId = createTraceId('recovery');
    const hasPendingRoots = (await RootAlbumsService.getAll()).some((root) => Boolean(root.importPending));
    const hasPendingAssets =
      (await AssetsService.getPendingMetadataAssets(MetadataStage.Discovered, 1)).length > 0 ||
      (await AssetsService.getPendingMetadataAssets(MetadataStage.LocationPending, 1)).length > 0;
    if (!hasPendingRoots && !hasPendingAssets) {
      debugLog(traceId, 'nothing-pending');
      return;
    }
    debugLog(traceId, 'started', { pendingRoots: hasPendingRoots, pendingAssets: hasPendingAssets });

    try {
      await trackProcess(
        {
          kind: ProcessKind.Import,
          title: 'Finishing photo import',
          message: 'Checking unfinished work…',
          canStop: true,
          successMessage: false,
          errorMessage: (error) => `Could not finish photo import: ${String(error)}`,
        },
        (reporter) =>
          appTaskQueue.add(
            async () => {
              reporter.throwIfStopped();
              await RootAlbumsService.resumePendingImports(reporter, traceId);
              reporter.throwIfStopped();
              await drainImportBacklog(reporter, { startSearch: false, traceId });
            },
            { signal: reporter.signal },
          ),
      );
      debugLog(traceId, 'complete');
    } catch (error) {
      errorLog(traceId, 'failed', error);
      throw error;
    }
  })();

  return recoveryPromise;
}
