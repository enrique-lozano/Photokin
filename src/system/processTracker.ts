import {
  dismissProcessToast,
  showProcessToast,
  syncProcessToast,
} from '../components/process-center/processToasts';
import { ProcessKind, ProcessPatch, useProcessStore } from '../stores/processStore';
import {
  isProcessStopped,
  ProcessStoppedError,
  registerProcessController,
  throwIfProcessStopped,
  unregisterProcessController,
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
  /** Patch the title/message/progress of the underlying process. */
  update: (patch: ProcessPatch) => void;
  /** Convenience for count-based progress; sets progress to `current / total`. */
  setProgress: (current: number, total: number) => void;
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
  /** Close the success toast sooner: the result is easy to reverse in place. */
  briefSuccess?: boolean;
  /** Toast shown on success. Pass `false` to stay silent. */
  successMessage?: string | ((result: T) => string) | false;
  /** Toast shown on failure. Defaults to the stringified error. */
  errorMessage?: string | ((error: unknown) => string);
  /**
   * Extracts non-fatal warnings from the result so the finished toast can offer
   * a "View details" action listing them (see {@link AppProcess.warnings}).
   */
  getWarnings?: (result: T) => string[] | undefined;
  /** Actions attached to the successful result toast. */
  getSuccessAction?: (result: T) => AppToastAction | undefined;
}

function _clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Runs `work` while surfacing its lifecycle through the global process center
 * (a live notification in the bottom-right + the footer indicator). When the
 * work finishes, the running notification morphs into a success/error toast.
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
    briefSuccess: config.briefSuccess,
  });

  const controller = new AbortController();
  registerProcessController(id, controller);
  showProcessToast(id);

  const reporter: ProcessReporter = {
    signal: controller.signal,
    throwIfStopped: () => throwIfProcessStopped(controller.signal),
    update: (patch) => {
      if (!controller.signal.aborted) useProcessStore.getState().updateProcess(id, patch);
    },
    setProgress: (current, total) => {
      if (!controller.signal.aborted) {
        useProcessStore.getState().updateProcess(id, {
          progress: total > 0 ? _clamp01(current / total) : null,
        });
      }
    },
    setIndeterminate: (message) => {
      if (!controller.signal.aborted) {
        useProcessStore.getState().updateProcess(id, { progress: null, message });
      }
    },
  };

  try {
    const result = await work(reporter);
    throwIfProcessStopped(controller.signal);

    const successMessage =
      typeof config.successMessage === 'function' ? config.successMessage(result) : config.successMessage;

    const warnings = config.getWarnings?.(result);
    const successAction = config.getSuccessAction?.(result);

    useProcessStore.getState().finishProcess(id, {
      status: 'success',
      message: successMessage || `${config.title} completed`,
      warnings: warnings && warnings.length > 0 ? warnings : undefined,
      successAction,
    });

    if (config.successMessage === false) {
      // Caller opted out of a completion toast: clear it silently.
      dismissProcessToast(id);
    } else {
      syncProcessToast(id);
    }

    return result;
  } catch (error) {
    if (controller.signal.aborted || isProcessStopped(error)) {
      useProcessStore.getState().finishProcess(id, {
        status: 'stopped',
        message: 'Stopped',
      });
      syncProcessToast(id);
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

    syncProcessToast(id);
    throw error;
  } finally {
    unregisterProcessController(id);
  }
}
