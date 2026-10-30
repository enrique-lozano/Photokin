import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { useExiftoolTestSession } from '../exiftoolTestSession';
import { buildExiftoolReadArgs } from './exiftool-read';
import type { ExiftoolRawMetadata } from '../exiftool-fields';
import { parseRawExiftoolTags } from './exiftool-reader';
import { mapParsedExiftoolToAssetMetadata } from './exiftool-pipeline';

/**
 * End-to-end coverage for the metadata pipeline against the real sample images
 * in `demo/exif-samples`. It runs a persistent, bundled ExifTool with the production
 * args ({@link buildExiftoolReadArgs}) and feeds the JSON through the same
 * parser + mapper the app uses, so a regression in tag selection, parsing or
 * mapping is caught on genuine files rather than hand-written fixtures.
 *
 * The suite skips only when its demo images are absent; ExifTool comes from the
 * existing test dependency, so no system installation is needed.
 */
const runExiftool = useExiftoolTestSession();

const DEMO_JPG_DIR = path.resolve(fileURLToPath(import.meta.url), '../../../../../../../demo/exif-samples/jpg');

const demoImagesAvailable = existsSync(path.join(DEMO_JPG_DIR, 'Canon_40D.jpg'));

async function _readDemoImage(relativePath: string) {
  const absolutePath = path.join(DEMO_JPG_DIR, relativePath);
  const { stdout } = await runExiftool(buildExiftoolReadArgs([absolutePath]));

  const [raw] = JSON.parse(stdout) as ExiftoolRawMetadata[];
  return mapParsedExiftoolToAssetMetadata(parseRawExiftoolTags(raw));
}

describe.skipIf(!demoImagesAvailable)('metadata pipeline on real demo images', () => {
  it('reads camera, dimensions and capture date from a Canon EXIF sample', async () => {
    const metadata = await _readDemoImage('Canon_40D.jpg');

    expect(metadata.camera.Make).toBe('Canon');
    expect(metadata.camera.Model).toBe('Canon EOS 40D');
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);
    expect(metadata.date.getUTCFullYear()).toBe(2008);
    expect(metadata.title).toBeNull();
  });

  it('extracts the embedded title and long description', async () => {
    const metadata = await _readDemoImage('long_description.jpg');

    expect(metadata.title).toBe('030904-A-2140D-006');
    expect(metadata.description).toContain('Operation Mountain Viper');
  });

  it('resolves GPS coordinates into a location', async () => {
    const metadata = await _readDemoImage('gps/DSCN0010.jpg');

    expect(metadata.camera.Make).toBe('NIKON');
    expect(metadata.location).not.toBeNull();
    expect(metadata.location?.latitude).toBeCloseTo(43.4674, 3);
    expect(metadata.location?.longitude).toBeCloseTo(11.8851, 3);
  });
});
