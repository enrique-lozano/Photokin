/**
 * Shared result shape for the app's bulk actions: confirming faces, editing
 * tags, dates, locations…
 *
 * They all have the same two steps — the library is updated in one transaction,
 * then the change is mirrored into the original files one by one. The second
 * step can fail per file while the library edit stands, so a bulk action reports
 * those problems in its result instead of throwing. Throwing is reserved for a
 * run that could not start, or that changed nothing at all.
 */

/** One item a bulk action could not finish, ready to be listed to the user. */
export interface BulkItemFailure {
  /** Asset id, so the failures alone can be retried. */
  id: string;
  /** What the user calls the item — normally its filename. */
  label: string;
  /** Why it failed, phrased to read after the label. */
  reason: string;
}

export interface BulkOutcome {
  /** Items the user acted on. The library change for these went through. */
  total: number;
  /** Original files in scope: the ones the change is mirrored into. */
  fileCount: number;
  /** Files left stale because their metadata could not be written. */
  fileFailures: BulkItemFailure[];
  /** Items intentionally left untouched, e.g. a filename collision during a move. */
  skipped?: BulkItemFailure[];
  /** Reverts the whole run, when it is reversible. */
  undo?: () => Promise<void>;
}

/**
 * Progress of the file-writing step, or `null` while the library transaction is
 * still running — that part has no countable units to report.
 */
export type BulkFileProgress = { processed: number; total: number } | null;

/** True when every file the action covered was written. */
export function isCleanOutcome(outcome: BulkOutcome): boolean {
  return outcome.fileFailures.length === 0 && (outcome.skipped?.length ?? 0) === 0;
}

/** Files in scope that completed without a reported write error. */
export function successfulFileCount(outcome: BulkOutcome): number {
  return Math.max(0, outcome.fileCount - outcome.fileFailures.length - (outcome.skipped?.length ?? 0));
}
