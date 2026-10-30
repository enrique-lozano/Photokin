import { getFileExtensionFromPath } from '@/common/supportedFormats';

/**
 * Display-friendly format and MIME-type derivation for a file, used by the
 * technical metadata section. These are derived purely from the file
 * extension; richer values (color space, bit depth, container details) would
 * come from the metadata pipeline once the model carries them.
 */

const FORMAT_LABELS: Record<string, string> = {
  jpg: 'JPEG',
  jpeg: 'JPEG',
  png: 'PNG',
  gif: 'GIF',
  webp: 'WebP',
  svg: 'SVG',
  tif: 'TIFF',
  tiff: 'TIFF',
  bmp: 'Bitmap',
  heic: 'HEIC',
  heif: 'HEIF',
  mp4: 'MP4',
  webm: 'WebM',
  ogv: 'OGG video',
  ogg: 'OGG',
  mov: 'QuickTime',
};

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
};

/** Bare lowercase extension without the leading dot, or `null` when absent. */
function _bareExtension(filename: string): string | null {
  const ext = getFileExtensionFromPath(filename).replace(/^\./, '');
  return ext.length > 0 ? ext : null;
}

/** Human-readable format label (e.g. `JPEG`) derived from the file name. */
export function getFormatLabel(filename: string): string | null {
  const ext = _bareExtension(filename);
  if (!ext) return null;
  return FORMAT_LABELS[ext] ?? ext.toUpperCase();
}

/** Best-effort MIME type (e.g. `image/jpeg`) derived from the file name. */
export function getMimeType(filename: string): string | null {
  const ext = _bareExtension(filename);
  if (!ext) return null;
  return MIME_TYPES[ext] ?? null;
}
