import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runExiftoolSessionMock } = vi.hoisted(() => ({
  runExiftoolSessionMock: vi.fn(),
}));

vi.mock('@/media/metadata/exiftool/exiftoolSession', () => ({
  runExiftoolSession: runExiftoolSessionMock,
}));

import { forwardGeocode, reverseGeocode } from './geocode';

function _mockRow(row: Record<string, unknown> | null): void {
  runExiftoolSessionMock.mockResolvedValue(row ? JSON.stringify([row]) : '[]');
}

describe('reverseGeocode', () => {
  beforeEach(() => runExiftoolSessionMock.mockReset());

  it('resolves city/region/country/code and passes the coordinate as the default input', async () => {
    _mockRow({
      GeolocationCity: 'Aranjuez',
      GeolocationRegion: 'Madrid',
      GeolocationCountry: 'Spain',
      GeolocationCountryCode: 'ES',
    });

    const place = await reverseGeocode(40.0346, -3.5986);
    expect(place).toEqual({ city: 'Aranjuez', state: 'Madrid', country: 'Spain', countryCode: 'ES' });

    const args = runExiftoolSessionMock.mock.calls[0][0] as string[];
    expect(args).toContain('-api');
    expect(args).toContain('geolocation=40.0346,-3.5986');
    expect(args).toContain('GeolocFeature=-PPLX');
    expect(args).toContain('-GeolocationCity');
    expect(args).toContain('-GeolocationCountryCode');
  });

  it('reuses the resolved place for another photo taken in the same spot', async () => {
    _mockRow({ GeolocationCity: 'Paris', GeolocationCountry: 'France' });

    const first = await reverseGeocode(48.85837, 2.29448);
    const second = await reverseGeocode(48.85841, 2.29441);

    expect(second).toEqual(first);
    expect(runExiftoolSessionMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when nothing matched', async () => {
    _mockRow({});
    expect(await reverseGeocode(0, 0)).toBeNull();
  });

  it('returns null when exiftool returns no output', async () => {
    runExiftoolSessionMock.mockResolvedValue('');
    expect(await reverseGeocode(1, 2)).toBeNull();
  });
});

describe('forwardGeocode', () => {
  beforeEach(() => runExiftoolSessionMock.mockReset());

  it('parses GeolocationPosition into coordinates and builds a comma-joined query', async () => {
    _mockRow({ GeolocationPosition: '40.0311, -3.6025' });

    const coords = await forwardGeocode({ city: 'Aranjuez', state: null, country: 'Spain' });
    expect(coords).toEqual({ latitude: 40.0311, longitude: -3.6025 });

    const args = runExiftoolSessionMock.mock.calls[0][0] as string[];
    expect(args).toContain('geolocation=Aranjuez,Spain');
    expect(args).toContain('-GeolocationPosition');
  });

  it('does not spawn exiftool when there is no place text', async () => {
    expect(await forwardGeocode({ city: null, state: null, country: null })).toBeNull();
    expect(runExiftoolSessionMock).not.toHaveBeenCalled();
  });

  it('returns null when the returned position is malformed', async () => {
    _mockRow({ GeolocationPosition: 'not-a-position' });
    expect(await forwardGeocode({ city: 'Nowhere' })).toBeNull();
  });
});
