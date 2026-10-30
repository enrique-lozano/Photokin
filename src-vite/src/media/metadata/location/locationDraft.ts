import { AssetLocation } from '@/db/models/AssetLocation';

export interface EditableLocation {
  /** Kept with editor drafts so GPS lookups are not mistaken for typed places. */
  source: AssetLocation['source'];
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  /** Free-form spot / sub-location (XMP-iptcCore:Location), e.g. "Sagrada Família". */
  sublocation: string | null;
  city: string | null;
  /** Region / state / province. */
  state: string | null;
  country: string | null;
  /**
   * Canonical ISO 3166-1 alpha-2 country code. Derived (never typed directly);
   * carried on the draft so it round-trips and is written atomically with the
   * rest of the location. Cleared when the country name is edited by hand.
   */
  countryCode: string | null;
}

export const EMPTY_LOCATION: EditableLocation = {
  source: null,
  latitude: null,
  longitude: null,
  altitude: null,
  sublocation: null,
  city: null,
  state: null,
  country: null,
  countryCode: null,
};

export function editableLocationFrom(location: AssetLocation | null): EditableLocation {
  return location
    ? {
        source: location.source ?? null,
        latitude: location.latitude ?? null,
        longitude: location.longitude ?? null,
        altitude: location.altitude ?? null,
        sublocation: location.sublocation ?? null,
        city: location.city ?? null,
        state: location.state ?? null,
        country: location.country ?? null,
        countryCode: location.countryCode ?? null,
      }
    : { ...EMPTY_LOCATION };
}

export function isValidEditableLocation(location: EditableLocation): boolean {
  const coordinatesEmpty = location.latitude === null && location.longitude === null;
  const coordinatesValid =
    location.latitude !== null &&
    location.longitude !== null &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    location.longitude >= -180 &&
    location.longitude <= 180;
  const altitudeValid = location.altitude === null || Number.isFinite(location.altitude);
  // Altitude without coordinates is meaningless, so it is only allowed alongside
  // a valid position. Place text may exist on its own (a named place, no pin).
  return coordinatesEmpty ? location.altitude === null : coordinatesValid && altitudeValid;
}

export function locationsEqual(left: EditableLocation, right: EditableLocation): boolean {
  return (
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.altitude === right.altitude &&
    left.sublocation === right.sublocation &&
    left.city === right.city &&
    left.state === right.state &&
    left.country === right.country &&
    left.countryCode === right.countryCode
  );
}

export function commonLocationValue<K extends keyof EditableLocation>(
  locations: EditableLocation[],
  key: K,
): { mixed: boolean; value: EditableLocation[K] } {
  const first = locations[0]?.[key] ?? null;
  return {
    mixed: locations.some((location) => location[key] !== first),
    value: first as EditableLocation[K],
  };
}

export function normalizePlaceName(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

/**
 * Human-readable, comma-joined label built from the structured place parts,
 * skipping blanks and case-insensitive duplicates (so "Singapore, Singapore,
 * Singapore" collapses to "Singapore"). Derived on read (not stored) for the
 * display label shown across the gallery, lightbox and Places.
 */
export function composeLocationName(parts: {
  sublocation?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): string | null {
  const seen = new Set<string>();
  const segments = [parts.sublocation, parts.city, parts.state, parts.country]
    .map((part) => normalizePlaceName(part ?? null))
    .filter((part): part is string => {
      if (!part) return false;
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return segments.length > 0 ? segments.join(', ') : null;
}

/**
 * Formats a decimal WGS84 pair for display and for the clipboard. Six decimals
 * is ~0.1 m, finer than any camera's GPS, and the output parses back through
 * {@link parseCoordinatePair} so copying from one photo can be pasted onto
 * another. Also the form map services (Google Maps, OSM) accept in their search.
 */
export function formatCoordinatePair(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

/** Parses a decimal WGS84 pair such as `40.03458, -3.59860`. */
export function parseCoordinatePair(value: string): { latitude: number; longitude: number } | null {
  const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
  const match = new RegExp(`^\\s*(${number})\\s*,\\s*(${number})\\s*$`).exec(value);
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}
