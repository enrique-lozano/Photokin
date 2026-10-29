import { MetadataStage } from '@/db/models/AssetDTO';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadMetadataForAsset, reloadMetadataForAssets } from './assetReload';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  setRow: vi.fn(),
  locationColumnsByAsset: vi.fn(),
}));

vi.mock('@/db/connection/db.service', () => ({
  executeInDB: vi.fn(),
  safelyExecuteBatchInsert: vi.fn(),
}));
vi.mock('@/db/connection/kysely', () => {
  const query = {
    set: (row: unknown) => {
      mocks.setRow(row);
      return query;
    },
    where: () => query,
  };
  return { kyselyDB: { updateTable: () => query, deleteFrom: () => query } };
});
vi.mock('@/media/metadata/exiftool/read/exiftool-read', () => ({ readFromExiftool: mocks.read }));
vi.mock('@/stores/appState', () => ({ useAppStore: { getState: () => ({ markAssetChanged: vi.fn() }) } }));
vi.mock('@/system/diskManager', () => ({ normalizeAllPathSep: (path: string) => path }));
vi.mock('../tags.service', () => ({
  TagsService: {
    ensureTagFullPaths: async () => ({ idByFullPath: new Map(), idByName: new Map() }),
  },
}));
vi.mock('./assetQueries', () => ({ getByUUID: vi.fn(async () => ({})) }));
vi.mock('./assetRows', () => ({
  locationColumnsByAsset: mocks.locationColumnsByAsset,
  regionRows: () => [],
  statFile: async () => ({
    filesize: 1000,
    fileMtime: new Date('2026-01-01'),
    fileCreatedAt: new Date('2026-01-01'),
    inode: 'file',
  }),
}));

const asset = { id: 'asset-1', fullPath: 'C:\\photos\\a.jpg' };

function _gpsOnlyFile(extra: Record<string, unknown> = {}) {
  return {
    SourceFile: asset.fullPath,
    FileName: 'a.jpg',
    Directory: 'C:\\photos',
    GPSLatitude: 40.4,
    GPSLongitude: -3.7,
    ...extra,
  };
}

describe('reloading metadata from disk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.locationColumnsByAsset.mockResolvedValue(
      new Map([
        [
          asset.id,
          {
            locationSublocation: null,
            locationCity: 'Delicias',
            locationState: 'Madrid',
            locationCountry: 'Spain',
            locationCountryCode: 'ES',
            locationSource: 'auto',
          },
        ],
      ]),
    );
    mocks.read.mockImplementation(async (_paths, _progress, options) => [
      _gpsOnlyFile(
        options?.includeGeolocation ? { GeolocationCity: 'Madrid', GeolocationRegion: 'Madrid' } : {},
      ),
    ]);
  });

  it('replaces a stale stored place with the one geocoded from the file GPS', async () => {
    await reloadMetadataForAssets([asset], undefined, { place: 'inline' });

    expect(mocks.read).toHaveBeenCalledWith([asset.fullPath], undefined, { includeGeolocation: true });
    expect(mocks.setRow).toHaveBeenCalledWith(
      expect.objectContaining({
        locationCity: 'Madrid',
        locationSource: 'auto',
        metadataStage: MetadataStage.Complete,
      }),
    );
  });

  it('drops the stale place and queues GPS photos for the geocode stage when deferring', async () => {
    await reloadMetadataForAssets([asset], undefined, { place: 'defer' });

    expect(mocks.read).toHaveBeenCalledWith([asset.fullPath], undefined, { includeGeolocation: false });
    expect(mocks.setRow).toHaveBeenCalledWith(
      expect.objectContaining({
        locationCity: null,
        locationSource: null,
        metadataStage: MetadataStage.LocationPending,
      }),
    );
  });

  it('refreshes a single asset the same way', async () => {
    await reloadMetadataForAsset(asset);

    expect(mocks.read).toHaveBeenCalledWith([asset.fullPath], undefined, { includeGeolocation: true });
    expect(mocks.setRow).toHaveBeenCalledWith(expect.objectContaining({ locationCity: 'Madrid' }));
  });

  it('keeps the stored place on automatic reloads, which do not geocode', async () => {
    await reloadMetadataForAssets([asset]);

    expect(mocks.setRow).toHaveBeenCalledWith(
      expect.objectContaining({ locationCity: 'Delicias', locationSource: 'auto' }),
    );
  });

  it('replaces library-only values with embedded file place text', async () => {
    mocks.read.mockResolvedValue([_gpsOnlyFile({ City: 'Embedded Madrid' })]);
    await reloadMetadataForAssets([asset], undefined, { place: 'defer' });
    expect(mocks.setRow).toHaveBeenCalledWith(
      expect.objectContaining({ locationCity: 'Embedded Madrid', locationSource: 'file' }),
    );
  });
});
