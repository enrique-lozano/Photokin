const controllers = new Map<string, AbortController>();

export class ProcessStoppedError extends Error {
  constructor() {
    super('Process stopped');
    this.name = 'ProcessStoppedError';
  }
}

export function registerProcessController(id: string, controller: AbortController): void {
  controllers.set(id, controller);
}

export function unregisterProcessController(id: string): void {
  controllers.delete(id);
}

export function stopProcess(id: string): void {
  controllers.get(id)?.abort();
}

export function throwIfProcessStopped(signal: AbortSignal): void {
  if (signal.aborted) throw new ProcessStoppedError();
}

export function isProcessStopped(error: unknown): boolean {
  return error instanceof ProcessStoppedError;
}
