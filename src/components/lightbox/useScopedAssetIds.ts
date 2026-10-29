import { LightboxNavigationScope } from '@/context/LightboxContext';
import { AssetsService } from '@/db/api/services/assets.service';
import { getTableObservable } from '@/db/api/tableObservables';
import { useEffect, useMemo, useState } from 'react';

const EMPTY_IDS: string[] = [];

export type ScopedAssetIdsResult = {
  /** Ordered ids in the active scope (newest first, unless `preserveOrder`). */
  ids: string[];
  /**
   * True from the moment the lightbox opens until the first id list for this
   * scope resolves. Used to reserve filmstrip height and avoid a stage jump.
   */
  isLoading: boolean;
};

/**
 * Ordered ids of every asset in the lightbox's scope (newest first, matching the
 * gallery and prev/next), for the filmstrip and position counter. `enabled`
 * skips the query while the always-mounted viewer is closed. Only ids are
 * fetched; each thumbnail resolves its asset lazily on scroll.
 */
export function useScopedAssetIds(scope: LightboxNavigationScope, enabled: boolean): ScopedAssetIdsResult {
  // Value-based keys so an equivalent-but-new scope object doesn't re-run the query.
  const searchQueryKey = useMemo(() => JSON.stringify(scope?.searchQuery ?? null), [scope]);
  const assetIdsKey = useMemo(() => scope?.assetIds?.join(',') ?? null, [scope]);
  const dateField = scope?.dateField ?? 'date';
  const preserveOrder = scope?.preserveOrder ?? false;
  const scopeKey = `${enabled}|${searchQueryKey}|${assetIdsKey}|${dateField}|${preserveOrder}`;

  const [ids, setIds] = useState<string[]>(EMPTY_IDS);
  // `settledKey === scopeKey` means `ids` belongs to the current scope. Compared
  // during render so the first open frame already knows we're loading — unlike
  // a useEffect `setLoading(true)`, which would paint one frame without the strip.
  const [settledKey, setSettledKey] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIds(EMPTY_IDS);
      setSettledKey(scopeKey);
      return;
    }

    let cancelled = false;
    let latestRequest = 0;

    const load = async () => {
      const request = ++latestRequest;
      try {
        const result = await AssetsService.getScopedAssetIds({
          searchQuery: scope?.searchQuery,
          assetIds: scope?.assetIds,
          dateField,
          preserveOrder,
        });
        if (!cancelled && request === latestRequest) {
          setIds(result);
          setSettledKey(scopeKey);
        }
      } catch (error) {
        console.warn('Failed to load lightbox scope ids', error);
        if (!cancelled && request === latestRequest) {
          setIds(EMPTY_IDS);
          setSettledKey(scopeKey);
        }
      }
    };

    void load();
    const subscriptions = (['assets', 'fileTags', 'tagRegionInfo'] as const).map((table) =>
      getTableObservable(table).subscribe(() => {
        void load();
      }),
    );

    return () => {
      cancelled = true;
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [
    enabled,
    scopeKey,
    searchQueryKey,
    assetIdsKey,
    dateField,
    preserveOrder,
    scope?.searchQuery,
    scope?.assetIds,
  ]);

  return {
    ids: enabled ? ids : EMPTY_IDS,
    isLoading: enabled && settledKey !== scopeKey,
  };
}
