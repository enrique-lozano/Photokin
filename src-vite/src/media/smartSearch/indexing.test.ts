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
  queue: vi.fn(),
  getFiles: vi.fn(),
  embed: vi.fn(),
  shutdown: vi.fn(),
  paused: false,
  waitIfPaused: vi.fn(),
}));

vi.mock('@/common/supportedFormats', () => ({
  getFileExtensionFromPath: vi.fn(),
  SupportedImageFormats: {},
}));
vi.mock('@/db/api/services/appData.service', () => ({
  AppDataKey: { SmartSearchModel: 'model' },
  AppDataService: { get: mocks.getModel, set: mocks.setModel },
}));
vi.mock('@/db/api/services/assets.service', () => ({ AssetsService: { getFiles: mocks.getFiles } }));
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
vi.mock('@/utils/taskQueue/taskQueue', () => ({ appTaskQueue: { add: mocks.queue } }));
vi.mock('./clipSidecar', () => ({
  ClipImageSession: vi.fn(() => ({ embedImages: mocks.embed, shutdown: mocks.shutdown })),
}));
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
    mocks.queue.mockImplementation((work: () => Promise<unknown>) => work());
    mocks.paused = false;
    mocks.waitIfPaused.mockResolvedValue(undefined);
    mocks.getFiles.mockResolvedValue([]);
    mocks.shutdown.mockResolvedValue(undefined);
    mocks.track.mockImplementation(async (_config, work) =>
      work({
        throwIfStopped: vi.fn(),
        waitIfPaused: mocks.waitIfPaused,
        get paused() {
          return mocks.paused;
        },
        update: vi.fn(),
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

  it('rechecks pause after a batch reaches the queue without holding the queue while paused', async () => {
    const { TaskQueue } = await vi.importActual<typeof import('@/utils/taskQueue/taskQueue')>(
      '@/utils/taskQueue/taskQueue',
    );
    const queue = new TaskQueue({ concurrency: 1 });
    let resume = () => {};
    const resumed = new Promise<void>((resolve) => {
      resume = resolve;
    });
    mocks.query.mockResolvedValue([{ id: 'photo' }]);
    mocks.waitIfPaused.mockImplementation(async () => {
      if (mocks.paused) await resumed;
    });
    // The setup runs first. Pause the next batch after it was enqueued.
    mocks.queue
      .mockImplementation((work: () => Promise<unknown>) => queue.add(work))
      .mockImplementationOnce((work: () => Promise<unknown>) => queue.add(work))
      .mockImplementationOnce((work: () => Promise<unknown>) => {
        void queue.add(async () => {
          mocks.paused = true;
        });
        return queue.add(work);
      });

    const { startBackgroundIndexing } = await import('./indexing');
    startBackgroundIndexing();

    await vi.waitFor(() => expect(mocks.waitIfPaused).toHaveBeenCalledTimes(4));
    expect(mocks.getFiles).not.toHaveBeenCalled();
    expect(mocks.queue).toHaveBeenCalledTimes(2);
    expect(queue.running).toBe(0);

    // Unrelated work can still run through the shared queue.
    const otherWork = vi.fn().mockResolvedValue('done');
    await queue.add(otherWork);
    expect(otherWork).toHaveBeenCalledOnce();

    mocks.paused = false;
    resume();
    await vi.waitFor(() => expect(mocks.shutdown).toHaveBeenCalledOnce());
    expect(mocks.getFiles).toHaveBeenCalledTimes(1);
    expect(mocks.getFiles).toHaveBeenCalledWith({ assetIds: ['photo'] });
  });
});
