export enum SupportedImageFormats {
  GIF = 'gif',
  JPEG = 'jpeg',
  JPG = 'jpg',
  PNG = 'png',
  WEBP = 'webp',
  SVG = 'svg',
  BMP = 'bmp',
  TIF = 'tif',
  TIFF = 'tiff',
  ICO = 'ico',
  HEIC = 'heic',
  HEIF = 'heif',
  AVIF = 'avif',
}

export enum SupportedVideoFormats {
  MP4 = 'mp4',
  WEBM = 'webm',
  OGV = 'ogv',
  OGG = 'ogg',
}

export const SupportedFormats = {
  photos: Object.values(SupportedImageFormats),
  videos: Object.values(SupportedVideoFormats),
};

export const SupportedFormatsWithDots = {
  photos: SupportedFormats.photos.map((x) => `.${x}`),
  videos: SupportedFormats.videos.map((x) => `.${x}`),
};

export const AllSupportedFormatsWithDots = [
  ...SupportedFormatsWithDots.photos,
  ...SupportedFormatsWithDots.videos,
];

/**
 * Image formats the webview can paint directly in an `<img>`. Anything else
 * (HEIC/HEIF/TIFF) always needs a generated thumbnail or full-size preview,
 * however small the file is.
 */
export const WEBVIEW_DISPLAYABLE_IMAGE_FORMATS = new Set(
  [
    SupportedImageFormats.AVIF,
    SupportedImageFormats.BMP,
    SupportedImageFormats.GIF,
    SupportedImageFormats.ICO,
    SupportedImageFormats.JPEG,
    SupportedImageFormats.JPG,
    SupportedImageFormats.PNG,
    SupportedImageFormats.SVG,
    SupportedImageFormats.WEBP,
  ].map((format) => `.${format}`),
);

export function getFileExtensionFromPath(filePath: string): string {
  const [, extension = ''] = filePath.toLowerCase().match(/\.([^.\\/]+)$/) ?? [];
  return extension ? `.${extension}` : '';
}

export function isSupportedVideoPath(filePath: string): boolean {
  return SupportedFormatsWithDots.videos.includes(getFileExtensionFromPath(filePath));
}
