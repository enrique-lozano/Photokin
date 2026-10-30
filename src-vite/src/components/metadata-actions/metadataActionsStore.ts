import { AssetInClient } from '@/db/models/AssetInClient';
import { create } from 'zustand';

/** Which bulk metadata operation the confirmation dialog is about to run. */
export type MetadataActionKind = 'reload' | 'write';

interface MetadataActionsState {
  open: boolean;
  kind: MetadataActionKind;
  /** Snapshot of the assets to act on, taken when the dialog opens so it is
   * unaffected by later selection changes. */
  assets: AssetInClient[];
  openDialog: (kind: MetadataActionKind, assets: AssetInClient[]) => void;
  close: () => void;
}

export const useMetadataActionsDialog = create<MetadataActionsState>((set) => ({
  open: false,
  kind: 'reload',
  assets: [],
  openDialog: (kind, assets) => {
    if (assets.length === 0) return;
    set({ open: true, kind, assets });
  },
  close: () => set({ open: false }),
}));
