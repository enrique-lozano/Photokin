import { describe, expect, it } from 'vitest';
import { LocationSource } from '@/db/models/AssetLocation';
import { EMPTY_LOCATION } from './locationDraft';
import { editedPlaceSource, hasPlaceText, placeColumns } from './locationSource';

describe('stored location sources', () => {
  it('normalizes place values without reading files or reverse-geocoding', () => {
    expect(placeColumns({ ...EMPTY_LOCATION, city: ' Madrid ', countryCode: 'ESP' })).toMatchObject({
      locationCity: 'Madrid',
      locationCountryCode: 'ES',
    });
    expect(hasPlaceText(EMPTY_LOCATION)).toBe(false);
    expect(hasPlaceText({ ...EMPTY_LOCATION, countryCode: 'ES' })).toBe(true);
  });

  it('records new typed and GPS-derived places separately', () => {
    expect(editedPlaceSource({ ...EMPTY_LOCATION, city: 'Madrid' })).toBe('manual');
    expect(editedPlaceSource({ ...EMPTY_LOCATION, city: 'Madrid', source: LocationSource.Auto })).toBe(
      'auto',
    );
  });

  it('keeps mixed manual sublocations and GPS-derived cities library-only', () => {
    expect(
      editedPlaceSource({
        ...EMPTY_LOCATION,
        city: 'Madrid',
        sublocation: 'My venue',
        source: LocationSource.Auto,
      }),
    ).toBe('manual');
  });

  it('preserves the source of unchanged place text on coordinate-only edits', () => {
    const place = { ...EMPTY_LOCATION, city: 'Madrid' };
    expect(editedPlaceSource(place, { ...placeColumns(place), locationSource: LocationSource.File })).toBe(
      'file',
    );
    expect(editedPlaceSource(place, { ...placeColumns(place), locationSource: LocationSource.Auto })).toBe(
      'auto',
    );
  });

  it('does not mark changed embedded text as still saved in the file', () => {
    const place = { ...EMPTY_LOCATION, city: 'New city', source: LocationSource.File };
    expect(
      editedPlaceSource(place, {
        ...placeColumns({ ...place, city: 'Old city' }),
        locationSource: LocationSource.File,
      }),
    ).toBe('manual');
  });

  it('clears the source when all place text is removed, even with GPS present', () => {
    const coordinatesOnly = { ...EMPTY_LOCATION, latitude: 40, longitude: -3 };
    expect(editedPlaceSource(coordinatesOnly)).toBeNull();
  });
});
