import { toast } from '@/components/ui/toast';
import type { BulkFileProgress, BulkOutcome } from '@/system/bulkOutcome';
import { useCallback, useEffect, useRef, useState } from 'react';

export type BulkActionDialogPhase =
  | { kind: 'edit' }
  | { kind: 'running'; label: string; progress: BulkFileProgress }
  | { kind: 'result'; summary: string; outcome: BulkOutcome };
export type BulkActionDialogPhaseKind = BulkActionDialogPhase['kind'];

type RunBulkAction = {
  label: string;
  summary: (outcome: BulkOutcome) => string;
  action: (onFileProgress: (processed: number, total: number) => void) => Promise<BulkOutcome>;
};

/**
 * Shared edit → running → result state machine for dialog-hosted bulk actions.
 * Hard failures return to the editor and use an error toast; partial file
 * failures are successful outcomes and stay in the dialog's result step.
 */
export function useBulkActionDialog(
  onRunningChange?: (running: boolean) => void,
  onPhaseChange?: (phase: BulkActionDialogPhaseKind) => void,
) {
  const [phase, setPhase] = useState<BulkActionDialogPhase>({ kind: 'edit' });
  const [isUndoing, setIsUndoing] = useState(false);

  async function run({ label, summary, action }: RunBulkAction): Promise<void> {
    setPhase({ kind: 'running', label, progress: null });
    onRunningChange?.(true);
    onPhaseChange?.('running');
    try {
      const outcome = await action((processed, total) =>
        setPhase((current) =>
          current.kind === 'running' ? { ...current, progress: { processed, total } } : current,
        ),
      );
      setPhase({ kind: 'result', summary: summary(outcome), outcome });
      onPhaseChange?.('result');
    } catch (error) {
      setPhase({ kind: 'edit' });
      onPhaseChange?.('edit');
      toast.error(String(error));
    } finally {
      onRunningChange?.(false);
    }
  }

  async function undo(onDone: () => void): Promise<void> {
    if (phase.kind !== 'result' || !phase.outcome.undo) return;

    setIsUndoing(true);
    try {
      await phase.outcome.undo();
      toast.success('Change undone');
      onDone();
    } catch (error) {
      toast.error(`Could not undo change: ${String(error)}`);
    } finally {
      setIsUndoing(false);
    }
  }

  const reset = useCallback((): void => {
    setPhase({ kind: 'edit' });
    setIsUndoing(false);
    onRunningChange?.(false);
    onPhaseChange?.('edit');
  }, [onPhaseChange, onRunningChange]);

  return { phase, isUndoing, run, undo, reset };
}

/** Makes a frozen editor unreachable by pointer, keyboard, and assistive focus. */
export function useInertWhen(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.inert = active;
  }, [active]);

  return ref;
}
