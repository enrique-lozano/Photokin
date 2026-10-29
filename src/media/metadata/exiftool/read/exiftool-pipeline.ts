import { AssetLocation, LocationSource } from '@/db/models/AssetLocation';
import { AssetMetadata } from '@/db/models/AssetMetadata';
import { AssetRights } from '@/db/models/AssetRights';
import { EMPTY_CAMERA_TAGS } from '@/db/models/CameraTags';
import { AssetMeteringMode, getMeteringModeValue } from '@/media/metadata/fields/meteringMode';
import {
  AssetOrientation,
  getOrientationValue,
  orientedDimensions,
} from '@/media/metadata/fields/orientation';
import { parseShutterSpeedMs } from '@/media/metadata/fields/shutterSpeed';
import { normalizeCountryCode } from '@/media/metadata/location/countryCode';
import { composeLocationName } from '@/media/metadata/location/locationDraft';
import type { ParsedExiftoolRegion, ParsedExiftoolTags } from '../exiftool-fields';
import {
  readField,
  readFieldByTag,
  readRawField,
  readRegionsFromParsedTags,
  readTagSetFromParsedTags,
} from './exiftool-reader';

export function mapParsedExiftoolToAssetMetadata(parsed: ParsedExiftoolTags): AssetMetadata {
  const orientation = _parseOrientation(readRawField(parsed, 'orientation'));
  const dimensions = _parseImageDimensions(parsed, orientation);

  return new AssetMetadata({
    date: readField(parsed, 'captureDate') ?? new Date(),
    height: dimensions.height,
    width: dimensions.width,
    orientation,
    duration: readField(parsed, 'duration') ?? 0,
    software: readField(parsed, 'software'),
    title: readField(parsed, 'title'),
    description: readField(parsed, 'description'),
    camera: {
      ...EMPTY_CAMERA_TAGS,
      Make: readField(parsed, 'make'),
      Model: readField(parsed, 'model'),
      Lens: readField(parsed, 'lens'),
      ISO: readField(parsed, 'iso'),
      Aperture: readField(parsed, 'aperture'),
      ExposureCompensation: readField(parsed, 'exposureCompensation'),
      ExposureProgram: readField(parsed, 'exposureProgram'),
      WhiteBalance: readField(parsed, 'whiteBalance'),
      Flash: readField(parsed, 'flash'),
      FocalLength: readField(parsed, 'focalLength'),
      ShutterSpeed: parseShutterSpeedMs(readRawField(parsed, 'shutterSpeed')),
      MeteringMode: _parseMeteringMode(readRawField(parsed, 'meteringMode')),
    },
    rating: readField(parsed, 'rating'),
    location: _parseLocation(parsed),
    rights: _parseRights(parsed),
    colorSpace: readField(parsed, 'colorSpace'),
    bitDepth: _parseBitDepth(readRawField(parsed, 'bitsPerSample')),
    lastScanned: null,
  });
}

export function getParsedTagSet(parsed: ParsedExiftoolTags): Set<string> {
  return readTagSetFromParsedTags(parsed);
}

export function getParsedRegions(parsed: ParsedExiftoolTags): ParsedExiftoolRegion[] {
  return readRegionsFromParsedTags(parsed, _parseOrientation(readRawField(parsed, 'orientation')));
}

export function hasEmbeddedCaptureDate(parsed: ParsedExiftoolTags): boolean {
  return readField(parsed, 'captureDate') != null;
}

function _parseOrientation(value: unknown): AssetOrientation {
  return typeof value === 'number' || typeof value === 'string'
    ? (getOrientationValue(value) ?? AssetOrientation.Horizontal)
    : AssetOrientation.Horizontal;
}

function _parseMeteringMode(value: unknown): AssetMeteringMode | null {
  return typeof value === 'number' || typeof value === 'string' ? getMeteringModeValue(value) : null;
}

