import { useEffect, useState } from 'react';
import { AssetsService } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';

/**
 * Re-reads a set of assets from the DB when a dialog opens. The assets handed
 * to a dialog are selection snapshots that can be stale after a prior edit, so
 * the dialog should edit the current rows rather than the snapshot.
 */
export function useLiveAssetSnapshot(assets: AssetInClient[]): AssetInClient[] {
  const [liveAssets, setLiveAssets] = useState(assets);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(assets.map((asset) => AssetsService.getByUUID(asset.id).catch(() => asset))).then(
      (fresh) => {
        if (!cancelled) setLiveAssets(fresh);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [assets]);

  return liveAssets;
}
