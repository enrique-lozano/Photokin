import { SearchQuery } from '@/common/fileSearchFilters';

/** A filtered asset scope, optionally narrowed to explicit asset ids. */
export interface ScopeParams {
  searchQuery?: SearchQuery;
  assetIds?: string[];
}

export interface StatsOverview {
  totalAssets: number;
  photoCount: number;
  videoCount: number;
  totalSizeBytes: number;
  minDate: string | null;
  maxDate: string | null;
  ratedCount: number;
  cameraCount: number;
  lensCount: number;
  isoCount: number;
  focalLengthCount: number;
  apertureCount: number;
  shutterSpeedCount: number;
  whiteBalanceCount: number;
  flashCount: number;
  locationCount: number;
}

export interface StatsCountBucket {
  label: string;
  count: number;
}

export interface StatsNumericBucket {
  value: number;
  count: number;
}

export interface StatsRatingBucket {
  rating: number | null;
  count: number;
}

/**
 * Which timestamp column a timeline view sorts/groups by: the capture `date`
 * (default) or `dateAdded` (the "Recently added" view).
 */
export type AssetDateField = 'date' | 'dateAdded';

/**
 * Disk-side tracking info used for change/rename detection. Timestamps are kept
 * as `Date` in memory and only serialized to ISO at the database boundary; an
 * unknown file identity is represented as an empty string rather than null to
 * satisfy the NOT NULL column.
 */
export interface FileTrackingStat {
  filesize: number;
  /** Filesystem modification time. */
  fileMtime: Date;
  /**
   * Filesystem creation time, or `null` when the platform omits it. Transient
   * (not persisted): used only as a capture-date fallback for files with no
   * embedded date.
   */
  fileCreatedAt: Date | null;
  /** Stable file identity (inode / file index), or `''` when unavailable. */
  inode: string;
}

/** A row from `getAlbumFileIndex`. */
export interface AlbumFileIndexEntry {
  id: string;
  filename: string;
  fileMtime: string | null;
  inode: string | null;
  filesize: number;
}

/** A place bucket within a scope: a city, or a country when no city is known. */
export interface ScopePlace {
  city: string | null;
  country: string | null;
  countryCode: string | null;
  totalImages: number;
}

/** Minimal identity of a trashed asset, enough to locate its file and purge it. */
export interface TrashedAssetRef {
  id: string;
  filename: string;
  /** ISO-8601 timestamp of when it was trashed. */
  trashedAt: string;
}

export interface FileReadyToProcess {
  filename: string;
  albumId: string;
  absolutePath: string;
  /**
   * Optional pre-read disk stat. When the caller already statted the file (e.g.
   * the library sync, which lists a folder in one native call), passing it here
   * avoids an extra per-file stat while indexing.
   */
  stat?: FileTrackingStat;
}

export interface PendingMetadataAsset {
  id: string;
  fullPath: string;
  latitude: number | null;
  longitude: number | null;
}
