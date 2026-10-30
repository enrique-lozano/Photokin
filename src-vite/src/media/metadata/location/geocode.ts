import { runExiftoolSession } from '@/media/metadata/exiftool/exiftoolSession';
import { EXIFTOOL_GEOLOCATION_ARGS } from '@/media/metadata/exiftool/exiftool-fields';
import { normalizeCountryCode } from './countryCode';
import { parseCoordinatePair } from './locationDraft';

export interface GeocodedPlace {
  city: string | null;
  state: string | null;
  country: string | null;
  /** ISO 3166-1 alpha-2, from the geonames DB. */
  countryCode: string | null;
}

/**
 * Runs ExifTool's offline geocoder with a default input value and no file, so it
 * resolves purely from the bundled geonames database. Returns the first result
 * row, or `null` when nothing matched or the process failed.
 */
async function _runGeolocation(
  defaultValue: string,
  tags: string[],
  options: readonly string[] = [],
): Promise<Record<string, unknown> | null> {
  let stdout: string;
  try {
    stdout = await runExiftoolSession(
      ['-json', ...options, '-api', `geolocation=${defaultValue}`, ...tags],
      undefined,
      'geocode',
    );
  } catch {
    return null;
  }
  if (!stdout) return null;
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>[];
    return parsed[0] ?? null;
  } catch {
    return null;
  }
}

function _str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Places resolved this session, keyed by coordinate rounded to ~100 m. */
const placeCache = new Map<string, GeocodedPlace | null>();
const PLACE_CACHE_MAX_ENTRIES = 10_000;

/** Nearest city/region/country for a coordinate, from ExifTool's offline geocoder. */
export async function reverseGeocode(latitude: number, longitude: number): Promise<GeocodedPlace | null> {
  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  if (placeCache.has(cacheKey)) return placeCache.get(cacheKey) ?? null;

  const place = await _lookupPlace(latitude, longitude);

  if (placeCache.size >= PLACE_CACHE_MAX_ENTRIES) placeCache.clear();
  placeCache.set(cacheKey, place);

  return place;
}

async function _lookupPlace(latitude: number, longitude: number): Promise<GeocodedPlace | null> {
  const row = await _runGeolocation(
    `${latitude},${longitude}`,
    ['-GeolocationCity', '-GeolocationRegion', '-GeolocationCountry', '-GeolocationCountryCode'],
    EXIFTOOL_GEOLOCATION_ARGS,
  );
  if (!row) return null;

  const place: GeocodedPlace = {
    city: _str(row.GeolocationCity),
    state: _str(row.GeolocationRegion),
    country: _str(row.GeolocationCountry),
    countryCode: normalizeCountryCode(_str(row.GeolocationCountryCode)),
  };
  return place.city || place.state || place.country ? place : null;
}

/**
 * Coordinates of the best-matching city for a place name, from the offline
 * geocoder. The state is included as a hint but ExifTool falls back to the
 * largest-population match, so a mismatched region does not fail the lookup.
 */
export async function forwardGeocode(place: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): Promise<{ latitude: number; longitude: number } | null> {
  const query = [place.city, place.state, place.country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(',');
  if (!query) return null;

  const row = await _runGeolocation(query, ['-GeolocationPosition']);
  const position = row ? _str(row.GeolocationPosition) : null;
  return position ? parseCoordinatePair(position) : null;
}
