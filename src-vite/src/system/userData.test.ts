import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabaseStorageSize, getSearchModelsStorageStats } from './userData';

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  entries: vi.fn(),
  scan: vi.fn(),
  isModelDownloaded: vi.fn(),
}));

vi.mock('@/db/connection/db.service', () => ({
  dbName: 'photokin.db',
  getDbDir: async () => 'C:\\app',
}));
vi.mock('@/db/connection/dbInstance', () => ({
  closeAppDB: vi.fn(),
  resumeAppDB: vi.fn(),
  suspendAppDB: vi.fn(),
}));
vi.mock('@/media/smartSearch/models', () => ({
  CLIP_MODELS: [{ id: 'complete' }, { id: 'partial' }],
  getModelsBasePath: async () => 'C:\\models',
  isModelDownloaded: mocks.isModelDownloaded,
}));
vi.mock('@/media/thumbnails/thumbnail', () => ({
  deleteAllThumbnails: vi.fn(),
  getThumbnailsBasePath: vi.fn(),
}));
vi.mock('@/pages/duplicates/duplicatesCache', () => ({ clearDuplicatesCache: vi.fn() }));
vi.mock('@/system/diskManager', () => ({
  tauriDirEntriesStat: mocks.entries,
  tauriScanImportPreview: mocks.scan,
}));
vi.mock('@tauri-apps/api/path', () => ({ join: async (...parts: string[]) => parts.join('\\') }));
vi.mock('@tauri-apps/plugin-fs', () => ({ exists: mocks.exists, remove: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openPath: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.exists.mockResolvedValue(true);
});

describe('settings storage sizes', () => {
  it('includes the database, WAL and shared memory without counting unrelated files', async () => {
    mocks.entries.mockResolvedValue([
      { name: 'photokin.db', isFile: true, size: 100 },
      { name: 'photokin.db-wal', isFile: true, size: 20 },
      { name: 'photokin.db-shm', isFile: true, size: 5 },
      { name: 'other.db', isFile: true, size: 900 },
      { name: 'thumbnails', isDir: true, size: 500 },
    ]);
    await expect(getDatabaseStorageSize()).resolves.toBe(125);
  });

  it('uses a native recursive size scan including partial downloads, counting only complete models', async () => {
    mocks.isModelDownloaded.mockImplementation(async (id: string) => id === 'complete');
    mocks.scan.mockResolvedValue({ supportedFilesSize: 200, unsupportedFilesSize: 30 });
    await expect(getSearchModelsStorageStats()).resolves.toEqual({ sizeBytes: 230, modelCount: 1 });
    expect(mocks.scan).toHaveBeenCalledWith(['C:\\models'], []);
  });

  it('reports zero when models have never been downloaded', async () => {
    mocks.exists.mockResolvedValue(false);
    await expect(getSearchModelsStorageStats()).resolves.toEqual({ sizeBytes: 0, modelCount: 0 });
    expect(mocks.entries).not.toHaveBeenCalled();
    expect(mocks.scan).not.toHaveBeenCalled();
  });

  it('does not disguise unreadable storage as empty', async () => {
    mocks.entries.mockRejectedValue(new Error('Access denied'));
    mocks.scan.mockRejectedValue(new Error('Access denied'));
    await expect(getDatabaseStorageSize()).rejects.toThrow('Access denied');
    await expect(getSearchModelsStorageStats()).rejects.toThrow('Access denied');
  });
});
