import type { BulkFileProgress } from '@/system/bulkOutcome';
import clsx from 'clsx';
import './bulkAction.css';

/**
 * In-dialog progress for a running bulk action, styled like the process toast's
 * bar so dialog-hosted and background work read the same.
 *
 * `progress` is `null` until the file-writing step starts, which is exactly the
 * window where the dialog's own counts have already gone stale — the live rows
 * behind them were updated by the library transaction. Showing the step by name
 * is what keeps that moment from looking like an empty selection.
 */
export function BulkActionProgress({
  label,
  progress,
}: {
  /** Present tense, e.g. "Confirming faces". */
  label: string;
  progress: BulkFileProgress;
}) {
  const percent =
    progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : null;

  return (
    <div className="bulk-action-progress" role="status" aria-live="polite">
      <div className="bulk-action-progress__row">
        <span className="bulk-action-progress__label">
          {progress
            ? `${label} · writing ${progress.processed.toLocaleString()} of ${progress.total.toLocaleString()} ${
                progress.total === 1 ? 'file' : 'files'
              }…`
            : `${label} · saving to the library…`}
        </span>
        {percent !== null && <span className="bulk-action-progress__percent">{percent}%</span>}
      </div>

      <span
        className={clsx(
          'bulk-action-progress__bar',
          percent === null && 'bulk-action-progress__bar--indeterminate',
        )}
      >
        <span
          className="bulk-action-progress__bar-fill"
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </span>
    </div>
  );
}
