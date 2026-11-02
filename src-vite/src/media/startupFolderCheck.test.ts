import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: true,
  sync: vi.fn(),
  index: vi.fn(),
  track: vi.fn(),
  markSynced: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({ exists: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast: { warning: vi.fn() } }));
vi.mock('@/db/api/services/albums.service', () => ({ AlbumsService: { getAll: async () => [] } }));
vi.mock('@/db/api/services/appData.service', () => ({
  AppDataService: { markLastSynced: mocks.markSynced },
}));
vi.mock('@/db/api/services/assetIndexer.service', () => ({ syncFilesAndDirsOf: mocks.sync }));
vi.mock('@/media/smartSearch/indexing', () => ({ startBackgroundIndexing: mocks.index }));
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ checkFoldersAtStartup: mocks.enabled }) },
}));
vi.mock('@/system/processTracker', () => ({ trackProcess: mocks.track }));
vi.mock('@/system/syncFeedback', () => ({ notifySyncResult: vi.fn() }));
vi.mock('@/utils/taskQueue/taskQueue', () => ({ appTaskQueue: { add: (work: () => unknown) => work() } }));

describe('startup folder check indexing handoff', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.sync.mockResolvedValue({ addedCount: 0, removedCount: 0, renamedCount: 0, unsupportedNewCount: 0 });
    mocks.track.mockImplementation(async (_config, work) =>
      work({
        throwIfStopped: vi.fn(),
        signal: new AbortController().signal,
      }),
    );
  });

  it('suppresses import-triggered indexing and uses the startup policy after the check', async () => {
    const { startStartupFolderCheck } = await import('./startupFolderCheck');
    expect(startStartupFolderCheck()).toBe(true);
    await vi.waitFor(() => expect(mocks.index).toHaveBeenCalledWith({ startup: true }));
    expect(mocks.sync).toHaveBeenCalledWith(
      expect.objectContaining({ presenceOnly: true, startSearch: false }),
    );
  });

  it('uses the same startup policy after a failed folder check', async () => {
    mocks.sync.mockRejectedValueOnce(new Error('Offline'));
    const { startStartupFolderCheck } = await import('./startupFolderCheck');
    startStartupFolderCheck();
    await vi.waitFor(() => expect(mocks.index).toHaveBeenCalledWith({ startup: true }));
  });

  it('does not run when folder checking is disabled', async () => {
    mocks.enabled = false;
    const { startStartupFolderCheck } = await import('./startupFolderCheck');
    expect(startStartupFolderCheck()).toBe(false);
    expect(mocks.track).not.toHaveBeenCalled();
  });
});
