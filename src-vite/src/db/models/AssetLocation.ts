/** Current place text's relationship to the original file, not its edit history. */
export enum LocationSource {
  // * Changing stored enum values requires a database migration.

  Manual = 'manual',
  Auto = 'auto',
  File = 'file',
}

/** Geolocation associated with an asset (also the map-preview source). */
export interface AssetLocation {
  /** Null for no place text or unclassified legacy data. */
  source: LocationSource | null;
  /** Human-readable display label, composed from the structured parts below. */
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Altitude in meters. */
  altitude: number | null;
  /** Free-form spot / sub-location (XMP-iptcCore:Location). */
  sublocation: string | null;
  city: string | null;
  /** Region / state / province. */
  state: string | null;
  country: string | null;
  /** Canonical ISO 3166-1 alpha-2 country code, derived and normalized on read. */
  countryCode: string | null;
}

/** True when the location carries coordinates or at least some place text. */
export function hasLocationData(location: AssetLocation | null): location is AssetLocation {
  return (
    location !== null &&
    (Boolean(location.name) ||
      Boolean(location.city) ||
      Boolean(location.state) ||
      Boolean(location.country) ||
      Boolean(location.countryCode) ||
      Boolean(location.sublocation) ||
      (typeof location.latitude === 'number' && typeof location.longitude === 'number'))
  );
}
