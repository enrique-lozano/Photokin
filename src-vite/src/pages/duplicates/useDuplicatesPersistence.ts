import { getTableObservable } from '@/db/api/tableObservables';
import { AssetsService } from '@/db/api/services/assets.service';
import { useEffect } from 'react';
import { buildSnapshot, loadDuplicatesCache, saveSnapshot } from './duplicatesCache';
import { useDuplicatesStore } from './useDuplicatesStore';

/** Unique asset ids referenced by the current (visible + ignored) sets. */
function _referencedAssetIds(): string[] {
  const { sets, ignoredSets } = useDuplicatesStore.getState();
  const ids = new Set<string>();
  for (const set of [...sets, ...ignoredSets]) {
    for (const member of set.members) ids.add(member.asset.id);
  }
  return [...ids];
}

/**
 * Wires the Duplicates page to its on-disk cache:
 *
 *  1. On first mount, restores the last scan from disk (no re-scan needed).
 *  2. Mirrors the snapshot back to disk whenever it actually changes.
 *  3. Re-validates the sets against the live library on every mount and whenever
 *     the `assets` table changes (e.g. an album removed while elsewhere in the
 *     app), so re-entering the page never shows stale sets — no polling, no
 *     timers, and no need to manually refresh the window.
 */
export function useDuplicatesPersistence(): void {
  useEffect(() => {
    if (useDuplicatesStore.getState().hydrated) return;
    let cancelled = false;

    void (async () => {
      const snapshot = await loadDuplicatesCache().catch(() => null);
      const persistedIds = snapshot
        ? [...snapshot.sets, ...snapshot.ignoredSets].flatMap((set) =>
            set.members.map((member) => member.assetId),
          )
        : [];
      if (cancelled) return;

      if (!snapshot || persistedIds.length === 0) {
        useDuplicatesStore.getState().markHydrated();
        return;
      }

      const assets = await AssetsService.getFiles({ assetIds: persistedIds }).catch(() => []);
      if (cancelled) return;
      const byId = new Map(assets.map((asset) => [asset.id, asset]));
      useDuplicatesStore.getState().hydrateFromCache(snapshot, byId);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let lastJson: string | null = null;
    const save = () => {
      const state = useDuplicatesStore.getState();
      if (!state.hydrated || state.scannedAt === null) return;
      // Skip identical writes so changes we don't persist (active set, sort,
      // column count) don't rewrite the file — no debounce needed.
      const json = JSON.stringify(buildSnapshot(state));
      if (json === lastJson) return;
      lastJson = json;
      void saveSnapshot(JSON.parse(json));
    };

    const unsubscribe = useDuplicatesStore.subscribe(save);
    return () => {
      unsubscribe();
      save();
    };
  }, []);

  useEffect(() => {
    const reconcile = async () => {
      if (!useDuplicatesStore.getState().hydrated) return;
      const ids = _referencedAssetIds();
      if (ids.length === 0) return;
      const assets = await AssetsService.getFiles({ assetIds: ids });
      const byId = new Map(assets.map((asset) => [asset.id, asset]));
      useDuplicatesStore.getState().reconcileAssets(byId);
    };

    // Reconcile immediately on mount (re-entering the page) and on every later
    // `assets` change while open.
    void reconcile().catch(() => undefined);
    const subscription = getTableObservable('assets').subscribe(() => {
      void reconcile().catch(() => undefined);
    });
    return () => subscription.unsubscribe();
  }, []);
}
