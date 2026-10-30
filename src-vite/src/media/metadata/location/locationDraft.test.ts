import { describe, expect, it } from 'vitest';
import { LocationSource } from '@/db/models/AssetLocation';
import {
  commonLocationValue,
  composeLocationName,
  editableLocationFrom,
  EMPTY_LOCATION,
  formatCoordinatePair,
  isValidEditableLocation,
  locationsEqual,
  normalizePlaceName,
  parseCoordinatePair,
  type EditableLocation,
} from './locationDraft';

describe('location drafts', () => {
  const madrid: EditableLocation = {
    source: LocationSource.File,
    latitude: 40.4168,
    longitude: -3.7038,
    altitude: 667,
    sublocation: null,
    city: 'Madrid',
    state: null,
    country: 'Spain',
    countryCode: 'ES',
  };

  it('creates an empty editable location from missing metadata', () => {
    expect(editableLocationFrom(null)).toEqual(EMPTY_LOCATION);
  });

  it('normalizes missing fields in a partial location instead of treating them as mixed', () => {
    const partial = { name: null } as Parameters<typeof editableLocationFrom>[0];
    expect(editableLocationFrom(partial)).toEqual(EMPTY_LOCATION);
  });

  it('accepts complete coordinates or a fully empty coordinate pair', () => {
    expect(isValidEditableLocation(madrid)).toBe(true);
    expect(isValidEditableLocation({ ...madrid, latitude: null, longitude: null, altitude: null })).toBe(
      true,
    );
    expect(isValidEditableLocation({ ...madrid, latitude: null, longitude: null, altitude: 10 })).toBe(false);
    expect(isValidEditableLocation({ ...madrid, longitude: null })).toBe(false);
    expect(isValidEditableLocation({ ...madrid, latitude: 91 })).toBe(false);
    expect(isValidEditableLocation({ ...madrid, longitude: -181 })).toBe(false);
  });

  it('treats place-only entries (no coordinates) as valid', () => {
    expect(
      isValidEditableLocation({
        ...EMPTY_LOCATION,
        city: 'Madrid',
        country: 'Spain',
      }),
    ).toBe(true);
  });

  it('reports common and mixed values across a selection', () => {
    expect(commonLocationValue([madrid, { ...madrid }], 'city')).toEqual({ mixed: false, value: 'Madrid' });
    expect(commonLocationValue([madrid, { ...madrid, city: 'Toledo' }], 'city')).toEqual({
      mixed: true,
      value: 'Madrid',
    });
  });

  it('compares all editable fields and normalizes place names', () => {
    expect(locationsEqual(madrid, { ...madrid })).toBe(true);
    expect(locationsEqual(madrid, { ...madrid, altitude: null })).toBe(false);
    expect(locationsEqual(madrid, { ...madrid, city: 'Toledo' })).toBe(false);
    expect(locationsEqual(madrid, { ...madrid, countryCode: 'US' })).toBe(false);
    expect(normalizePlaceName('  Retiro Park  ')).toBe('Retiro Park');
    expect(normalizePlaceName('   ')).toBeNull();
  });

  it('composes a deduplicated, comma-joined display label', () => {
    expect(composeLocationName({ sublocation: 'Retiro Park', city: 'Madrid', country: 'Spain' })).toBe(
      'Retiro Park, Madrid, Spain',
    );
    expect(composeLocationName({ city: 'Singapore', state: 'Singapore', country: 'Singapore' })).toBe(
      'Singapore',
    );
    expect(composeLocationName({})).toBeNull();
    expect(composeLocationName({ city: '  ', country: null })).toBeNull();
  });

  it('parses valid decimal coordinate pairs and rejects malformed or out-of-range values', () => {
    expect(parseCoordinatePair('40.03458352078279, -3.5986046774145812')).toEqual({
      latitude: 40.03458352078279,
      longitude: -3.5986046774145812,
    });
    expect(parseCoordinatePair('  +40.5, .25  ')).toEqual({ latitude: 40.5, longitude: 0.25 });
    expect(parseCoordinatePair('40.5 -3.5')).toBeNull();
    expect(parseCoordinatePair('91, 0')).toBeNull();
    expect(parseCoordinatePair('0, -181')).toBeNull();
  });

  it('formats coordinate pairs so that copied values can be pasted back', () => {
    expect(formatCoordinatePair(41.77561, 2.44016)).toBe('41.775610, 2.440160');
    expect(formatCoordinatePair(-0.5, 0)).toBe('-0.500000, 0.000000');

    // Round-trips: what the clipboard receives is what the paste field accepts.
    expect(parseCoordinatePair(formatCoordinatePair(40.03458352078279, -3.5986046774145812))).toEqual({
      latitude: 40.034584,
      longitude: -3.598605,
    });
  });
});
