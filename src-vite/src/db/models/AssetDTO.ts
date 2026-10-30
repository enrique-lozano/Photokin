import { AssetMeteringMode } from '@/media/metadata/fields/meteringMode';
import { AssetOrientation } from '@/media/metadata/fields/orientation';
import { AlbumDTO } from './AlbumDTO';
import type { LocationSource } from './AssetLocation';

/**
 * How far an asset has got through the import pipeline. Stored as an integer in
 * `assets.metadataStage`; stages only move forward, so the numbers are ordered.
 */
export enum MetadataStage {
  // * Changing stored enum values requires a database migration.

  /** Discovered on disk; its metadata has not been read yet. */
  Discovered = 0,
  /** Metadata read; still waiting for its GPS position to be geocoded into a place name. */
  LocationPending = 1,
  /** Fully imported. */
  Complete = 2,
}

export interface AssetDTO {
  id: string;
  albumId: string;
  filename: string;
  filesize: number;
  duration: number;
  width: number;
  height: number;
  orientation: AssetOrientation;
  date: string;
  make: string | null;
  model: string | null;
  lens: string | null;
  /** Software/firmware that produced or last edited the file (EXIF/XMP). */
  software: string | null;
  iso: number | null;
  /** Exposure duration in milliseconds, mapped to the SQLite REAL column. */
  shutterSpeed: number | null;
  aperture: number | null;
  meteringMode: AssetMeteringMode | null;
  exposure: string | null;
  /** XMP star rating, 0–5. Null means the file has no rating tag. */
  rating: number | null;
  exposureProgram: string | null;
  whiteBalance: string | null;
  flash: string | null;
  focalLength: string | null;
  /** User/XMP title (dc:title). Null when unset. */
  title: string | null;
  description: string | null;
  // Geolocation.
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  /** Free-form spot / sub-location (XMP-iptcCore:Location). */
  locationSublocation: string | null;
  locationCity: string | null;
  /** Region / state / province. */
  locationState: string | null;
  locationCountry: string | null;
  /** Canonical ISO 3166-1 alpha-2 country code (normalized). */
  locationCountryCode: string | null;
  locationSource: LocationSource | null;
  // Rights / ownership.
  creator: string | null;
  copyright: string | null;
  credit: string | null;
  source: string | null;
  // Technical file info.
  colorSpace: string | null;
  bitDepth: string | null;
  /** ISO-8601 timestamp of the last time this file's metadata was read from disk. */
  lastScanned: string | null;
  /**
   * ISO-8601 timestamp of when this asset was first added to the library. Set
   * once on insert and never changed, so it powers the "Recently added" view.
   */
  dateAdded: string;
  /**
   * ISO-8601 modification time of the file on disk at the last scan. Drives the
   * library sync's change detection.
   */
  fileMtime: string;
  /**
   * Stable file identity (inode on Unix, file index on Windows) used to detect
   * renames during sync. Empty string when the platform/filesystem does not
   * expose one.
   */
  inode: string;
  /**
   * ISO-8601 timestamp of when the asset was moved to the app-managed Trash, or
   * `null` for a normal live library asset. Trashed rows keep their id and
   * cached thumbnail so they can be listed, restored or purged.
   */
  trashedAt: string | null;
  metadataStage: MetadataStage;
  /**
   * 1 while an in-app edit still has to reach the original file, i.e. when
   * write-back is deferred to the next sync.
   */
  pendingFileWrite: number;
}

export type AssetMetadataDTO = Omit<
  AssetDTO,
  | 'id'
  | 'albumId'
  | 'filename'
  | 'filesize'
  | 'fileMtime'
  | 'inode'
  | 'dateAdded'
  | 'trashedAt'
  | 'metadataStage'
  | 'pendingFileWrite'
>;

export type AlbumWithRootPath = AlbumDTO & { rootPath: string };

/**
 * Shape returned by the asset read query: the asset row joined with its album,
 * minus the filesystem-tracking columns (which the gallery never reads).
 */
export type AssetWithAlbumFromDB = Omit<
  AssetDTO,
  'albumId' | 'fileMtime' | 'inode' | 'trashedAt' | 'metadataStage' | 'pendingFileWrite'
> & {
  album: AlbumWithRootPath | string | null;
  /** Present on real query rows; optional so round-trip fixtures can omit it. */
  trashedAt?: string | null;
};
