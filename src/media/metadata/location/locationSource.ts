import { LocationSource, type AssetLocation } from '@/db/models/AssetLocation';
import { normalizeCountryCode } from './countryCode';
import { normalizePlaceName } from './locationDraft';

export const PLACE_KEYS = ['city', 'state', 'country', 'sublocation', 'countryCode'] as const;
type Place = Pick<AssetLocation, (typeof PLACE_KEYS)[number]>;

export function placeColumns(place: Place) {
  return {
    locationCity: normalizePlaceName(place.city),
    locationState: normalizePlaceName(place.state),
    locationCountry: normalizePlaceName(place.country),
    locationSublocation: normalizePlaceName(place.sublocation),
    locationCountryCode: normalizeCountryCode(place.countryCode),
  };
}

export function hasPlaceText(place: Place): boolean {
  return Object.values(placeColumns(place)).some(Boolean);
}

export function editedPlaceSource(
  place: Place & { source: AssetLocation['source'] },
  current?: ReturnType<typeof placeColumns> & { locationSource: AssetLocation['source'] },
): AssetLocation['source'] {
  if (!hasPlaceText(place)) return null;
  const columns = placeColumns(place);
  if (
    current &&
    Object.entries(columns).every(([key, value]) => current[key as keyof typeof columns] === value)
  ) {
    return current.locationSource;
  }
  return place.source === LocationSource.Auto && !place.sublocation
    ? LocationSource.Auto
    : LocationSource.Manual;
}
