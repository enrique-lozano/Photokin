import { MetadataStage } from '@/db/models/AssetDTO';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDeferredLocations, insertFilesByPaths } from './assetImport';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  insert: vi.fn(),
  locations: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@/db/connection/db.service', () => ({
  executeInDB: vi.fn(),
  safelyExecuteBatchInsert: mocks.insert,
  selectFirstFromDB: vi.fn(),
  selectFromDB: vi.fn(),
}));
vi.mock('@/db/connection/kysely', () => ({
  kyselyDB: {
    updateTable: () => ({
      set: (values: unknown) => {
        mocks.set(values);
        return { where: () => ({}) };
      },
    }),
  },
}));
vi.mock('@/stores/appState', () => ({
  useAppStore: { getState: () => ({ markAssetChanged: vi.fn() }) },
}));
vi.mock('@/media/metadata/exiftool/read/exiftool-read', () => ({
  readFromExiftool: mocks.read,
}));
vi.mock('@tauri-apps/api/path', () => ({
  join: async (...parts: string[]) => parts.join('\\'),
}));
vi.mock('@/system/diskManager', () => ({
  joinPathSync: (...parts: string[]) => parts.join('\\'),
}));
vi.mock('../tags.service', () => ({
  TagsService: {
    ensureTagFullPaths: async () => ({ idByFullPath: new Map(), idByName: new Map() }),
  },
}));
vi.mock('./assetRows', () => ({
  locationColumnsByAsset: mocks.locations,
  regionRows: () => [],
  statFile: async () => ({
    filesize: 1000,
    fileMtime: new Date('2026-01-01'),
    fileCreatedAt: new Date('2026-01-01'),
    inode: 'file',
  }),
  updateAssetRow: vi.fn(),
}));

const file = {
  absolutePath: 'C:\\photos\\copy.jpg',
  filename: 'copy.jpg',
  albumId: 'album',
};

describe('importing edited-copy locations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockImplementation(async (_paths, _progress, options) => [
      {
        SourceFile: file.absolutePath,
        FileName: file.filename,
        Directory: 'C:\\photos',
        ImageWidth: 100,
        ImageHeight: 80,
        GPSLatitude: 40.4,
        GPSLongitude: -3.7,
        ...(options?.includeGeolocation
          ? {
              GeolocationCity: 'Madrid',
              GeolocationRegion: 'Madrid',
              GeolocationCountry: 'Spain',
              GeolocationCountryCode: 'ES',
            }
          : {}),
      },
    ]);
  });

  describe('deferred location sources', () => {
    const place = { city: 'Madrid', state: 'Madrid', country: 'Spain', countryCode: 'ES' };

    beforeEach(() => {
      vi.clearAllMocks();
      mocks.locations.mockResolvedValue(new Map());
    });

    it('records auto when enrichment supplies the missing place', async () => {
      await applyDeferredLocations([{ id: 'photo', place }]);
      expect(mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({ locationCity: 'Madrid', locationSource: 'auto' }),
      );
    });

    it('does not replace a place or its source edited while geocoding', async () => {
      mocks.locations.mockResolvedValue(
        new Map([['photo', { locationCity: 'My place', locationSource: 'manual' }]]),
      );
      await applyDeferredLocations([{ id: 'photo', place }]);
      expect(mocks.set).toHaveBeenCalledWith({ metadataStage: MetadataStage.Complete });
    });

    it('does not invent a source for an unresolved lookup', async () => {
      await applyDeferredLocations([{ id: 'photo', place: null }]);
      expect(mocks.set).toHaveBeenCalledWith({ metadataStage: MetadataStage.Complete });
    });
  });

  it('resolves GPS-only copies into complete library locations during import', async () => {
    expect(await insertFilesByPaths([file], undefined, { includeGeolocation: true })).toBe(1);
    expect(mocks.read).toHaveBeenCalledWith([file.absolutePath], expect.any(Function), {
      includeGeolocation: true,
    });
    expect(mocks.insert).toHaveBeenCalledWith('assets', [
      expect.objectContaining({
        latitude: 40.4,
        longitude: -3.7,
        locationCity: 'Madrid',
        locationState: 'Madrid',
        locationCountry: 'Spain',
        locationCountryCode: 'ES',
        locationSource: 'auto',
        metadataStage: MetadataStage.Complete,
      }),
    ]);
  });

  it('keeps normal imports deferred without requesting geolocation', async () => {
    expect(await insertFilesByPaths([file])).toBe(1);
    expect(mocks.read).toHaveBeenCalledWith([file.absolutePath], expect.any(Function), undefined);
    expect(mocks.insert).toHaveBeenCalledWith('assets', [
      expect.objectContaining({
        latitude: 40.4,
        longitude: -3.7,
        locationCity: null,
        locationSource: null,
        metadataStage: MetadataStage.LocationPending,
      }),
    ]);
  });

  it('keeps embedded place names ahead of derived labels', async () => {
    mocks.read.mockResolvedValueOnce([
      {
        SourceFile: file.absolutePath,
        FileName: file.filename,
        Directory: 'C:\\photos',
        GPSLatitude: 40.4,
        GPSLongitude: -3.7,
        City: 'Embedded city',
        Country: 'Embedded country',
        GeolocationCity: 'Derived city',
        GeolocationCountry: 'Derived country',
      },
    ]);
    expect(await insertFilesByPaths([file], undefined, { includeGeolocation: true })).toBe(1);
    expect(mocks.insert).toHaveBeenCalledWith('assets', [
      expect.objectContaining({
        locationCity: 'Embedded city',
        locationSource: 'file',
        locationCountry: 'Embedded country',
        metadataStage: MetadataStage.Complete,
      }),
    ]);
  });

  it('retains coordinates and pending enrichment when no place can be resolved', async () => {
    mocks.read.mockResolvedValueOnce([
      {
        SourceFile: file.absolutePath,
        FileName: file.filename,
        Directory: 'C:\\photos',
        GPSLatitude: 0,
        GPSLongitude: 0,
      },
    ]);
    expect(await insertFilesByPaths([file], undefined, { includeGeolocation: true })).toBe(1);
    expect(mocks.insert).toHaveBeenCalledWith('assets', [
      expect.objectContaining({
        latitude: 0,
        longitude: 0,
        locationCity: null,
        metadataStage: MetadataStage.LocationPending,
      }),
    ]);
  });
});
