import { runExiftoolSession } from '@/media/metadata/exiftool/exiftoolSession';
import { debugLog, errorLog, warningLog } from '@/system/devLogger';
import {
  EXIFTOOL_DATE_TAGS,
  EXIFTOOL_DEFAULT_TAGS,
  EXIFTOOL_GEOLOCATION_ARGS,
  EXIFTOOL_NUMERIC_TAGS,
  type ExiftoolRawMetadata,
} from '../exiftool-fields';

// ----------
// * READING (persistent exiftool session, request only the allowlisted tags)
// ----------

const STRING_TAG_ARGS = [...EXIFTOOL_DEFAULT_TAGS, ...EXIFTOOL_DATE_TAGS].map((tag) => `-${tag}`);
const NUMERIC_TAG_ARGS = EXIFTOOL_NUMERIC_TAGS.map((tag) => `-${tag}#`);

export interface ExiftoolReadOptions {
  /** Read only the allowlisted keys required by the pipeline. Defaults to true. */
  useSelectedTagsOnly?: boolean;
  /** Expensive offline reverse-geocoding. Import enrichment leaves this off. */
  includeGeolocation?: boolean;
}

export function buildExiftoolReadArgs(pathArgs: string[], options?: ExiftoolReadOptions): string[] {
  const args = [...pathArgs, '-progress', '-struct', '-json'];
  if (options?.includeGeolocation) args.push(...EXIFTOOL_GEOLOCATION_ARGS, '-api', 'geolocation');
  args.push(...NUMERIC_TAG_ARGS);
  args.push(...((options?.useSelectedTagsOnly ?? true) ? STRING_TAG_ARGS : ['-all']));
  return args;
}

/** `-progress` writes one `======== <path> [n/m]` line per file to stderr. */
const PROGRESS_LINE = /^======== .* \[(\d+)\/(\d+)\]$/;

/**
 * ExifTool reports everything on stderr, including progress and its closing
 * summary ("155 image files read"), so only the lines it marks as a problem are
 * surfaced as such. Timing is logged once per command by the session.
 */
function _reportStderr(line: string, onPhotoParsed?: (current: number, total: number) => void): void {
  const trimmed = line.trim();
  const progress = PROGRESS_LINE.exec(trimmed);

  if (progress) {
    onPhotoParsed?.(Number(progress[1]), Number(progress[2]));
  } else if (/^(warning|error)\b/i.test(trimmed)) {
    warningLog('exiftool', 'read-metadata-warning', { detail: trimmed });
  } else if (trimmed) {
    debugLog('exiftool', 'read-metadata-output', { detail: trimmed });
  }
}

export async function readFromExiftool(
  path: string | string[],
  onPhotoParsed?: (current: number, total: number) => void,
  options?: ExiftoolReadOptions,
): Promise<ExiftoolRawMetadata | ExiftoolRawMetadata[]> {
  const paths = Array.isArray(path) ? path : [path];

  try {
    const stdout = await runExiftoolSession(
      buildExiftoolReadArgs(paths, options),
      (line) => _reportStderr(line, onPhotoParsed),
      'read-metadata',
    );

    if (!stdout) return [];

    return JSON.parse(stdout) as ExiftoolRawMetadata | ExiftoolRawMetadata[];
  } catch (error) {
    errorLog('exiftool', 'read-metadata-failed', error, { files: paths.length });
    throw 'Error executing exiftool. Please make sure to have installed. Use the command "exiftool -ver" to verify the installation';
  }
}
