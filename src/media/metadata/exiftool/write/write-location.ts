import { isSupportedVideoPath } from '@/common/supportedFormats';
import { normalizeCountryCode } from '../../location/countryCode';
import { composeLocationName, EditableLocation, normalizePlaceName } from '../../location/locationDraft';
import { runBatchedExiftoolWrites } from './exiftool-batch';

export interface LocationFileEntry {
  fullPath: string;
  location: EditableLocation;
}

function _pushField(args: string[], tags: readonly string[], value: string | null): void {
  const assignment = value ?? '';
  for (const tag of tags) args.push(`-${tag}=${assignment}`);
}

/** Builds one file's location write command. */
export function locationWriteArgs(entry: LocationFileEntry): string[] {
  const { latitude, longitude, altitude, sublocation, city, state, country, countryCode } = entry.location;
  const video = isSupportedVideoPath(entry.fullPath);
  const args = ['-m'];

  if (latitude === null || longitude === null) {
    args.push(video ? '-QuickTime:GPSCoordinates=' : '-GPS:All=');
  } else if (video) {
    const value = [latitude, longitude, altitude].filter((part) => part !== null).join(' ');
    args.push(`-QuickTime:GPSCoordinates=${value}`);
  } else {
    args.push(`-GPSPosition=${latitude}, ${longitude}`);
    if (altitude === null) {
      args.push('-EXIF:GPSAltitude=', '-EXIF:GPSAltitudeRef=');
    } else {
      args.push(`-EXIF:GPSAltitude#=${Math.abs(altitude)}`, `-EXIF:GPSAltitudeRef#=${altitude < 0 ? 1 : 0}`);
    }
  }

  _pushField(args, ['Location'], normalizePlaceName(sublocation));
  _pushField(args, ['City'], normalizePlaceName(city));
  _pushField(args, ['State', 'Province-State'], normalizePlaceName(state));
  _pushField(args, ['Country', 'Country-PrimaryLocationName'], normalizePlaceName(country));
  // Alpha-2 written to both the XMP and IIM code tags, so reads stay symmetric.
  _pushField(args, ['CountryCode', 'Country-PrimaryLocationCode'], normalizeCountryCode(countryCode));
  if (video) _pushField(args, ['Keys:LocationName'], composeLocationName(entry.location));

  args.push('-overwrite_original', entry.fullPath);
  return args;
}

export async function writeLocationsToFiles(
  entries: LocationFileEntry[],
  onProgress?: (processed: number, total: number) => void,
): Promise<Map<string, string>> {
  if (entries.length === 0) return new Map();

  return runBatchedExiftoolWrites(
    entries.map((entry) => ({ fullPath: entry.fullPath, args: locationWriteArgs(entry) })),
    onProgress,
  );
}
