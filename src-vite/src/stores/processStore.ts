import { create } from 'zustand';
import type { AppToastAction } from '../components/ui/toast';
import { generateID } from '../db/models/dbEntityWithID';

export type ProcessStatus = 'running' | 'success' | 'error' | 'stopped';

const RECENT_PROCESS_LIMIT = 10;

/**
 * Categories of long-running work tracked by the process center. They map to a
 * dedicated icon/accent so the user can tell at a glance what is going on.
 */
export enum ProcessKind {
  /** Adding new folders to the library. */
  Import = 'import',
  /** Finding new faces in photos (Detect, or Find faces = detect then recognize). */
  FaceDetect = 'face-detect',
  /** Suggesting named people for faces already detected. */
  FaceRecognize = 'face-recognize',
  /** Re-reading the library folders for added, changed or removed files. */
  Sync = 'sync',
  /** Any other task; shown with a neutral spinner. */
  Generic = 'generic',
}

export interface AppProcess {
  id: string;
  kind: ProcessKind;
  /** Short headline, e.g. "Importing photos". */
  title: string;
  /** Current step detail, e.g. "Reading metadata · 42%". */
  message?: string;
  /** Progress in the 0..1 range, or `null` when the work is indeterminate. */
  progress: number | null;
  progressCurrent?: number;
  progressTotal?: number;
  progressUnit?: string;
  status: ProcessStatus;
  paused: boolean;
  canPause: boolean;
  /** Whether this process offers a user-initiated Stop action. */
  canStop: boolean;
  /** True after Stop is requested while cooperative cleanup is still running. */
  stopping: boolean;
  /** Populated when {@link status} is `error`. */
  error?: string;
  /**
   * Non-fatal issues collected while the work ran (e.g. files that couldn't be
   * read). Surfaced through a "View skipped items" action on the finished row.
   */
  warnings?: string[];
  /** Reversible/inspectable actions attached after successful completion. */
  successAction?: AppToastAction;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
}

export interface StartProcessInput {
  id?: string;
  kind: ProcessKind;
  title: string;
  message?: string;
  progress?: number | null;
  canStop?: boolean;
  canPause?: boolean;
}

export type ProcessPatch = Partial<
  Pick<
    AppProcess,
    | 'title'
    | 'message'
    | 'progress'
    | 'progressCurrent'
    | 'progressTotal'
    | 'progressUnit'
    | 'paused'
    | 'stopping'
    | 'successAction'
  >
>;

export interface FinishProcessInput {
  status: Exclude<ProcessStatus, 'running'>;
  message?: string;
  error?: string;
  warnings?: string[];
  successAction?: AppToastAction;
}

interface ProcessStoreState {
  processes: AppProcess[];

  startProcess: (input: StartProcessInput) => string;
  updateProcess: (id: string, patch: ProcessPatch) => void;
  finishProcess: (id: string, result: FinishProcessInput) => void;
  removeProcess: (id: string) => void;
  clearFinishedProcesses: () => void;
}

function _retainRecentProcesses(processes: AppProcess[]): AppProcess[] {
  const active = processes.filter((process) => process.status === 'running');
  const recent = processes.filter((process) => process.status !== 'running').slice(0, RECENT_PROCESS_LIMIT);
  return [...active, ...recent];
}

export const useProcessStore = create<ProcessStoreState>()((set) => ({
  processes: [],

  startProcess: (input) => {
    const id = input.id ?? generateID();
    const now = Date.now();

    set((state) => ({
      processes: _retainRecentProcesses([
        ...state.processes.filter((process) => process.id !== id),
        {
          id,
          kind: input.kind,
          title: input.title,
          message: input.message,
          progress: input.progress ?? null,
          status: 'running',
          paused: false,
          canStop: input.canStop ?? false,
          canPause: input.canPause ?? false,
          stopping: false,
          startedAt: now,
          updatedAt: now,
        },
      ]),
    }));

    return id;
  },

  updateProcess: (id, patch) =>
    set((state) => ({
      processes: state.processes.map((process) =>
        process.id === id ? { ...process, ...patch, updatedAt: Date.now() } : process,
      ),
    })),

  finishProcess: (id, result) =>
    set((state) => {
      const updated = state.processes.map((process) =>
        process.id === id
          ? {
              ...process,
              status: result.status,
              paused: false,
              message: result.message ?? process.message,
              error: result.error,
              warnings: result.warnings ?? process.warnings,
              successAction: result.successAction,
              progress: result.status === 'success' ? 1 : process.progress,
              progressCurrent:
                result.status === 'success' && process.progressTotal !== undefined
                  ? process.progressTotal
                  : process.progressCurrent,
              stopping: false,
              updatedAt: Date.now(),
              finishedAt: Date.now(),
            }
          : process,
      );
      const finished = updated.find((process) => process.id === id);
      return {
        processes: _retainRecentProcesses(
          finished ? [finished, ...updated.filter((process) => process.id !== id)] : updated,
        ),
      };
    }),

  removeProcess: (id) =>
    set((state) => ({
      processes: state.processes.filter((process) => process.id !== id),
    })),

  clearFinishedProcesses: () =>
    set((state) => ({
      processes: selectActiveProcesses(state.processes),
    })),
}));

export function selectActiveProcesses(processes: AppProcess[]): AppProcess[] {
  return processes.filter((process) => process.status === 'running');
}
