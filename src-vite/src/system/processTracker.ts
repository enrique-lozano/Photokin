import {
  dismissProcessResultToast,
  showProcessResultToast,
  showProcessToast,
} from '../components/process-center/processToasts';
import { ProcessKind, ProcessPatch, useProcessStore } from '../stores/processStore';
import {
  isProcessStopped,
  ProcessStoppedError,
  registerProcessController,
  throwIfProcessStopped,
  unregisterProcessController,
  waitForProcessResume,
} from './processCancellation';
import type { AppToastAction } from '../components/ui/toast';

/**
 * Reporter handed to long-running operations so they can push progress updates
 * without depending on the store directly. Keeps the media/service layers
 * decoupled from the UI state container.
 */
export interface ProcessReporter {
  /** Aborted when the user requests that this process stop. */
  signal: AbortSignal;
  /** Throws when Stop has been requested. Call between atomic units of work. */
  throwIfStopped: () => void;
  /** Waits for the user to resume this process, then checks for cancellation. */
  waitIfPaused: () => Promise<void>;
  /** Checked again when queued work starts, so pausing does not occupy the queue. */
  readonly paused: boolean;
  /** Patch the title/message/progress of the underlying process. */
  update: (patch: ProcessPatch) => void;
  /** Convenience for count-based progress; sets progress to `current / total`. */
  setProgress: (current: number, total: number, unit?: string) => void;
  /** Switch the process back to an indeterminate (spinner) state. */
  setIndeterminate: (message?: string) => void;
}

export interface TrackProcessConfig<T> {
  kind: ProcessKind;
  title: string;
  message?: string;
  /** Initial progress (0..1). Omit for an indeterminate process. */
  progress?: number | null;
  /** Offer a Stop action. The work must observe the reporter's abort signal. */
  canStop?: boolean;
  /** Offer Pause/Resume. Work must call `waitIfPaused` between atomic units. */
  canPause?: boolean;
  /** Completion summary and success toast. Pass `false` to skip the toast. */
  successMessage?: string | ((result: T) => string) | false;
  /** Summary shown on failure. Defaults to the stringified error. */
  errorMessage?: string | ((error: unknown) => string);
  /**
   * Extracts non-fatal warnings from the result so the finished task can offer
   * a "View details" action listing them (see {@link AppProcess.warnings}).
   */
  getWarnings?: (result: T) => string[] | undefined;
  /** Actions attached to the successful result row. */
  getSuccessAction?: (result: T) => AppToastAction | undefined;
}

function _clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Runs `work` while surfacing its lifecycle through the footer process center.
 * Short notifications announce the start and outcome; live progress and recent
 * results remain available in the footer popover.
 *
 * The operation receives a {@link ProcessReporter} it can use to publish
 * fine-grained progress. Throwing inside `work` marks the process as failed and
 * re-throws so callers keep their existing error handling.
 */
export async function trackProcess<T>(
  config: TrackProcessConfig<T>,
  work: (reporter: ProcessReporter) => Promise<T>,
): Promise<T> {
  const store = useProcessStore.getState();
  const id = store.startProcess({
    kind: config.kind,
    title: config.title,
    message: config.message,
    progress: config.progress ?? null,
    canStop: config.canStop,
    canPause: config.canPause,
  });

  const controller = new AbortController();
  registerProcessController(id, controller, config.canPause);
  showProcessToast(id);

  const reporter: ProcessReporter = {
    signal: controller.signal,
    throwIfStopped: () => throwIfProcessStopped(controller.signal),
    waitIfPaused: () => waitForProcessResume(id, controller.signal),
    get paused() {
      return useProcessStore.getState().processes.find((process) => process.id === id)?.paused ?? false;
    },
    update: (patch) => {
      if (!controller.signal.aborted) {
        const progressWasUpdated =
          Object.hasOwn(patch, 'progress') &&
          !Object.hasOwn(patch, 'progressCurrent') &&
          !Object.hasOwn(patch, 'progressTotal');
        useProcessStore.getState().updateProcess(
          id,
          progressWasUpdated
            ? { ...patch, progressCurrent: undefined, progressTotal: undefined, progressUnit: undefined }
            : patch,
        );
      }
    },
    setProgress: (current, total, unit = 'items') => {
      if (!controller.signal.aborted) {
        useProcessStore.getState().updateProcess(id, {
          progress: total > 0 ? _clamp01(current / total) : null,
          progressCurrent: current,
          progressTotal: total,
          progressUnit: unit,
        });
      }
    },
    setIndeterminate: (message) => {
      if (!controller.signal.aborted) {
        useProcessStore.getState().updateProcess(id, {
          progress: null,
          progressCurrent: undefined,
          progressTotal: undefined,
          progressUnit: undefined,
          message,
        });
      }
    },
  };

  try {
    const result = await work(reporter);
    throwIfProcessStopped(controller.signal);

    const successMessage =
      typeof config.successMessage === 'function' ? config.successMessage(result) : config.successMessage;

    const warnings = config.getWarnings?.(result);
    const action = config.getSuccessAction?.(result);
    let actionConsumed = false;
    const successAction: AppToastAction | undefined = action && {
      label: action.label,
      onClick: () => {
        if (actionConsumed) return;
        actionConsumed = true;
        useProcessStore.getState().updateProcess(id, { successAction: undefined });
        dismissProcessResultToast(id);
        action.onClick();
      },
    };

    useProcessStore.getState().finishProcess(id, {
      status: 'success',
      message: successMessage || `${config.title} completed`,
      warnings: warnings && warnings.length > 0 ? warnings : undefined,
      successAction,
    });

    showProcessResultToast(id, config.successMessage !== false);

    return result;
  } catch (error) {
    if (controller.signal.aborted || isProcessStopped(error)) {
      useProcessStore.getState().finishProcess(id, {
        status: 'stopped',
        message: 'Stopped',
      });
      showProcessResultToast(id);
      throw error instanceof ProcessStoppedError ? error : new ProcessStoppedError();
    }

    const errorMessage =
      typeof config.errorMessage === 'function'
        ? config.errorMessage(error)
        : (config.errorMessage ?? String(error));

    useProcessStore.getState().finishProcess(id, {
      status: 'error',
      message: errorMessage,
      error: errorMessage,
    });

    showProcessResultToast(id);
    throw error;
  } finally {
    unregisterProcessController(id);
  }
}
