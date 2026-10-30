import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYNC_LIBRARY_STATUS_EVENT,
  SYNC_LIBRARY_STATUS_REQUEST_EVENT,
  useLibrarySync,
} from './useLibrarySync';

const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  listeners: new Map<string, () => void>(),
  setIsSyncing: vi.fn(),
  trackProcess: vi.fn(),
  markLastSynced: vi.fn(),
  notifySyncResult: vi.fn(),
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react', () => ({
  useState: () => [false, mocks.setIsSyncing],
  useRef: (current: unknown) => ({ current }),
  useEffectEvent: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => mocks.effects.push(effect),
}));
vi.mock('@tauri-apps/api/event', () => ({
  emit: mocks.emit,
  listen: vi.fn(async (event: string, handler: () => void) => {
    mocks.listeners.set(event, handler);
    return () => mocks.listeners.delete(event);
  }),
}));
vi.mock('../../db/api/services/albums.service', () => ({ AlbumsService: {} }));
vi.mock('../../db/api/services/appData.service', () => ({
  AppDataService: { markLastSynced: mocks.markLastSynced },
}));
vi.mock('../../db/api/services/assetIndexer.service', () => ({ syncFilesAndDirsOf: vi.fn() }));
vi.mock('../../system/processTracker', () => ({ trackProcess: mocks.trackProcess }));
vi.mock('../../system/syncFeedback', () => ({ notifySyncResult: mocks.notifySyncResult }));
vi.mock('../../utils/taskQueue/taskQueue', () => ({ appTaskQueue: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.effects = [];
  mocks.listeners.clear();
  mocks.markLastSynced.mockResolvedValue(undefined);
});

describe('library sync status across windows', () => {
  it('answers status requests and prevents duplicate requests while running', async () => {
    let complete!: (value: object) => void;
    mocks.trackProcess.mockReturnValue(new Promise((resolve) => (complete = resolve)));
    const { sync } = useLibrarySync();
    const cleanups = mocks.effects.map((effect) => effect());
    await Promise.resolve();
    expect(mocks.emit).toHaveBeenCalledWith(SYNC_LIBRARY_STATUS_EVENT, false);

    sync();
    sync();
    expect(mocks.trackProcess).toHaveBeenCalledTimes(1);
    mocks.listeners.get(SYNC_LIBRARY_STATUS_REQUEST_EVENT)?.();
    expect(mocks.emit).toHaveBeenLastCalledWith(SYNC_LIBRARY_STATUS_EVENT, true);

    complete({});
    await vi.waitFor(() => expect(mocks.setIsSyncing).toHaveBeenLastCalledWith(false));
    mocks.listeners.get(SYNC_LIBRARY_STATUS_REQUEST_EVENT)?.();
    expect(mocks.emit).toHaveBeenLastCalledWith(SYNC_LIBRARY_STATUS_EVENT, false);
    expect(mocks.markLastSynced).toHaveBeenCalledOnce();
    cleanups.forEach((cleanup) => cleanup?.());
  });

  it('does not report idle until the successful sync time has been saved', async () => {
    let save!: () => void;
    mocks.markLastSynced.mockReturnValue(new Promise<void>((resolve) => (save = resolve)));
    mocks.trackProcess.mockResolvedValue({});
    useLibrarySync().sync();
    await vi.waitFor(() => expect(mocks.markLastSynced).toHaveBeenCalledOnce());
    expect(mocks.setIsSyncing).not.toHaveBeenCalledWith(false);
    save();
    await vi.waitFor(() => expect(mocks.setIsSyncing).toHaveBeenLastCalledWith(false));
  });

  it('clears the busy state without overwriting the last sync time on failure or cancellation', async () => {
    mocks.trackProcess.mockRejectedValue(new Error('Sync stopped'));
    useLibrarySync().sync();
    await vi.waitFor(() => expect(mocks.setIsSyncing).toHaveBeenLastCalledWith(false));
    expect(mocks.markLastSynced).not.toHaveBeenCalled();
  });
});
