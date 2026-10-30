/** Files per exiftool command / working set. Large batches are free; the toast still moves per file. */
export const IMPORT_BATCH_SIZE = 200;

/** Refresh the UI on the first and last file of a batch, and every Nth between. */
const PROGRESS_TICK_EVERY = 25;

/**
 * Maps a per-batch counter onto the library-wide one, so a 200-file batch inside
 * a 2000-file import keeps counting up instead of restarting at 1 each spawn.
 */
export function overallProgress(
  completed: number,
  current: number,
  total: number,
): { done: number; progress: number | null } {
  const done = completed + current;
  return { done, progress: total > 0 ? done / total : null };
}

/**
 * Whether a per-file counter should reach the UI. Reporting every file would
 * re-render the progress toast thousands of times during a large import.
 */
export function isProgressTick(current: number, batchTotal: number): boolean {
  return current === 1 || current === batchTotal || current % PROGRESS_TICK_EVERY === 0;
}