function _parseLocation(parsed: ParsedExiftoolTags): AssetLocation | null {
  const latitude = readField(parsed, 'latitude');
  const longitude = readField(parsed, 'longitude');
  const altitudeMagnitude = readField(parsed, 'altitude');
  const altitudeRef = readField(parsed, 'altitudeRef');
  const altitude =
    altitudeMagnitude == null ? null : altitudeRef === 1 ? -Math.abs(altitudeMagnitude) : altitudeMagnitude;

  const place = _parsePlace(parsed);
  const name = composeLocationName(place);

  const empty =
    latitude == null &&
    longitude == null &&
    altitude == null &&
    place.sublocation == null &&
    place.city == null &&
    place.state == null &&
    place.country == null &&
    place.countryCode == null;

  return empty ? null : { name, latitude, longitude, altitude, ...place };
}

/**
 * Structured place text for an asset. Embedded IPTC/XMP tags always win; when
 * the file carries none, we fall back to ExifTool's offline reverse geocoder so
 * photos with GPS but no place text still appear under Places. Coordinates
 * remain the source of truth — the derived label is display/index only.
 *
 * The country code is treated separately: it is normalized to alpha-2 and, since
 * deriving it from GPS is safe (unlike guessing it from a name), the geocoded
 * `GeolocationCountryCode` backfills it even when the file embeds place text.
 */
function _parsePlace(parsed: ParsedExiftoolTags): {
  source: AssetLocation['source'];
  sublocation: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
} {
  const countryCode =
    normalizeCountryCode(readField(parsed, 'countryCode')) ??
    normalizeCountryCode(readField(parsed, 'geolocationCountryCode'));

  const embedded = {
    sublocation: readField(parsed, 'sublocation'),
    city: readField(parsed, 'city'),
    state: readField(parsed, 'state'),
    country: readField(parsed, 'country'),
  };

  if (embedded.sublocation || embedded.city || embedded.state || embedded.country) {
    return { ...embedded, countryCode, source: LocationSource.File };
  }

  return {
    source:
      readField(parsed, 'geolocationCity') ||
      readField(parsed, 'geolocationState') ||
      readField(parsed, 'geolocationCountry') ||
      readField(parsed, 'geolocationCountryCode')
        ? LocationSource.Auto
        : readField(parsed, 'countryCode')
          ? LocationSource.File
          : null,
    sublocation: null,
    city: readField(parsed, 'geolocationCity'),
    state: readField(parsed, 'geolocationState'),
    country: readField(parsed, 'geolocationCountry'),
    countryCode,
  };
}

function _parseRights(parsed: ParsedExiftoolTags): AssetRights | null {
  const rights = {
    creator: readField(parsed, 'creator'),
    copyright: readField(parsed, 'copyright'),
    credit: readField(parsed, 'credit'),
    source: readField(parsed, 'source'),
  };
  return Object.values(rights).some(Boolean) ? rights : null;
}

function _parseBitDepth(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}-bit`;
  if (typeof value !== 'string' || !value.trim()) return null;

  const trimmed = value.trim();
  const channels = trimmed.split(/\s+/).map(Number);
  return channels.every((channel) => Number.isFinite(channel) && channel === channels[0])
    ? `${channels[0]}-bit`
    : trimmed;
}

/**
 * Both sides must come from the same tag. On a cropped or exported file
 * `ExifImageWidth`/`ExifImageHeight` often still describe the original capture
 * while `ImageWidth`/`ImageHeight` describe the raster actually stored, so
 * picking each side independently can produce an aspect ratio the file never
 * had — which the gallery then uses to size the tile. `EXIFTOOL_FIELDS` declares
 * the two tag lists in matching priority order, so index `i` is the same source.
 */
function _parseImageDimensions(
  parsed: ParsedExiftoolTags,
  orientation: AssetOrientation,
): { width: number; height: number } {
  const widths = readFieldByTag(parsed, 'width');
  const heights = readFieldByTag(parsed, 'height');

  const source = widths
    .map((width, index) => ({ width, height: heights[index] }))
    .find((candidate) => candidate.width != null && candidate.height != null);

  const rotation = readField(parsed, 'rotation');
  const displayOrientation =
    rotation == null
      ? orientation
      : Math.abs(rotation % 180) === 90
        ? AssetOrientation.Rotate90CW
        : AssetOrientation.Horizontal;

  return orientedDimensions(source?.width ?? 1, source?.height ?? 1, displayOrientation);
}
