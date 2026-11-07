import { useProcessStore } from '../stores/processStore';

const controllers = new Map<string, AbortController>();
const pausableProcesses = new Set<string>();
const pausedProcesses = new Set<string>();
const resumeWaiters = new Map<string, Set<() => void>>();

function _wakePausedProcess(id: string): void {
  const waiters = resumeWaiters.get(id);
  resumeWaiters.delete(id);
  waiters?.forEach((resume) => resume());
}

export class ProcessStoppedError extends Error {
  constructor() {
    super('Process stopped');
    this.name = 'ProcessStoppedError';
  }
}

export function registerProcessController(id: string, controller: AbortController, canPause = false): void {
  controllers.set(id, controller);
  if (canPause) pausableProcesses.add(id);
}

export function unregisterProcessController(id: string): void {
  controllers.delete(id);
  pausableProcesses.delete(id);
  pausedProcesses.delete(id);
  _wakePausedProcess(id);
}

export function stopProcess(id: string): void {
  controllers.get(id)?.abort();
}

export function pauseProcess(id: string): void {
  if (!controllers.has(id) || !pausableProcesses.has(id)) return;
  pausedProcesses.add(id);
  useProcessStore.getState().updateProcess(id, { paused: true });
}

export function resumeProcess(id: string): void {
  if (!pausedProcesses.delete(id)) return;
  useProcessStore.getState().updateProcess(id, { paused: false });
  _wakePausedProcess(id);
}

export async function waitForProcessResume(id: string, signal: AbortSignal): Promise<void> {
  if (!pausedProcesses.has(id)) {
    throwIfProcessStopped(signal);
    return;
  }

  await new Promise<void>((resolve) => {
    const finish = () => {
      signal.removeEventListener('abort', finish);
      const waiters = resumeWaiters.get(id);
      waiters?.delete(finish);
      if (waiters?.size === 0) resumeWaiters.delete(id);
      resolve();
    };
    const waiters = resumeWaiters.get(id) ?? new Set();
    waiters.add(finish);
    resumeWaiters.set(id, waiters);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted || !pausedProcesses.has(id)) finish();
  });
  throwIfProcessStopped(signal);
}

export function throwIfProcessStopped(signal: AbortSignal): void {
  if (signal.aborted) throw new ProcessStoppedError();
}

export function isProcessStopped(error: unknown): boolean {
  return error instanceof ProcessStoppedError;
}
