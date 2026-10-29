import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_CAMERA_TAGS } from '@/db/models/CameraTags';
import { EMPTY_LOCATION } from '@/media/metadata/location/locationDraft';
import { flushPendingFileWrites, writeCurrentMetadataToFiles } from './assetFileWrites';

const mocks = vi.hoisted(() => ({
  locationWrite: vi.fn(),
  fieldWrite: vi.fn(),
  saved: vi.fn(),
}));
vi.mock('@/db/connection/db.service', () => ({
  executeInDB: vi.fn(),
  selectFromDB: vi.fn(async () => [{ id: 'photo' }]),
}));
vi.mock('@/db/connection/kysely', () => {
  const query = {
    set: () => query,
    where: () => query,
    select: () => query,
  };
  return { kyselyDB: { selectFrom: () => query, updateTable: () => query } };
});
vi.mock('./assetRows', () => ({
  markLocationSavedToFile: mocks.saved,
  refreshFileTracking: vi.fn(),
  tagPathsByAsset: vi.fn(async () => new Map()),
}));
vi.mock('./assetQueries', () => ({
  getByUUID: async () => ({
    id: 'photo',
    fullPath: 'photo.jpg',
    metadata: {
      camera: EMPTY_CAMERA_TAGS,
      location: { ...EMPTY_LOCATION, name: 'Madrid', city: 'Madrid', source: 'auto' },
    },
  }),
}));
vi.mock('./assetMetadataGuard', () => ({ assertAssetsMetadataScanned: vi.fn() }));
vi.mock('@/media/metadata/exiftool/write/exiftool-write', () => ({
  writeMetadataToFiles: mocks.fieldWrite,
}));
vi.mock('@/media/metadata/exiftool/write/write-location', () => ({
  writeLocationsToFiles: mocks.locationWrite,
}));
vi.mock('@/media/metadata/exiftool/write/write-keywords', () => ({
  writeKeywordsToFiles: async () => new Map(),
}));
vi.mock('@/media/metadata/exiftool/write/write-regions', () => ({
  writeRegionsToFiles: async () => new Map(),
}));
vi.mock('@/media/metadata/exiftool/write/metadataWritePolicy', () => ({
  isMetadataWriteEnabled: () => true,
  shouldWriteRatingToFile: () => true,
}));
vi.mock('../regions.service', () => ({
  RegionsService: { getWritableRegionsForAssets: async () => new Map() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fieldWrite.mockResolvedValue(new Map());
  mocks.locationWrite.mockResolvedValue(new Map());
});

describe('location sources after explicit and queued writes', () => {
  it('marks a successfully written auto place as file', async () => {
    await writeCurrentMetadataToFiles(['photo']);
    expect(mocks.saved).toHaveBeenCalledWith(
      'photo',
      expect.objectContaining({ city: 'Madrid', source: 'auto' }),
    );
  });

  it('does not mark failed location writes as file', async () => {
    mocks.locationWrite.mockResolvedValue(new Map([['photo.jpg', 'Read-only file']]));
    const result = await writeCurrentMetadataToFiles(['photo']);
    expect(result.failures.get('photo')).toBe('Read-only file');
    expect(mocks.saved).not.toHaveBeenCalled();
  });

  it('marks a saved location even if an unrelated metadata field write failed', async () => {
    mocks.fieldWrite.mockResolvedValue(new Map([['photo.jpg', 'Title write failed']]));
    const result = await writeCurrentMetadataToFiles(['photo']);
    expect(result.failures.get('photo')).toBe('Title write failed');
    expect(mocks.saved).toHaveBeenCalledTimes(1);
  });

  it('updates the source when deferred edits are flushed on sync', async () => {
    const result = await flushPendingFileWrites();
    expect(result.written).toBe(1);
    expect(mocks.saved).toHaveBeenCalledTimes(1);
  });
});
