import clsx from 'clsx';
import { type Id, toast as toastify, type ToastOptions } from 'react-toastify';
import { type AppProcess, useProcessStore } from '../../stores/processStore';
import { stopProcess } from '../../system/processCancellation';
import { Button } from '../ui/button';
import { ToastStatusIcon } from '../ui/toastIcons';
import { getProcessKindMeta } from './processKind';
import { useProcessWarningsDialog } from './ProcessWarningsDialog';

/**
 * How long a running process notification stays on screen before it autohides
 * into the footer. Re-openable from the footer indicator at any time.
 */
const RUNNING_AUTOCLOSE_MS = 5_000;
/** How long a successful result lingers before it disappears. */
const SUCCESS_AUTOCLOSE_MS = 5_000;
/** Successes the user can just as easily reverse in place (`briefSuccess`). */
const BRIEF_SUCCESS_AUTOCLOSE_MS = 3_000;
/** Errors stick around noticeably longer so the user can read them. */
const ERROR_AUTOCLOSE_MS = 10_000;

/**
 * Live toast body for a single process. Shares the default toast layout (small
 * leading icon + title/description) so a running process and its success/error
 * result look identical to any other toast. While running it also renders a
 * determinate (or indeterminate) progress bar pinned to the bottom edge.
 */
function ProcessToastBody({ id }: { id: string }) {
  const process = useProcessStore((state) => state.processes.find((item) => item.id === id));

  if (!process) {
    return null;
  }

  const isRunning = process.status === 'running';
  const hasProgress = process.progress !== null && Number.isFinite(process.progress);
  const percent = hasProgress ? Math.round((process.progress as number) * 100) : null;
  const hasWarnings = !isRunning && (process.warnings?.length ?? 0) > 0;
  const KindIcon = getProcessKindMeta(process.kind).icon;

  return (
    <div className="app-process-toast">
      <span className="app-process-toast__icon">
        {process.status === 'error' ? (
          <ToastStatusIcon tone="error" />
        ) : hasWarnings ? (
          <ToastStatusIcon tone="warning" />
        ) : process.status === 'success' ? (
          <ToastStatusIcon tone="success" />
        ) : (
          <KindIcon size={20} className={clsx(isRunning && 'process-row-spinner')} />
        )}
      </span>

      <div className="app-toast">
        <span className="app-toast__title">
          <span className="app-process-toast__title-text">{process.title}</span>
          {isRunning && percent !== null && <span className="app-process-toast__percent">{percent}%</span>}
        </span>
        {process.message && <span className="text-xs text-muted-foreground">{process.message}</span>}
        {isRunning && process.canStop && (
          <Button
            type="button"
            variant="link"
            className="mt-0.5 h-auto self-start p-0 text-xs font-semibold"
            disabled={process.stopping}
            onClick={(event) => {
              event.stopPropagation();
              useProcessStore.getState().updateProcess(id, {
                stopping: true,
                message: 'Stopping…',
              });
              stopProcess(id);
            }}
          >
            {process.stopping ? 'Stopping…' : 'Stop'}
          </Button>
        )}
        {hasWarnings && (
          <Button
            type="button"
            variant="link"
            className="mt-0.5 h-auto self-start p-0 text-xs font-semibold"
            onClick={(event) => {
              event.stopPropagation();
              useProcessWarningsDialog.getState().open(process.title, process.warnings ?? []);
            }}
          >
            View details
          </Button>
        )}
        {!isRunning && process.status === 'success' && process.successAction && (
          <Button
            type="button"
            variant="link"
            className="mt-0.5 h-auto self-start p-0 text-xs font-semibold"
            onClick={(event) => {
              event.stopPropagation();
              process.successAction?.onClick();
              toastify.dismiss(id);
            }}
          >
            {process.successAction.label}
          </Button>
        )}
      </div>

      {isRunning && (
        <span
          className={clsx('app-process-toast__bar', !hasProgress && 'app-process-toast__bar--indeterminate')}
        >
          <span
            className="app-process-toast__bar-fill"
            style={hasProgress ? { width: `${percent}%` } : undefined}
          />
        </span>
      )}
    </div>
  );
}

function autoCloseFor(process: AppProcess): ToastOptions['autoClose'] {
  if (process.status === 'error') {
    return ERROR_AUTOCLOSE_MS;
  }
  if (process.status === 'success') {
    // Linger like an error when warnings are present, so the user has time to
    // notice them and open the details action.
    if ((process.warnings?.length ?? 0) === 0 && process.briefSuccess) return BRIEF_SUCCESS_AUTOCLOSE_MS;
    return (process.warnings?.length ?? 0) > 0 || process.successAction
      ? ERROR_AUTOCLOSE_MS
      : SUCCESS_AUTOCLOSE_MS;
  }
  return RUNNING_AUTOCLOSE_MS;
}

/**
 * Remove the process from the store once its notification is gone, but only when
 * the work has actually finished. A running process whose toast autohid (or was
 * dismissed) must survive so the footer can re-open it later.
 */
function handleClose(id: string): void {
  const process = useProcessStore.getState().processes.find((item) => item.id === id);
  if (!process || process.status !== 'running') {
    useProcessStore.getState().removeProcess(id);
  }
}

/**
 * Create or refresh the toast for a process so it reflects the current store
 * state. Creating is skipped for running processes that already autohid unless
 * they are being explicitly re-opened (see {@link reopenProcessToasts}).
 */
export function syncProcessToast(id: string): void {
  const process = useProcessStore.getState().processes.find((item) => item.id === id);
  if (!process) {
    return;
  }

  const autoClose = autoCloseFor(process);

  if (toastify.isActive(id)) {
    toastify.update(id, { autoClose });
    return;
  }

  toastify(<ProcessToastBody id={id} />, {
    autoClose,
    toastId: id,
    className: 'app-toast-item app-toast-item--process',
    icon: false,
    closeButton: true,
    closeOnClick: false,
    onClose: () => handleClose(id),
  });
}

/** Alias used when a process starts; identical to {@link syncProcessToast}. */
export const showProcessToast = syncProcessToast;

/** Dismiss a process notification and drop the process from the store. */
export function dismissProcessToast(id: string): void {
  toastify.dismiss(id as Id);
  useProcessStore.getState().removeProcess(id);
}

/**
 * Re-display every process currently tracked by the store. Used by the footer
 * indicator so the user can pull autohidden notifications back into view.
 */
export function reopenProcessToasts(): void {
  const { processes } = useProcessStore.getState();
  for (const process of processes) {
    if (!toastify.isActive(process.id as Id)) {
      syncProcessToast(process.id);
    }
  }
}
