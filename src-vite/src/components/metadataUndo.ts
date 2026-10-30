import { toast, type AppToastAction } from '@/components/ui/toast';

/** How long a result toast that carries an "Undo" stays on screen. */
export const UNDO_DURATION_MS = 10_000;

export function metadataUndoAction(undo: () => Promise<void>): AppToastAction {
  return {
    label: 'Undo',
    onClick: async () => {
      try {
        await undo();
        toast.success('Change undone');
      } catch (error) {
        toast.error(`Could not undo change: ${String(error)}`);
      }
    },
  };
}

export function showMetadataUndoToast(message: string, undo: () => Promise<void>): void {
  toast.success(message, {
    duration: UNDO_DURATION_MS,
    action: metadataUndoAction(undo),
  });
}
