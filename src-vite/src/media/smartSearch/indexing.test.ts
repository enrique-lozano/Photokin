import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: { activeModel: 'model', indexMissingAtStartup: true },
  clear: vi.fn(),
  getModel: vi.fn(),
  setModel: vi.fn(),
  downloaded: vi.fn(),
  importing: vi.fn(),
  track: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@/common/supportedFormats', () => ({
  getFileExtensionFromPath: vi.fn(),
  SupportedImageFormats: {},
}));
vi.mock('@/db/api/services/appData.service', () => ({
  AppDataKey: { SmartSearchModel: 'model' },
  AppDataService: { get: mocks.getModel, set: mocks.setModel },
}));
vi.mock('@/db/api/services/assets.service', () => ({ AssetsService: {} }));
vi.mock('@/db/connection/db.service', () => ({ selectFromDB: mocks.query }));
vi.mock('@/db/connection/kysely', () => ({
  kyselyDB: {
    selectFrom: () => ({
      leftJoin() {
        return this;
      },
      where() {
        return this;
      },
      select() {
        return this;
      },
    }),
  },
}));
vi.mock('@/media/import/importActivity', () => ({ isImportWorkActive: mocks.importing }));
vi.mock('@/media/thumbnails/thumbnail', () => ({
  getExistingThumbnailPath: vi.fn(),
  resolveThumbnailPath: vi.fn(),
}));
vi.mock('@/stores/smartSearchSettingsStore', () => ({
  useSmartSearchSettingsStore: { getState: () => mocks.settings },
}));
vi.mock('@/system/devLogger', () => ({ debugLog: vi.fn() }));
vi.mock('@/system/hardware', () => ({ HARDWARE_CONCURRENCY: 4 }));
vi.mock('@/system/processTracker', () => ({ trackProcess: mocks.track }));
vi.mock('@/utils/taskQueue/taskQueue', () => ({ appTaskQueue: { add: (work: () => unknown) => work() } }));
vi.mock('./clipSidecar', () => ({ ClipImageSession: vi.fn() }));
vi.mock('./embeddingStore', () => ({ clearAssetEmbeddings: mocks.clear, storeAssetEmbeddings: vi.fn() }));
vi.mock('./models', () => ({ isModelDownloaded: mocks.downloaded }));

describe('search indexing requests', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.settings.indexMissingAtStartup = true;
    mocks.importing.mockReturnValue(false);
    mocks.downloaded.mockResolvedValue(true);
    mocks.getModel.mockResolvedValue('model');
    mocks.query.mockResolvedValue([]);
    mocks.track.mockImplementation(async (_config, work) =>
      work({
        throwIfStopped: vi.fn(),
        signal: new AbortController().signal,
      }),
    );
  });

  it('skips startup work when disabled but allows an explicit rebuild', async () => {
    const { startBackgroundIndexing } = await import('./indexing');
    mocks.settings.indexMissingAtStartup = false;
    startBackgroundIndexing({ startup: true });
    expect(mocks.track).not.toHaveBeenCalled();
    startBackgroundIndexing({ rebuild: true });
    await vi.waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce());
  });

  it('keeps existing embeddings for normal backlog indexing', async () => {
    const { startBackgroundIndexing } = await import('./indexing');
    startBackgroundIndexing({ startup: true });
    await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledOnce());
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('does not erase the index if the model is unavailable', async () => {
    const { startBackgroundIndexing } = await import('./indexing');
    mocks.downloaded.mockResolvedValue(false);
    startBackgroundIndexing({ rebuild: true });
    await vi.waitFor(() => expect(mocks.downloaded).toHaveBeenCalledOnce());
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('retains a rebuild request deferred by an import', async () => {
    const { startBackgroundIndexing } = await import('./indexing');
    mocks.importing.mockReturnValue(true);
    startBackgroundIndexing({ rebuild: true });
    expect(mocks.track).not.toHaveBeenCalled();
    mocks.importing.mockReturnValue(false);
    startBackgroundIndexing();
    await vi.waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce());
  });

  it('queues a rebuild after an active run instead of clearing its index mid-run', async () => {
    let finishQuery: ((rows: []) => void) | undefined;
    mocks.query.mockImplementationOnce(
      () =>
        new Promise<[]>((resolve) => {
          finishQuery = resolve;
        }),
    );
    const { startBackgroundIndexing } = await import('./indexing');
    startBackgroundIndexing();
    await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledOnce());
    startBackgroundIndexing({ rebuild: true });
    expect(mocks.clear).not.toHaveBeenCalled();
    finishQuery?.([]);
    await vi.waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce());
    expect(mocks.track).toHaveBeenCalledTimes(2);
  });
});
