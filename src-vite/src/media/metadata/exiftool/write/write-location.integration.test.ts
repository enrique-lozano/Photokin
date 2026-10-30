import { LocationSource } from '@/db/models/AssetLocation';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { useExiftoolTestSession } from '../exiftoolTestSession';
import { locationWriteArgs } from './write-location';

const runExiftool = useExiftoolTestSession();
const DEMO_DIR = path.resolve(fileURLToPath(import.meta.url), '../../../../../../../demo');
const SOURCE_CANDIDATES = ['exif-samples/jpg/gps/DSCN0010.jpg', 'images/IMG_5910.jpg'];
const source = SOURCE_CANDIDATES.map((relative) => path.join(DEMO_DIR, relative)).find(existsSync);

async function _readLocation(file: string): Promise<Record<string, unknown>> {
  const { stdout } = await runExiftool([
    '-json',
    '-n',
    '-GPSLatitude',
    '-GPSLongitude',
    '-GPSAltitude',
    '-GPSAltitudeRef',
    '-XMP-iptcCore:Location',
    '-CountryCode',
    file,
  ]);
  return (JSON.parse(stdout) as Record<string, unknown>[])[0];
}

describe.skipIf(!source)('location write on a real demo image', () => {
  const workDir = mkdtempSync(path.join(tmpdir(), 'photokin-location-'));
  afterAll(() => rmSync(workDir, { recursive: true, force: true }));

  it('round-trips signed coordinates, altitude and place name, then clears them', async () => {
    const dest = path.join(workDir, 'location.jpg');
    copyFileSync(source as string, dest);

    await runExiftool(
      locationWriteArgs({
        fullPath: dest,
        location: {
          source: LocationSource.Manual,
          latitude: -33.8568,
          longitude: 151.2153,
          altitude: -12,
          sublocation: 'Harbour test',
          city: 'Sydney',
          state: null,
          country: 'Australia',
          countryCode: 'AU',
        },
      }),
    );

    const written = await _readLocation(dest);
    expect(Number(written.GPSLatitude)).toBeCloseTo(-33.8568, 4);
    expect(Number(written.GPSLongitude)).toBeCloseTo(151.2153, 4);
    expect(Number(written.GPSAltitude)).toBeCloseTo(-12, 2);
    expect(written.GPSAltitudeRef).toBe(1);
    expect(written.Location).toBe('Harbour test');
    expect(written.CountryCode).toBe('AU');

    await runExiftool(
      locationWriteArgs({
        fullPath: dest,
        location: {
          source: null,
          latitude: null,
          longitude: null,
          altitude: null,
          sublocation: null,
          city: null,
          state: null,
          country: null,
          countryCode: null,
        },
      }),
    );

    const cleared = await _readLocation(dest);
    expect(cleared.GPSLatitude).toBeUndefined();
    expect(cleared.GPSLongitude).toBeUndefined();
    expect(cleared.GPSAltitude).toBeUndefined();
    expect(cleared.Location).toBeUndefined();
    expect(cleared.CountryCode).toBeUndefined();
  }, 10_000);
});
