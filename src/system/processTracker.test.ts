import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessKind, useProcessStore } from '@/stores/processStore';
import { ProcessStoppedError, stopProcess } from './processCancellation';
import { trackProcess } from './processTracker';

vi.mock('@/components/process-center/processToasts', () => ({
  dismissProcessToast: vi.fn(),
  showProcessToast: vi.fn(),
  syncProcessToast: vi.fn(),
}));

describe('trackProcess cancellation', () => {
  beforeEach(() => {
    useProcessStore.setState({ processes: [] });
  });

  it('aborts cancellable work and records a stopped result', async () => {
    const promise = trackProcess(
      { kind: ProcessKind.Generic, title: 'Long task', canStop: true },
      async (reporter) => {
        await new Promise<void>((resolve) => reporter.signal.addEventListener('abort', () => resolve()));
        reporter.throwIfStopped();
      },
    );
    const [process] = useProcessStore.getState().processes;

    expect(process.canStop).toBe(true);
    stopProcess(process.id);

    await expect(promise).rejects.toBeInstanceOf(ProcessStoppedError);
    expect(useProcessStore.getState().processes[0]).toMatchObject({
      status: 'stopped',
      message: 'Stopped',
      stopping: false,
    });
  });

  it('attaches result actions to a successful process', async () => {
    const action = { label: 'Undo', onClick: vi.fn() };
    await trackProcess(
      {
        kind: ProcessKind.Generic,
        title: 'Edit metadata',
        getSuccessAction: () => action,
      },
      async () => ({ changed: 1 }),
    );

    expect(useProcessStore.getState().processes[0]).toMatchObject({
      status: 'success',
      successAction: action,
    });
  });
});
