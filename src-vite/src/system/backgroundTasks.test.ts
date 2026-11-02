import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emitTo: vi.fn(),
  listen: vi.fn(),
  index: vi.fn(),
  observe: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({ emitTo: mocks.emitTo, listen: mocks.listen }));
vi.mock('@/components/ui/toast', () => ({ toast: { error: mocks.error } }));
vi.mock('@/media/smartSearch/indexing', () => ({ startBackgroundIndexing: mocks.index }));
vi.mock('@/media/smartSearch/lifecycle', () => ({ observeSmartSearchChanges: mocks.observe }));

import { initBackgroundTasks, requestBackgroundTask } from './backgroundTasks';

describe('main-window background tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listen.mockResolvedValue(vi.fn());
    mocks.observe.mockResolvedValue(vi.fn());
  });

  it('sends requests to the main window without running work in the caller', async () => {
    await requestBackgroundTask('reindex-smart-search');
    expect(mocks.emitTo).toHaveBeenCalledWith('main', 'app://background-task', 'reindex-smart-search');
    expect(mocks.index).not.toHaveBeenCalled();
  });

  it('dispatches known tasks and ignores unknown requests', async () => {
    initBackgroundTasks();
    const handler = mocks.listen.mock.calls[0][1];
    handler({ payload: 'reindex-smart-search' });
    handler({ payload: 'unknown-task' });
    await vi.waitFor(() => expect(mocks.index).toHaveBeenCalledOnce());
    expect(mocks.index).toHaveBeenCalledWith({ rebuild: true });
    expect(mocks.observe).toHaveBeenCalledOnce();
  });

  it('reports dispatch failures', async () => {
    mocks.index.mockImplementationOnce(() => {
      throw new Error('Unavailable');
    });
    initBackgroundTasks();
    mocks.listen.mock.calls[0][1]({ payload: 'reindex-smart-search' });
    await vi.waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith('Could not start background task: Error: Unavailable'),
    );
  });
});
