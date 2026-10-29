import { AssetInClient } from '@/db/models/AssetInClient';
import { create } from 'zustand';

/** Which confirmation the {@link TrashConfirmDialog} should show. */
export type TrashDialogMode = 'trash' | 'restore' | 'delete' | 'empty';

/** How a confirmation ended, as awaited by whoever opened it. */
export type TrashDialogOutcome = 'completed' | 'cancelled' | 'failed';

interface TrashDialogState {
  open: boolean;
  mode: TrashDialogMode;
  /**
   * Snapshot of the target assets, taken when the dialog opens so it is
   * unaffected by later selection changes. Empty for the `empty` (whole Trash)
   * action, which resolves its targets on confirm.
   */
  assets: AssetInClient[];
  /**
   * Optional scope note appended to the confirmation copy, so a basket action
   * can be honest about what isn't visible — e.g. "(4 not visible here)".
   */
  note?: string;
  /**
   * Opens the confirmation and resolves once the user decides: `completed`
   * after the action finished, `cancelled` if it was dismissed (or there was
   * nothing to act on), `failed` if the action threw.
   */
  request: (mode: TrashDialogMode, assets: AssetInClient[], note?: string) => Promise<TrashDialogOutcome>;
  /** Hides the dialog while the action runs; the request settles afterwards. */
  hide: () => void;
  /** Hides the dialog and resolves the pending {@link TrashDialogState.request}. */
  settle: (outcome: TrashDialogOutcome) => void;
}

/**
 * Resolver for the confirmation currently on screen. It lives outside the store
 * so the state stays plain data and callers await a result instead of handing
 * over a callback to be held in global state.
 */
let _resolvePending: ((outcome: TrashDialogOutcome) => void) | null = null;

function _settlePending(outcome: TrashDialogOutcome): void {
  _resolvePending?.(outcome);
  _resolvePending = null;
}

export const useTrashDialog = create<TrashDialogState>((set) => ({
  open: false,
  mode: 'trash',
  assets: [],
  note: undefined,
  request: (mode, assets, note) => {
    // A new confirmation supersedes whatever was still waiting.
    _settlePending('cancelled');

    if (mode !== 'empty' && assets.length === 0) {
      return Promise.resolve<TrashDialogOutcome>('cancelled');
    }

    set({ open: true, mode, assets, note });

    return new Promise<TrashDialogOutcome>((resolve) => {
      _resolvePending = resolve;
    });
  },
  hide: () => set({ open: false, note: undefined }),
  settle: (outcome) => {
    set({ open: false, note: undefined });
    _settlePending(outcome);
  },
}));
