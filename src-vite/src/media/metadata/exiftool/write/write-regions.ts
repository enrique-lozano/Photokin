import { AreaBox } from '@/db/models/TagRegionInfoDTO';
import { isSupportedVideoPath } from '@/common/supportedFormats';
import { AssetOrientation } from '@/media/metadata/fields/orientation';
import { orientationSwapsAxes, toRawArea } from '@/media/metadata/fields/orientedArea';
import { runBatchedExiftoolWrites } from './exiftool-batch';
import { stripControlCharacters } from './stripControlCharacters';

interface RegionsClearEntry {
  fullPath: string;
}

/** Builds one file's command to strip every face region from its metadata. */
function _regionsClearWriteArgs(entry: RegionsClearEntry): string[] {
  return ['-m', '-RegionInfo=', '-RegionInfoMP=', '-overwrite_original', entry.fullPath];
}

/** Strips face-region metadata from files. */
export async function clearRegionsInFiles(
  entries: RegionsClearEntry[],
  onProgress?: (processed: number, total: number) => void,
): Promise<Map<string, string>> {
  const photoEntries = entries.filter((entry) => !isSupportedVideoPath(entry.fullPath));
  if (photoEntries.length === 0) return new Map();

  return runBatchedExiftoolWrites(
    photoEntries.map((entry) => ({ fullPath: entry.fullPath, args: _regionsClearWriteArgs(entry) })),
    onProgress,
  );
}

export interface RegionsFileEntry {
  fullPath: string;
  /** Orientation Photokin stores for the asset (also written to the file). */
  orientation: AssetOrientation;
  /** Displayed image size as stored on the asset (already orientation-swapped). */
  displayWidth: number;
  displayHeight: number;
  /**
   * Named faces in Photokin's display-oriented, normalized, center-based space —
   * exactly what `readRegionsFromParsedTags` produces and the DB stores. The
   * writer converts each back to the file's raw frame.
   */
  regions: readonly { name: string; area: AreaBox }[];
}

/** Rounds a normalized coordinate to sane precision (sub-pixel is irrelevant). */
function _num(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

/**
 * Escapes a value for ExifTool's serialized-structure syntax
 * (https://exiftool.org/struct.html): a leading pipe escapes pipes/commas
 * anywhere and closing braces inside a field value, and a leading `{`/`[` or
 * whitespace must be pipe-escaped too. Person names are the only free text here.
 * Control characters are stripped first: they would break the line-based UTF-8
 * argfile the writer feeds exiftool and are never valid in a person name.
 */
function _escapeStructValue(value: string): string {
  const clean = stripControlCharacters(value);
  const escaped = clean.replace(/[|,}]/g, (char) => `|${char}`);
  return /^[{[\s]/.test(clean) ? `|${escaped}` : escaped;
}

/**
 * Builds one file's command to write its face regions as the MWG `RegionInfo`
 * struct (`XMP-mwg-rs`, the same tag the reader consumes). The whole struct is a
 * single serialized argument; `AppliedToDimensions` carries the raw pixel size
 * the normalized areas apply to (un-swapping the display dimensions for rotated
 * orientations). `-m` swallows minor warnings. Callers only pass assets that
 * actually have regions, so this never clears a file by writing an empty list.
 */
export function regionsWriteArgs(entry: RegionsFileEntry): string[] {
  const rotated = orientationSwapsAxes(entry.orientation);
  const rawWidth = Math.round(rotated ? entry.displayHeight : entry.displayWidth);
  const rawHeight = Math.round(rotated ? entry.displayWidth : entry.displayHeight);

  const regionList = entry.regions
    .map((region) => {
      const area = toRawArea(region.area, entry.orientation);
      const areaStruct = `Area={X=${_num(area.x)},Y=${_num(area.y)},W=${_num(area.w)},H=${_num(area.h)},Unit=normalized}`;
      return `{${areaStruct},Name=${_escapeStructValue(region.name)},Type=Face}`;
    })
    .join(',');

  const regionInfo =
    `{AppliedToDimensions={W=${rawWidth},H=${rawHeight},Unit=pixel},` + `RegionList=[${regionList}]}`;

  return ['-m', `-XMP-mwg-rs:RegionInfo=${regionInfo}`, '-overwrite_original', entry.fullPath];
}

/**
 * Writes each asset's face regions into its file's MWG `RegionInfo`. Returns a
 * map of `fullPath → error message` for the files exiftool could not update.
 * The UTF-8 argfile transport is used so non-ASCII person names and paths
 * round-trip correctly on Windows (see `executeExiftoolWithArgs`).
 */
export async function writeRegionsToFiles(
  entries: RegionsFileEntry[],
  onProgress?: (processed: number, total: number) => void,
): Promise<Map<string, string>> {
  const photoEntries = entries.filter((entry) => !isSupportedVideoPath(entry.fullPath));
  if (photoEntries.length === 0) return new Map();

  return runBatchedExiftoolWrites(
    photoEntries.map((entry) => ({ fullPath: entry.fullPath, args: regionsWriteArgs(entry) })),
    onProgress,
  );
}
