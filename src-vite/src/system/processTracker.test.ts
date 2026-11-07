import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessKind, useProcessStore } from '@/stores/processStore';
import { pauseProcess, ProcessStoppedError, resumeProcess, stopProcess } from './processCancellation';
import { trackProcess } from './processTracker';
import { toast } from '@/components/ui/toast';
import { useProcessWarningsDialog } from '@/components/process-center/ProcessWarningsDialog';

vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

describe('trackProcess lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProcessStore.setState({ processes: [] });
    useProcessWarningsDialog.getState().close();
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
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenLastCalledWith('Long task stopped', expect.any(Object));
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

    const process = useProcessStore.getState().processes[0];
    expect(process.status).toBe('success');
    expect(process.successAction?.label).toBe('Undo');
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Edit metadata completed', {
      id: `process-result-${process.id}`,
      action: process.successAction,
      duration: 10_000,
    });

    const toastAction = vi.mocked(toast.success).mock.calls[0][1]?.action;
    toastAction?.onClick();
    process.successAction?.onClick();
    expect(action.onClick).toHaveBeenCalledTimes(1);
    expect(useProcessStore.getState().processes[0].successAction).toBeUndefined();
    expect(toast.dismiss).toHaveBeenCalledWith(`process-result-${process.id}`);
  });

  it('announces completion with the result summary', async () => {
    await trackProcess(
      {
        kind: ProcessKind.Generic,
        title: 'Finding faces',
        successMessage: (count: number) => `Found ${count} faces`,
      },
      async () => 12,
    );

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(
      'Found 12 faces',
      expect.objectContaining({ action: undefined }),
    );
  });

  it('does not duplicate completion feedback when the caller opts out', async () => {
    await trackProcess(
      { kind: ProcessKind.Sync, title: 'Syncing library', successMessage: false },
      async () => undefined,
    );

    expect(toast.success).not.toHaveBeenCalled();
    expect(useProcessStore.getState().processes[0].status).toBe('success');
  });

  it('does not announce success when work fails', async () => {
    await expect(
      trackProcess({ kind: ProcessKind.Generic, title: 'Finding faces' }, async () => {
        throw new Error('Scan failed');
      }),
    ).rejects.toThrow('Scan failed');

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Error: Scan failed', expect.any(Object));
    expect(useProcessStore.getState().processes[0].status).toBe('error');
  });

  it('shows a custom failure notification even when success feedback is disabled', async () => {
    await expect(
      trackProcess(
        {
          kind: ProcessKind.Sync,
          title: 'Syncing library',
          successMessage: false,
          errorMessage: (error) => `Sync failed: ${String(error)}`,
        },
        async () => {
          throw new Error('Disk unavailable');
        },
      ),
    ).rejects.toThrow('Disk unavailable');

    expect(toast.error).toHaveBeenCalledWith('Sync failed: Error: Disk unavailable', expect.any(Object));
  });

  it('announces partial failures as warnings and keeps their details inspectable', async () => {
    const warnings = ['One photo could not be read'];
    await trackProcess(
      {
        kind: ProcessKind.FaceDetect,
        title: 'Finding faces',
        getWarnings: () => warnings,
        successMessage: 'Face scan finished',
      },
      async () => undefined,
    );

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(
      'Face scan finished',
      expect.objectContaining({ description: '1 item could not be processed.', duration: 10_000 }),
    );
    const action = vi.mocked(toast.warning).mock.calls[0][1]?.action;
    useProcessStore.setState({ processes: [] });
    action?.onClick();
    expect(useProcessWarningsDialog.getState()).toMatchObject({ title: 'Finding faces', warnings });
  });

  it('does not suppress warnings when ordinary success feedback is disabled', async () => {
    await trackProcess(
      {
        kind: ProcessKind.Import,
        title: 'Importing',
        successMessage: false,
        getWarnings: () => ['Unreadable file'],
      },
      async () => undefined,
    );
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('keeps progress updates out of toasts and dismisses the start notice on completion', async () => {
    await trackProcess(
      { kind: ProcessKind.Generic, title: 'Scanning' },
      async (reporter) => {
        reporter.setProgress(1, 4);
        reporter.setProgress(2, 4);
        expect(toast.info).toHaveBeenCalledTimes(1);
        expect(toast.success).not.toHaveBeenCalled();
      },
    );
    const process = useProcessStore.getState().processes[0];
    expect(toast.info).toHaveBeenCalledWith('Scanning', { id: process.id, duration: 4_000 });
    expect(toast.dismiss).toHaveBeenCalledWith(process.id);
  });

  it('pauses and resumes work at its cooperative checkpoint', async () => {
    let completed = false;
    let startWork = () => {};
    const workGate = new Promise<void>((resolve) => {
      startWork = resolve;
    });
    const promise = trackProcess(
      { kind: ProcessKind.Generic, title: 'Indexing', canPause: true, canStop: true },
      async (reporter) => {
        await workGate;
        await Promise.all([reporter.waitIfPaused(), reporter.waitIfPaused()]);
        completed = true;
      },
    );
    const [process] = useProcessStore.getState().processes;

    pauseProcess(process.id);
    startWork();
    await Promise.resolve();
    expect(useProcessStore.getState().processes[0].paused).toBe(true);
    expect(completed).toBe(false);

    resumeProcess(process.id);
    await promise;
    expect(completed).toBe(true);
    expect(useProcessStore.getState().processes[0]).toMatchObject({
      status: 'success',
      paused: false,
    });
  });

  it('cancels work while it is paused', async () => {
    let startWork = () => {};
    const workGate = new Promise<void>((resolve) => {
      startWork = resolve;
    });
    const promise = trackProcess(
      { kind: ProcessKind.Generic, title: 'Indexing', canPause: true, canStop: true },
      async (reporter) => {
        await workGate;
        await reporter.waitIfPaused();
      },
    );
    const [process] = useProcessStore.getState().processes;
    pauseProcess(process.id);
    startWork();
    stopProcess(process.id);

    await expect(promise).rejects.toBeInstanceOf(ProcessStoppedError);
    expect(useProcessStore.getState().processes[0]).toMatchObject({
      status: 'stopped',
      paused: false,
    });
  });

  it('records count progress with its unit', async () => {
    await trackProcess(
      { kind: ProcessKind.Generic, title: 'Scanning' },
      async (reporter) => {
        reporter.setProgress(3, 10, 'photos');
      },
    );

    expect(useProcessStore.getState().processes[0]).toMatchObject({
      progress: 1,
      progressCurrent: 10,
      progressTotal: 10,
      progressUnit: 'photos',
    });
  });

  it('keeps active tasks and only the ten most recent finished results', () => {
    const store = useProcessStore.getState();
    const ids: string[] = [];

    for (let index = 0; index < 12; index += 1) {
      const id = store.startProcess({ kind: ProcessKind.Generic, title: `Task ${index}` });
      store.finishProcess(id, { status: 'success' });
      ids.push(id);
    }

    const activeId = store.startProcess({ kind: ProcessKind.Generic, title: 'Active task' });
    const processes = useProcessStore.getState().processes;

    expect(processes).toHaveLength(11);
    expect(processes.some((process) => process.id === ids[0])).toBe(false);
    expect(processes.some((process) => process.id === ids[1])).toBe(false);
    expect(processes.some((process) => process.id === activeId && process.status === 'running')).toBe(true);
  });

  it('clears finished notifications without removing running or paused work', () => {
    const store = useProcessStore.getState();
    const runningId = store.startProcess({ kind: ProcessKind.Import, title: 'Importing' });
    const pausedId = store.startProcess({ kind: ProcessKind.Generic, title: 'Indexing' });
    store.updateProcess(pausedId, { paused: true });
    for (const status of ['success', 'error', 'stopped'] as const) {
      const id = store.startProcess({ kind: ProcessKind.Generic, title: status });
      store.finishProcess(id, { status });
    }

    store.clearFinishedProcesses();

    expect(useProcessStore.getState().processes.map((process) => process.id)).toEqual([
      runningId,
      pausedId,
    ]);
    expect(useProcessStore.getState().processes[1].paused).toBe(true);
  });
});
