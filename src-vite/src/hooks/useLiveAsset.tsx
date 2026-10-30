import { AssetsService } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { useAppStore } from '@/stores/appState';
import { useEffect, useState } from 'react';

/**
 * Live view of a single asset's database row.
 *
 * Unlike {@link useLiveQuery}, which re-runs on any write to a whole table, this
 * hook is driven by the per-asset `assetRevisions` signal (bumped by
 * `AssetsService` on every asset update). It only re-fetches when `id` changes
 * or when that specific asset changes, so unrelated writes (e.g. a library sync
 * touching other rows) never trigger a refetch.
 *
 * `initialData` seeds the first render (e.g. the asset already in hand) to avoid
 * a loading flash. On navigation the previous value is kept until the new fetch
 * resolves, so callers that care about identity should guard on `asset.id`. A
 * failed fetch (e.g. the asset was deleted) keeps the last known value instead
 * of throwing.
 */
export function useLiveAsset(id: string | null, initialData?: AssetInClient | null): AssetInClient | null {
  const revision = useAppStore((state) => (id ? (state.assetRevisions[id] ?? 0) : 0));
  const [asset, setAsset] = useState<AssetInClient | null>(initialData ?? null);

  useEffect(() => {
    if (!id) {
      setAsset(null);
      return;
    }

    let cancelled = false;
    AssetsService.getByUUID(id)
      .then((fresh) => {
        if (!cancelled) {
          setAsset(fresh);
        }
      })
      .catch((error) => {
        console.warn('useLiveAsset: could not load asset', id, error);
      });

    return () => {
      cancelled = true;
    };
  }, [id, revision]);

  return asset;
}
