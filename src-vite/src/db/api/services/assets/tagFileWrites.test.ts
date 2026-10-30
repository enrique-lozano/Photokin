import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeKeywordsForAssets } from './tagFileWrites';

const {
  assertAssetsMetadataScannedMock,
  executeInDBMock,
  getByUUIDMock,
  isMetadataWriteEnabledMock,
  refreshFileTrackingMock,
  shouldWriteBackOnSyncMock,
  keywordTagIdsByAssetMock,
  tagsGetAllMock,
  writeKeywordsToFilesMock,
} = vi.hoisted(() => ({
  assertAssetsMetadataScannedMock: vi.fn(),
  executeInDBMock: vi.fn(),
  getByUUIDMock: vi.fn(),
  isMetadataWriteEnabledMock: vi.fn(),
  refreshFileTrackingMock: vi.fn(),
  shouldWriteBackOnSyncMock: vi.fn(),
  keywordTagIdsByAssetMock: vi.fn(),
  tagsGetAllMock: vi.fn(),
  writeKeywordsToFilesMock: vi.fn(),
}));

vi.mock('./assetMetadataGuard', () => ({
  assertAssetsMetadataScanned: assertAssetsMetadataScannedMock,
}));
vi.mock('@/db/connection/db.service', () => ({
  executeInDB: executeInDBMock,
  selectFromDB: vi.fn(),
}));
vi.mock('@/db/connection/kysely', () => ({
  kyselyDB: {
    updateTable: () => ({ set: () => ({ where: () => ({}) }) }),
    selectFrom: () => ({ select: () => ({ where: () => ({}) }) }),
  },
}));
vi.mock('@/media/metadata/exiftool/write/metadataWritePolicy', () => ({
  isMetadataWriteEnabled: isMetadataWriteEnabledMock,
  shouldWriteBackOnSync: shouldWriteBackOnSyncMock,
}));
vi.mock('@/media/metadata/exiftool/write/write-keywords', () => ({
  writeKeywordsToFiles: writeKeywordsToFilesMock,
}));
vi.mock('../tags.service', () => ({ TagsService: { getAll: tagsGetAllMock } }));
vi.mock('./assetQueries', () => ({ getByUUID: getByUUIDMock }));
vi.mock('./assetRows', () => ({
  keywordTagIdsByAsset: keywordTagIdsByAssetMock,
  refreshFileTracking: refreshFileTrackingMock,
}));

describe('writeKeywordsForAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertAssetsMetadataScannedMock.mockResolvedValue(undefined);
    isMetadataWriteEnabledMock.mockReturnValue(true);
    shouldWriteBackOnSyncMock.mockReturnValue(false);
    writeKeywordsToFilesMock.mockResolvedValue(new Map());
    tagsGetAllMock.mockResolvedValue([{ id: 'tag-keep', fullPath: 'Travel/Spain' }]);
    keywordTagIdsByAssetMock.mockResolvedValue(new Map([['asset-1', new Set(['tag-keep'])]]));
    getByUUIDMock.mockResolvedValue({ fullPath: 'C:/photos/asset-1.jpg' });
  });

  it('never touches a file in read-only metadata mode', async () => {
    isMetadataWriteEnabledMock.mockReturnValue(false);

    const failures = await writeKeywordsForAssets(['asset-1']);

    expect(failures.size).toBe(0);
    expect(writeKeywordsToFilesMock).not.toHaveBeenCalled();
    expect(executeInDBMock).not.toHaveBeenCalled();
  });

  it('queues the assets instead of writing when write-back is deferred to sync', async () => {
    shouldWriteBackOnSyncMock.mockReturnValue(true);

    await writeKeywordsForAssets(['asset-1']);

    expect(executeInDBMock).toHaveBeenCalledOnce();
    expect(writeKeywordsToFilesMock).not.toHaveBeenCalled();
  });

  it('writes the current keyword set, including an empty set that clears the file', async () => {
    keywordTagIdsByAssetMock.mockResolvedValue(new Map([['asset-1', new Set()]]));

    await writeKeywordsForAssets(['asset-1']);

    expect(writeKeywordsToFilesMock).toHaveBeenCalledWith(
      [{ fullPath: 'C:/photos/asset-1.jpg', tagPaths: [] }],
      undefined,
    );
    expect(refreshFileTrackingMock).toHaveBeenCalledWith('asset-1', 'C:/photos/asset-1.jpg');
  });

  it('writes confirmed person tags supplied by face-region keyword membership', async () => {
    tagsGetAllMock.mockResolvedValue([{ id: 'person-1', fullPath: 'People/Daniel Caldera García' }]);
    keywordTagIdsByAssetMock.mockResolvedValue(new Map([['asset-1', new Set(['person-1'])]]));

    await writeKeywordsForAssets(['asset-1']);

    expect(writeKeywordsToFilesMock).toHaveBeenCalledWith(
      [{ fullPath: 'C:/photos/asset-1.jpg', tagPaths: ['People/Daniel Caldera García'] }],
      undefined,
    );
  });

  it('reports failures without refreshing the files that failed', async () => {
    writeKeywordsToFilesMock.mockResolvedValue(new Map([['C:/photos/asset-1.jpg', 'file is read-only']]));

    const failures = await writeKeywordsForAssets(['asset-1']);

    expect(failures.get('asset-1')).toBe('file is read-only');
    expect(refreshFileTrackingMock).not.toHaveBeenCalled();
  });
});
