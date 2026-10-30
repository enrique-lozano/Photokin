export interface ThumbnailOptions {
  size: ThumbnailSize;
  format: ThumbnailFormat;
}

export enum ThumbnailSize {
  DEFAULT = 'DEFAULT',
  XS = 'XS',
}

/** Thumbnail file type; the value is also the file extension on disk. */
export enum ThumbnailFormat {
  JPEG = 'jpeg',
  WEBP = 'webp',
}

export const default_thumbnail_options: ThumbnailOptions = {
  size: ThumbnailSize.DEFAULT,
  format: ThumbnailFormat.WEBP,
} as const;
