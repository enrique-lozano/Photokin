import { expandAlbumScope } from '@/common/albumScope';
import { AlbumsService } from '@/db/api/services/albums.service';
import {
  clearAssetFingerprints,
  getValidAssetFingerprints,
  saveAssetFingerprints,
} from '@/db/api/services/assetFingerprints.service';
import { AssetsService } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { trackProcess } from '@/system/processTracker';
import { useCallback } from 'react';
import { scanForDuplicates } from './duplicateScanner';
import { loadDuplicatesCache } from './duplicatesCache';
import { useDuplicatesStore } from './useDuplicatesStore';
import { ProcessKind } from '@/stores/processStore';

/** Options accepted when triggering a (re-)scan. */
interface RunScanOptions {
  /** Discard cached fingerprints first so every file is re-hashed from scratch. */
  refreshFingerprints?: boolean;
}

/**
 * Runs the duplicate scan on the existing background-task mechanism (same
 * `trackProcess` plumbing the Faces scanner uses), so progress shows in the
 * footer and the rest of the app stays usable.
 */
export function useDuplicatesScan(): (options?: RunScanOptions) => Promise<void> {
  return useCallback(async (options?: RunScanOptions) => {
    const store = useDuplicatesStore.getState();
    const { albumIds, includeSubAlbums, similarityThreshold } = store;
    store.setScanStatus('scanning');

    try {
      await trackProcess(
        {
          kind: ProcessKind.Generic,
          title: 'Scanning for duplicates',
          message: 'Loading library…',
          canStop: true,
          successMessage: (result: Awaited<ReturnType<typeof scanForDuplicates>>) =>
            result.sets.length > 0
              ? `Found ${result.sets.length.toLocaleString()} duplicate set${result.sets.length === 1 ? '' : 's'}`
              : 'No duplicates found',
          errorMessage: (error) => `Duplicate scan failed: ${String(error)}`,
          getWarnings: (result) => result.warnings,
        },
        async (reporter) => {
          reporter.throwIfStopped();
          await loadDuplicatesCache();
          if (options?.refreshFingerprints) await clearAssetFingerprints();
          const fingerprintCache = await getValidAssetFingerprints();
          const persistedFingerprints = new Map(fingerprintCache);

          const all = await AssetsService.getFiles({});
          const totalBytes = all.reduce((acc, asset) => acc + asset.filesize, 0);

          let scoped: AssetInClient[] = all;
          if (albumIds.length > 0) {
            const albums = await AlbumsService.getAll();
            const expanded = new Set(includeSubAlbums ? expandAlbumScope(albums, albumIds) : albumIds);
            scoped = all.filter((asset) => expanded.has(asset.album.id));
          }

          const result = await scanForDuplicates(
            scoped,
            { albumIds, includeSubAlbums, similarityThreshold },
            reporter,
            fingerprintCache,
          );

          reporter.throwIfStopped();
          useDuplicatesStore.getState().applyScanResult(result, totalBytes);
          const changedFingerprints = new Map(
            [...fingerprintCache].filter(([assetId, value]) => {
              const persisted = persistedFingerprints.get(assetId);
              return (
                !persisted ||
                persisted.size !== value.size ||
                persisted.pHash !== value.pHash ||
                persisted.contentHash !== value.contentHash
              );
            }),
          );
          await saveAssetFingerprints(changedFingerprints);
          return result;
        },
      );
    } catch {
      // trackProcess already surfaced the error toast; reset the page state.
      const hasResults = useDuplicatesStore.getState().sets.length > 0;
      useDuplicatesStore.getState().setScanStatus(hasResults ? 'done' : 'idle');
    }
  }, []);
}
