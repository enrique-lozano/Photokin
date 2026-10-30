import { AssetInClient } from '@/db/models/AssetInClient';
import { create } from 'zustand';

export interface AssetDialogState {
  open: boolean;
  /**
   * Snapshot of the target assets, taken when the dialog opens so it is
   * unaffected by later selection changes.
   */
  assets: AssetInClient[];
  openDialog: (assets: AssetInClient[]) => void;
  close: () => void;
}

/**
 * Store for a globally-hosted dialog that acts on a selection snapshot.
 * Opening with an empty selection is a no-op, so callers can forward a
 * selection without checking it first.
 */
export function createAssetDialogStore() {
  return create<AssetDialogState>((set) => ({
    open: false,
    assets: [],
    openDialog: (assets) => {
      if (assets.length > 0) set({ open: true, assets });
    },
    close: () => set({ open: false }),
  }));
}
