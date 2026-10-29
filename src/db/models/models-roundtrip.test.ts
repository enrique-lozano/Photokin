import { describe, expect, it, vi } from 'vitest';
import { AlbumDTO, AlbumInClient } from './AlbumDTO';
import { AlbumWithRootPath, AssetDTO } from './AssetDTO';
import { AssetInClient } from './AssetInClient';
import { AssetMetadata } from './AssetMetadata';
import { LocationSource } from './AssetLocation';
import { AssetMeteringMode } from '@/media/metadata/fields/meteringMode';
import { AssetOrientation } from '@/media/metadata/fields/orientation';
import { PersonSex, TagInClient } from './TagDTO';
import { FaceStatus, TagRegionInfoInClient } from './TagRegionInfoDTO';

vi.mock('@tauri-apps/api/path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tauri-apps/api/path')>();
  return {
    ...actual,
    join: async (...parts: string[]) => parts.join('/'),
    sep: () => '/',
  };
});

describe('models round-trip conversions', () => {
  it('round-trips AssetMetadata using fromDB and toDB', () => {
    const dbMetadata = {
      width: 1920,
      height: 1080,
      date: '2024-01-02T03:04:05.000Z',
      duration: 10,
      orientation: AssetOrientation.Rotate90CW,
      make: 'Canon',
      model: 'R6',
      lens: '50mm',
      software: 'Adobe Lightroom',
      iso: 100,
      shutterSpeed: 4,
      aperture: 2.8,
      meteringMode: AssetMeteringMode.MultiSegment,
      exposure: '0',
      rating: 4,
      exposureProgram: 'Aperture-priority AE',
      whiteBalance: 'Auto',
      flash: 'Off, Did not fire',
      focalLength: '50 mm',
      title: 'Sample title',
      description: 'sample',
      latitude: 40.123456,
      longitude: -3.654321,
      altitude: 667,
      locationSublocation: null,
      locationCity: 'Madrid',
      locationState: null,
      locationCountry: 'Spain',
      locationCountryCode: 'ES',
      locationSource: LocationSource.File,
      creator: 'John Smith',
      copyright: '© John Smith',
      credit: 'Acme',
      source: 'Acme Press',
      colorSpace: 'sRGB',
      bitDepth: '8-bit',
      lastScanned: '2024-01-03T00:00:00.000Z',
    };

    const metadata = AssetMetadata.fromDB(dbMetadata);

    expect(metadata.toDB()).toEqual(dbMetadata);
    expect(metadata.date.toISOString()).toBe(dbMetadata.date);
  });

  it('round-trips AssetInClient using fromDB and toDB', async () => {
    // The tracking columns and the trash flag are owned by the sync/trash
    // layers, not this client model, so they are excluded from the round-trip.
    const dbAsset: Omit<
      AssetDTO,
      'fileMtime' | 'inode' | 'trashedAt' | 'metadataStage' | 'pendingFileWrite'
    > = {
      id: 'asset-1',
      albumId: 'album-1',
      filename: 'photo.jpg',
      filesize: 12345,
      width: 1920,
      height: 1080,
      date: '2024-01-02T03:04:05.000Z',
      duration: 10,
      orientation: AssetOrientation.Horizontal,
      make: 'Canon',
      model: 'R6',
      lens: '50mm',
      software: 'Adobe Lightroom',
      iso: 100,
      shutterSpeed: 4,
      aperture: 2.8,
      meteringMode: AssetMeteringMode.MultiSegment,
      exposure: '0',
      rating: 4,
      exposureProgram: 'Aperture-priority AE',
      whiteBalance: 'Auto',
      flash: 'Off, Did not fire',
      focalLength: '50 mm',
      title: 'Sample title',
      description: 'sample',
      latitude: 40.123456,
      longitude: -3.654321,
      altitude: 667,
      locationSublocation: null,
      locationCity: 'Madrid',
      locationState: null,
      locationCountry: 'Spain',
      locationCountryCode: 'ES',
      locationSource: LocationSource.Auto,
      creator: 'John Smith',
      copyright: '© John Smith',
      credit: 'Acme',
      source: 'Acme Press',
      colorSpace: 'sRGB',
      bitDepth: '8-bit',
      lastScanned: '2024-01-03T00:00:00.000Z',
      dateAdded: '2024-01-02T10:00:00.000Z',
    };

    const album: AlbumWithRootPath = {
      id: 'album-1',
      relativePath: 'events',
      lastModified: '2024-01-01T00:00:00.000Z',
      rootAlbumId: 'root-1',
      isHidden: 0,
      rootPath: '/photos',
    };

    // `AssetInClient` carries the resolved album, not a bare `albumId`.
    const { albumId, ...assetWithoutAlbumId } = dbAsset;
    const asset = await AssetInClient.fromDB({
      ...assetWithoutAlbumId,
      album,
    });

    // `toDB` has to flatten the nested album back into an `albumId` column.
    expect(asset.toDB().albumId).toBe(albumId);
    expect(asset.toDB()).toEqual(dbAsset);
    expect(asset.metadata.date.toISOString()).toBe(dbAsset.date);
  });

  it('round-trips AlbumInClient using fromDB and toDB', () => {
    const dbAlbum: AlbumDTO = {
      id: 'album-1',
      relativePath: 'events',
      lastModified: '2024-01-01T00:00:00.000Z',
      rootAlbumId: 'root-1',
      isHidden: 0,
    };

    const album = AlbumInClient.fromDB(dbAlbum, '/photos');

    expect(album.toDB()).toEqual(dbAlbum);
    expect(album.lastModified.toISOString()).toBe(dbAlbum.lastModified);
  });

  it.each([null, 'profile-face'])('round-trips TagInClient with profile region %s', (profileRegionId) => {
    const tag = TagInClient.fromDB({
      id: 'tag-1',
      parentId: null,
      name: 'People',
      color: null,
      sex: PersonSex.Female,
      dateBirth: '1989',
      dateDead: null,
      profileRegionId,
      fullPath: 'People',
      depth: 0,
      rootId: 'tag-1',
    });

    expect(tag.toDB()).toEqual({
      id: 'tag-1',
      parentId: null,
      name: 'People',
      color: null,
      sex: PersonSex.Female,
      dateBirth: '1989',
      dateDead: null,
      description: null,
      isFavorite: 0,
      isHidden: 0,
      profileRegionId,
    });
  });

  it('round-trips TagRegionInfoInClient using fromDB and toDB', () => {
    const dto = {
      id: 'region-1',
      assetId: 'asset-1',
      tagId: 'tag-1',
      confirmed: 1 as const,
      faceStatus: FaceStatus.Confirmed,
      detectionScore: 0.91,
      x: 0.2,
      y: 0.3,
      w: 0.4,
      h: 0.5,
    };

    const region = TagRegionInfoInClient.fromDB(dto);

    expect(region.toDB()).toEqual(dto);
  });
});
