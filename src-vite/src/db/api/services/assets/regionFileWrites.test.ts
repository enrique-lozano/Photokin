import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeRegionsForAssets } from './regionFileWrites';

const {
  executeInDBMock,
  getByUUIDMock,
  isMetadataWriteEnabledMock,
  refreshFileTrackingMock,
  shouldWriteBackOnSyncMock,
  writeRegionsToFilesMock,
  clearRegionsInFilesMock,
} = vi.hoisted(() => ({
  executeInDBMock: vi.fn(),
  getByUUIDMock: vi.fn(),
  isMetadataWriteEnabledMock: vi.fn(),
  refreshFileTrackingMock: vi.fn(),
  shouldWriteBackOnSyncMock: vi.fn(),
  writeRegionsToFilesMock: vi.fn(),
  clearRegionsInFilesMock: vi.fn(),
}));

vi.mock('@/db/connection/db.service', () => ({ executeInDB: executeInDBMock }));
vi.mock('@/db/connection/kysely', () => ({
  kyselyDB: {
    updateTable: () => ({ set: () => ({ where: () => ({}) }) }),
  },
}));
vi.mock('@/media/metadata/exiftool/write/metadataWritePolicy', () => ({
  isMetadataWriteEnabled: isMetadataWriteEnabledMock,
  shouldWriteBackOnSync: shouldWriteBackOnSyncMock,
}));
vi.mock('@/media/metadata/exiftool/write/write-regions', () => ({
  writeRegionsToFiles: writeRegionsToFilesMock,
  clearRegionsInFiles: clearRegionsInFilesMock,
}));
vi.mock('./assetQueries', () => ({ getByUUID: getByUUIDMock }));
vi.mock('./assetRows', () => ({ refreshFileTracking: refreshFileTrackingMock }));

const entry = (assetId: string, name: string) => ({
  assetId,
  regions: [{ name, area: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 } }],
});

const asset = (fullPath: string) => ({
  fullPath,
  metadata: { orientation: 1, width: 4000, height: 3000 },
});

describe('writeRegionsForAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMetadataWriteEnabledMock.mockReturnValue(true);
    shouldWriteBackOnSyncMock.mockReturnValue(false);
    writeRegionsToFilesMock.mockResolvedValue(new Map());
    clearRegionsInFilesMock.mockResolvedValue(new Map());
    getByUUIDMock.mockImplementation((id: string) => Promise.resolve(asset(`C:/photos/${id}.jpg`)));
  });

  it('never touches a file in read-only metadata mode', async () => {
    isMetadataWriteEnabledMock.mockReturnValue(false);

    await writeRegionsForAssets([entry('asset-1', 'Ada')]);

    expect(writeRegionsToFilesMock).not.toHaveBeenCalled();
    expect(executeInDBMock).not.toHaveBeenCalled();
  });

  it('queues the assets instead of writing when write-back is deferred to sync', async () => {
    shouldWriteBackOnSyncMock.mockReturnValue(true);

    await writeRegionsForAssets([entry('asset-1', 'Ada')]);

    expect(executeInDBMock).toHaveBeenCalledOnce();
    expect(writeRegionsToFilesMock).not.toHaveBeenCalled();
  });

  it('writes the regions immediately and refreshes file tracking', async () => {
    await writeRegionsForAssets([entry('asset-1', 'Ada')]);

    expect(writeRegionsToFilesMock).toHaveBeenCalledWith([
      {
        fullPath: 'C:/photos/asset-1.jpg',
        orientation: 1,
        displayWidth: 4000,
        displayHeight: 3000,
        regions: entry('asset-1', 'Ada').regions,
      },
    ]);
    expect(refreshFileTrackingMock).toHaveBeenCalledWith('asset-1', 'C:/photos/asset-1.jpg');
  });

  it('never writes face-region metadata to videos', async () => {
    getByUUIDMock.mockResolvedValue(asset('C:/photos/clip.mp4'));

    await writeRegionsForAssets([entry('asset-1', 'Ada')]);

    expect(writeRegionsToFilesMock).toHaveBeenCalledWith([]);
    expect(clearRegionsInFilesMock).toHaveBeenCalledWith([]);
    expect(refreshFileTrackingMock).not.toHaveBeenCalled();
  });

  it('does not queue video face metadata for deferred write-back', async () => {
    shouldWriteBackOnSyncMock.mockReturnValue(true);
    getByUUIDMock.mockResolvedValue(asset('C:/photos/clip.mp4'));

    await writeRegionsForAssets([entry('asset-1', 'Ada')]);

    expect(executeInDBMock).not.toHaveBeenCalled();
  });

  it('skips assets left without confirmed regions instead of clearing their file', async () => {
    await writeRegionsForAssets([{ assetId: 'asset-1', regions: [] }]);

    expect(writeRegionsToFilesMock).toHaveBeenCalledWith([]);
    expect(refreshFileTrackingMock).not.toHaveBeenCalled();
  });

  it('reports failures without refreshing the files that failed', async () => {
    writeRegionsToFilesMock.mockResolvedValue(new Map([['C:/photos/asset-1.jpg', 'file is read-only']]));

    const failures = await writeRegionsForAssets([entry('asset-1', 'Ada')]);

    expect(failures.get('asset-1')).toBe('file is read-only');
    expect(refreshFileTrackingMock).not.toHaveBeenCalled();
  });

  it('clears region metadata when asked to write an empty set', async () => {
    await writeRegionsForAssets([{ assetId: 'asset-1', regions: [] }], { clearIfEmpty: true });

    expect(clearRegionsInFilesMock).toHaveBeenCalledWith([{ fullPath: 'C:/photos/asset-1.jpg' }]);
    expect(writeRegionsToFilesMock).toHaveBeenCalledWith([]);
    expect(refreshFileTrackingMock).toHaveBeenCalledWith('asset-1', 'C:/photos/asset-1.jpg');
  });
});
