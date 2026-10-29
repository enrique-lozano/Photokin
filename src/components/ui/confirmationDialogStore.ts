import { create } from 'zustand';
import type { ConfirmationOptions } from './confirmation-dialog';

interface ConfirmationDialogState {
  open: boolean;
  /** Kept after closing so the exit animation does not play on an empty box. */
  options: ConfirmationOptions | null;
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
  /** Closes the dialog and resolves the pending {@link confirm}. */
  settle: (confirmed: boolean) => void;
}

/**
 * Resolver for the confirmation currently on screen. It lives outside the store
 * so the state stays plain data and callers await a result instead of handing
 * over a callback, mirroring `useTrashDialog`.
 */
let _resolvePending: ((confirmed: boolean) => void) | null = null;

function _settlePending(confirmed: boolean): void {
  _resolvePending?.(confirmed);
  _resolvePending = null;
}

export const useConfirmationDialog = create<ConfirmationDialogState>((set) => ({
  open: false,
  options: null,
  confirm: (options) => {
    // A new confirmation supersedes whatever was still waiting.
    _settlePending(false);
    set({ open: true, options });

    return new Promise<boolean>((resolve) => {
      _resolvePending = resolve;
    });
  },
  settle: (confirmed) => {
    set({ open: false });
    _settlePending(confirmed);
  },
}));

/**
 * Asks the user to confirm an action, resolving `true` only if they go ahead.
 * Use it for confirmations whose copy is known when the action is triggered, so
 * the caller needs no `open` state:
 *
 * ```ts
 * if (!(await confirm({ ... }))) return;
 * ```
 *
 * Reach for `<ConfirmationDialog>` instead when the dialog has to load or
 * subscribe to data while it is open.
 */
export function confirm(options: ConfirmationOptions): Promise<boolean> {
  return useConfirmationDialog.getState().confirm(options);
}
