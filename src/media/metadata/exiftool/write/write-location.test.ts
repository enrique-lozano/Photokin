import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditableLocation } from '../../location/locationDraft';

const executeExiftoolWithArgs = vi.fn();

// Place names are full of accents, so these writes must use the UTF-8 argfile
// transport; mocking that seam also asserts they never fall back to raw argv.
vi.mock('./exiftool-run', () => ({
  executeExiftoolWithArgs: (...args: unknown[]) => executeExiftoolWithArgs(...args),
}));

// The pre-write probe (see preserveOnWrite) finds nothing here, so these
// assertions stay about the location tags alone.
vi.mock('../exiftoolSession', () => ({
  runExiftoolSession: vi.fn().mockResolvedValue('[]'),
}));

import { locationWriteArgs, writeLocationsToFiles } from './write-location';

const EMPTY: EditableLocation = {
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

describe('locationWriteArgs', () => {
  it('writes image coordinates atomically with altitude and its below-sea-level ref', () => {
    const args = locationWriteArgs({
      fullPath: 'C:/photos/dead-sea.jpg',
      location: { ...EMPTY, latitude: 31.5, longitude: 35.5, altitude: -430 },
    });

    expect(args).toContain('-GPSPosition=31.5, 35.5');
    expect(args).toContain('-EXIF:GPSAltitude#=430');
    expect(args).toContain('-EXIF:GPSAltitudeRef#=1');
    expect(args).toContain('-overwrite_original');
  });

  it('clears image GPS and the country code when the location is empty', () => {
    const args = locationWriteArgs({ fullPath: 'C:/photos/a.jpg', location: EMPTY });
    expect(args).toContain('-GPS:All=');
    expect(args).toContain('-CountryCode=');
    expect(args).toContain('-Country-PrimaryLocationCode=');
  });

  it('uses QuickTime coordinates for video files', () => {
    const args = locationWriteArgs({
      fullPath: 'C:/clips/a.mp4',
      location: { ...EMPTY, latitude: -33.86, longitude: 151.21, altitude: 12 },
    });
    expect(args).toContain('-QuickTime:GPSCoordinates=-33.86 151.21 12');
    expect(args.some((arg) => arg.startsWith('-GPSPosition='))).toBe(false);
  });

  it('writes structured place text to the canonical tags and clears the empty ones', () => {
    const args = locationWriteArgs({
      fullPath: 'C:/photos/a.jpg',
      location: { ...EMPTY, sublocation: 'Retiro Park', city: 'Madrid', country: 'Spain', countryCode: 'ES' },
    });

    expect(args).toContain('-Location=Retiro Park');
    expect(args).toContain('-City=Madrid');
    expect(args).toContain('-Country=Spain');
    expect(args).toContain('-Country-PrimaryLocationName=Spain');
    // Alpha-2 country code written to both the XMP and IIM code tags.
    expect(args).toContain('-CountryCode=ES');
    expect(args).toContain('-Country-PrimaryLocationCode=ES');
    // The region was empty, so its tags are cleared rather than left stale.
    expect(args).toContain('-State=');
    expect(args).toContain('-Province-State=');
  });

  it('normalizes an alpha-3 country code to alpha-2 on write', () => {
    const args = locationWriteArgs({
      fullPath: 'C:/photos/a.jpg',
      location: { ...EMPTY, country: 'Spain', countryCode: 'ESP' },
    });
    expect(args).toContain('-CountryCode=ES');
    expect(args).toContain('-Country-PrimaryLocationCode=ES');
  });

  it('preserves a user-entered city instead of deleting it when only coordinates change', () => {
    const args = locationWriteArgs({
      fullPath: 'C:/photos/a.jpg',
      location: { ...EMPTY, latitude: 40.4, longitude: -3.7, city: 'Madrid', country: 'Spain' },
    });
    expect(args).toContain('-City=Madrid');
    expect(args).toContain('-Country=Spain');
    expect(args).toContain('-GPSPosition=40.4, -3.7');
  });
});

describe('writeLocationsToFiles', () => {
  beforeEach(() => {
    executeExiftoolWithArgs.mockReset();
    executeExiftoolWithArgs.mockResolvedValue({ code: 0 });
  });

  it('batches multiple locations into one ExifTool process', async () => {
    await writeLocationsToFiles([
      { fullPath: 'C:/photos/a.jpg', location: { ...EMPTY, latitude: 1, longitude: 2 } },
      { fullPath: 'C:/photos/b.jpg', location: { ...EMPTY, latitude: 3, longitude: 4 } },
    ]);

    expect(executeExiftoolWithArgs).toHaveBeenCalledTimes(1);
    const args = executeExiftoolWithArgs.mock.calls[0][0] as string[];
    expect(args.filter((arg) => arg === '-execute')).toHaveLength(2);
    expect(args).toContain('C:/photos/a.jpg');
    expect(args).toContain('C:/photos/b.jpg');
  });

  it('does not spawn ExifTool when there is nothing to write', async () => {
    await writeLocationsToFiles([]);
    expect(executeExiftoolWithArgs).not.toHaveBeenCalled();
  });
});
