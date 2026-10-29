import { metadataUndoAction } from '@/components/metadataUndo';
import type { BulkOutcome } from '@/system/bulkOutcome';
import { trackProcess } from '@/system/processTracker';
import { ProcessKind } from '@/stores/processStore';

/**
 * Runs a bulk action that has no surface of its own — a selection action, an
 * "Accept all" button — through the process center: live progress while it
 * writes, then one result notification carrying the undo and, when files were
 * left stale, a "View details" list of them.
 *
 * This is the right home for those actions precisely because the button that
 * started them usually disappears: accepting a person's suggestions empties the
 * banner that offered it while the files are still being written.
 *
 * Actions hosted in a dialog report inline instead, since the dialog outlives
 * the live rows its counts came from — see `BulkActionProgress` and
 * `BulkActionResult`.
 */
export async function trackBulkAction({
  title,
  summary,
  run,
}: {
  /** Headline of the work, e.g. "Confirming faces". */
  title: string;
  /** What went through, e.g. "Confirmed 412 faces". */
  summary: (outcome: BulkOutcome) => string;
  run: (onFileProgress: (processed: number, total: number) => void) => Promise<BulkOutcome>;
}): Promise<BulkOutcome> {
  return trackProcess<BulkOutcome>(
    {
      kind: ProcessKind.Generic,
      title,
      progress: 0,
      successMessage: summary,
      getWarnings: (outcome) => [
        ...(outcome.skipped ?? []).map((item) => `${item.label}: skipped (${item.reason})`),
        ...outcome.fileFailures.map((failure) => `${failure.label}: ${failure.reason}`),
      ],
      getSuccessAction: (outcome) => (outcome.undo ? metadataUndoAction(outcome.undo) : undefined),
    },
    (reporter) => run((processed, total) => reporter.setProgress(processed, total)),
  );
}
