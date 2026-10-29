import { isSupportedVideoPath } from '@/common/supportedFormats';
import { runBatchedExiftoolWrites } from './exiftool-batch';

// ----------
// * CAPTURE DATE WRITE-BACK (per-role date fields, digiKam-style)
// ----------

/** ExifTool date/time literal (`YYYY:MM:DD HH:MM:SS`) from UTC components, so it round-trips with the reader (see `_parseExifDate`). */
export function formatExifDateTime(date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  const y = pad(date.getUTCFullYear(), 4);
  const mo = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `${y}:${mo}:${d} ${h}:${mi}:${s}`;
}

// Per-role tag sets (taken / digitized / modified), each written independently.
// See ./writing-with-exiftool.md for the why.

const IMAGE_TAKEN_SET = [
  'DateTimeOriginal', // Writes EXIF:DateTimeOriginal, updates other same name tags if present.
  'DateCreated', // Writes IPTC:DateCreated, updates other same name tags if present.
  'IPTC:TimeCreated', // IPTC:DateCreated is date-only, so the IPTC time is set explicitly.
] as const;
const IMAGE_TAKEN_CLEAR = ['SubSecTimeOriginal', 'OffsetTimeOriginal'] as const;

const IMAGE_DIGITIZED_SET = [
  'CreateDate', // EXIF DateTimeDigitized; group-less updates XMP-xmp:CreateDate if present.
  'IPTC:DigitalCreationDate',
  'IPTC:DigitalCreationTime',
] as const;
const IMAGE_DIGITIZED_CLEAR = ['SubSecTimeDigitized', 'OffsetTimeDigitized'] as const;

const IMAGE_MODIFIED_SET = ['ModifyDate', 'XMP-xmp:MetadataDate'] as const;
const IMAGE_MODIFIED_CLEAR = ['SubSecTime', 'OffsetTime'] as const;

// Video containers carry a single creation date (no original/digitized split),
// so both the "taken" and "digitized" toggles map onto the same creation tags.
const VIDEO_CREATE_SET = [
  'QuickTime:CreateDate',
  'TrackCreateDate',
  'MediaCreateDate',
  'XMP-xmp:CreateDate',
] as const;
const VIDEO_MODIFIED_SET = [
  'QuickTime:ModifyDate',
  'TrackModifyDate',
  'MediaModifyDate',
  'XMP-xmp:ModifyDate',
  'XMP-xmp:MetadataDate',
] as const;

export interface CaptureDateWriteOptions {
  /** Write the "taken/original" date tags (rewrites file content). */
  writeTaken: boolean;
  /** Write the "digitized" date tags (rewrites file content). */
  writeDigitized: boolean;
  /** Write the embedded "modified" date tags (rewrites file content). */
  writeModified: boolean;
  /** Set the filesystem modification time to the new value (no content rewrite). */
  setFileModifyTime: boolean;
  /**
   * Pass `-wm w` so ExifTool only updates existing tags, never creating new ones
   * (digiKam's "update only existing timestamps"). A modifier; never writes alone.
   */
  onlyExistingTags: boolean;
}

export interface CaptureDateFileEntry {
  fullPath: string;
  date: Date;
}

// IPTC time tags store a timezone offset. Given none, ExifTool appends the
// *system-local* offset, which would disagree with our UTC value; pin them to
// `+00:00`. EXIF/XMP carry no offset and the reader treats them as UTC.
const IPTC_UTC_TIME_TAGS = new Set<string>(['IPTC:TimeCreated', 'IPTC:DigitalCreationTime']);

function _pushSet(args: string[], tags: readonly string[], value: string): void {
  for (const tag of tags) {
    args.push(`-${tag}=${IPTC_UTC_TIME_TAGS.has(tag) ? `${value}+00:00` : value}`);
  }
}

function _pushClear(args: string[], tags: readonly string[]): void {
  for (const tag of tags) args.push(`-${tag}=`);
}

/**
 * Builds one file's exiftool args (path last, no trailing `-execute`).
 * See [writing-with-exiftool.md](./writing-with-exiftool.md).
 *
 * @internal Exported only for the integration test (the write path goes through Tauri).
 */
export function captureDateWriteArgs(
  entry: CaptureDateFileEntry,
  options: CaptureDateWriteOptions,
): string[] {
  const value = formatExifDateTime(entry.date);
  // Options reset between `-execute` boundaries, so per-file flags are repeated.
  const args = ['-m'];
  if (options.onlyExistingTags) args.push('-wm', 'w');

  const writesMetadata = options.writeTaken || options.writeDigitized || options.writeModified;

  if (isSupportedVideoPath(entry.fullPath)) {
    if (options.writeTaken || options.writeDigitized) _pushSet(args, VIDEO_CREATE_SET, value);
    if (options.writeModified) _pushSet(args, VIDEO_MODIFIED_SET, value);
  } else {
    if (options.writeTaken) {
      _pushSet(args, IMAGE_TAKEN_SET, value);
      _pushClear(args, IMAGE_TAKEN_CLEAR);
    }
    if (options.writeDigitized) {
      _pushSet(args, IMAGE_DIGITIZED_SET, value);
      _pushClear(args, IMAGE_DIGITIZED_CLEAR);
    }
    if (options.writeModified) {
      _pushSet(args, IMAGE_MODIFIED_SET, value);
      _pushClear(args, IMAGE_MODIFIED_CLEAR);
    }
  }

  // `+00:00` pins the mtime to the same instant the value represents (UTC),
  // matching how the rest of the pipeline treats group-less date strings.
  if (options.setFileModifyTime) args.push(`-FileModifyDate=${value}+00:00`);
  if (writesMetadata) args.push('-overwrite_original');

  args.push(entry.fullPath);
  return args;
}

/** True when the options request at least one file-touching write. */
function _writesAnything(options: CaptureDateWriteOptions): boolean {
  return options.writeTaken || options.writeDigitized || options.writeModified || options.setFileModifyTime;
}

/**
 * Stamps a new capture date into many files in as few exiftool spawns as possible
 * (see {@link runBatchedExiftoolWrites}); touches files only, not the DB. Returns
 * `fullPath → error` for the ones it couldn't write; a no-op resolves empty without
 * spawning. `onProgress` fires after each chunk with the running file count.
 */
export async function writeCaptureDatesToFiles(
  entries: CaptureDateFileEntry[],
  options: CaptureDateWriteOptions,
  onProgress?: (processed: number, total: number) => void,
): Promise<Map<string, string>> {
  if (entries.length === 0 || !_writesAnything(options)) {
    return new Map<string, string>();
  }

  return runBatchedExiftoolWrites(
    entries.map((entry) => ({ fullPath: entry.fullPath, args: captureDateWriteArgs(entry, options) })),
    onProgress,
  );
}
