import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationSource } from '@/db/models/AssetLocation';
const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  execute: vi.fn(),
  write: vi.fn(),
  readonly: vi.fn(),
  deferred: vi.fn(),
  refresh: vi.fn(),
  locations: vi.fn(),
  writeLocation: vi.fn(),
  markLocationSaved: vi.fn(),
}));
vi.mock('@/db/connection/db.service', () => ({
  executeInDB: mocks.execute,
  safelyExecuteBatchInsert: vi.fn(),
}));
vi.mock('@/db/connection/kysely', () => ({
  kyselyDB: { updateTable: () => ({ set: () => ({ where: () => ({}) }) }) },
}));
vi.mock('./assetRows', () => ({
  updateAssetRow: mocks.update,
  refreshFileTracking: mocks.refresh,
  statFile: vi.fn(),
  tagIdsByAsset: vi.fn(),
  locationColumnsByAsset: mocks.locations,
  markLocationSavedToFile: mocks.markLocationSaved,
}));
vi.mock('@/media/metadata/exiftool/write/write-location', () => ({
  writeLocationsToFiles: mocks.writeLocation,
}));
vi.mock('./assetQueries', () => ({ getByUUID: vi.fn().mockResolvedValue({ fullPath: 'capture.jpg' }) }));
vi.mock('./assetMetadataGuard', () => ({ assertAssetsMetadataScanned: vi.fn() }));
vi.mock('@/media/metadata/exiftool/write/exiftool-write', () => ({ writeMetadataToFiles: mocks.write }));
vi.mock('@/media/metadata/exiftool/write/metadataWritePolicy', () => ({
  isMetadataWriteEnabled: mocks.readonly,
  shouldWriteBackOnSync: mocks.deferred,
  shouldWriteRatingToFile: () => true,
}));
vi.mock('../regions.service', () => ({ RegionsService: {} }));
vi.mock('./regionFileWrites', () => ({ writeRegionsForAssets: vi.fn() }));
vi.mock('./tagFileWrites', () => ({ writeKeywordsForAssets: vi.fn() }));
vi.mock('@/media/thumbnails/preview', () => ({
  deletePreviewOfFile: vi.fn(),
  needsGeneratedPreview: vi.fn(),
}));
vi.mock('@/media/thumbnails/thumbnail', () => ({ regenerateThumbnailOfFile: vi.fn() }));
import { updateAssetEditableFields, updateAssetsLocation, saveAssetLocationToFile } from './assetEdits';
import { EMPTY_LOCATION } from '@/media/metadata/location/locationDraft';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.readonly.mockReturnValue(true);
  mocks.deferred.mockReturnValue(false);
  mocks.write.mockResolvedValue(new Map());
  mocks.writeLocation.mockResolvedValue(new Map());
  mocks.locations.mockResolvedValue(new Map());
});

describe('location source and write-back', () => {
  const location = { ...EMPTY_LOCATION, city: 'Madrid' };

  it('records manual edits without file writes in read-only mode', async () => {
    mocks.readonly.mockReturnValue(false);
    await updateAssetsLocation([{ id: 'photo', location }]);
    expect(mocks.update).toHaveBeenCalledWith('photo', expect.objectContaining({ locationSource: 'manual' }));
    expect(mocks.writeLocation).not.toHaveBeenCalled();
    expect(mocks.markLocationSaved).not.toHaveBeenCalled();
  });

  it('keeps GPS-derived text auto while deferred to sync', async () => {
    mocks.deferred.mockReturnValue(true);
    await updateAssetsLocation([{ id: 'photo', location: { ...location, source: LocationSource.Auto } }]);
    expect(mocks.update).toHaveBeenCalledWith('photo', expect.objectContaining({ locationSource: 'auto' }));
    expect(mocks.writeLocation).not.toHaveBeenCalled();
    expect(mocks.markLocationSaved).not.toHaveBeenCalled();
  });

  it('marks manual text as file only after successful immediate write-back', async () => {
    await updateAssetsLocation([{ id: 'photo', location }]);
    expect(mocks.markLocationSaved).toHaveBeenCalledWith('photo', location);
  });

  it('does not mark a failed location write as saved', async () => {
    mocks.writeLocation.mockResolvedValue(new Map([['capture.jpg', 'Permission denied']]));
    const result = await updateAssetsLocation([{ id: 'photo', location }]);
    expect(result.fileFailures.get('photo')).toBe('Permission denied');
    expect(mocks.markLocationSaved).not.toHaveBeenCalled();
  });

  it('explicit Save to file writes now even when normal writes wait for sync', async () => {
    mocks.deferred.mockReturnValue(true);
    await saveAssetLocationToFile('photo', location);
    expect(mocks.markLocationSaved).toHaveBeenCalledWith('photo', location);
  });

  it('clears the source when the place is removed', async () => {
    mocks.readonly.mockReturnValue(false);
    await updateAssetsLocation([{ id: 'photo', location: EMPTY_LOCATION }]);
    expect(mocks.update).toHaveBeenCalledWith('photo', expect.objectContaining({ locationSource: null }));
  });
});
describe('capture edit write policies', () => {
  const fields = { lens: '50mm', shutterSpeed: 1.5625, aperture: 7.1, iso: 160, exposureCompensation: '+1' };
  it('stores capture edits in the library without touching files in read-only mode', async () => {
    mocks.readonly.mockReturnValue(false);
    await updateAssetEditableFields('photo', fields);
    expect(mocks.update).toHaveBeenCalledWith('photo', {
      lens: '50mm',
      shutterSpeed: 1.5625,
      aperture: 7.1,
      iso: 160,
      exposure: '+1',
    });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('queues deferred edits rather than writing per edit', async () => {
    mocks.deferred.mockReturnValue(true);
    await updateAssetEditableFields('photo', fields);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('converts milliseconds to seconds for immediate ExifTool writes', async () => {
    await updateAssetEditableFields('photo', fields);
    expect(mocks.write).toHaveBeenCalledWith(
      [
        {
          fullPath: 'capture.jpg',
          fields: {
            lens: '50mm',
            shutterSpeed: '0.0015625',
            aperture: 7.1,
            iso: 160,
            exposureCompensation: '+1',
          },
        },
      ],
      undefined,
    );
  });
  it('reports file failures without claiming successful tracking', async () => {
    mocks.write.mockResolvedValue(new Map([['capture.jpg', 'Permission denied']]));
    await expect(updateAssetEditableFields('photo', fields)).rejects.toThrow('Permission denied');
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
