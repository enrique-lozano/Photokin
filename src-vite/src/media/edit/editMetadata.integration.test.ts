import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { useExiftoolTestSession } from '../metadata/exiftool/exiftoolTestSession';
import { mapParsedExiftoolToAssetMetadata } from '../metadata/exiftool/read/exiftool-pipeline';
import { buildExiftoolReadArgs } from '../metadata/exiftool/read/exiftool-read';
import { parseRawExiftoolTags } from '../metadata/exiftool/read/exiftool-reader';
import type { ExiftoolRawMetadata } from '../metadata/exiftool/exiftool-fields';
import { initialEdit, transformRegion } from './editGeometry';
import { editMetadataArgs } from './editMetadata';

const runExiftool = useExiftoolTestSession();
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const samples = path.join(root, 'demo/exif-samples');
const sources = [
  'jpg/Canon_40D.jpg',
  'jpg/Nikon_D70.jpg',
  'jpg/gps/DSCN0010.jpg',
  'jpg/orientation/landscape_6.jpg',
  'jpg/xmp/BlueSquare.jpg',
  'jpg/xmp/no_exif.jpg',
  'tiff/Cr\u00e9mieux11.tiff',
  'heic/spring_1440x960.heic',
  'raw/sony_alpha_a7iii_raw_image.ARW',
  'avif/mountains.avif',
  'jxl/test_0001.jxl',
];
const preservedTags = [
  'Make',
  'Model',
  'LensModel',
  'SerialNumber',
  'LensSerialNumber',
  'DateTimeOriginal',
  'CreateDate',
  'OffsetTimeOriginal',
  'SubSecTimeOriginal',
  'ExposureTime',
  'FNumber',
  'ISO',
  'FocalLength',
  'GPSLatitude',
  'GPSLatitudeRef',
  'GPSLongitude',
  'GPSLongitudeRef',
  'GPSAltitude',
  'Artist',
  'Copyright',
  'ImageDescription',
  'XMP-x:XMPToolkit',
  'IPTC:all',
  'XMP-dc:all',
  'XMP-photoshop:all',
];
const rejectedSources: Record<string, RegExp> = {
  'jpg/xmp/no_exif.jpg': /incorrect URI for xmlns:MicrosoftPhoto/,
  'heic/spring_1440x960.heic': /Item info entries are out of order/,
  'raw/sony_alpha_a7iii_raw_image.ARW': /Bad SubIFD directory/,
  'avif/mountains.avif': /Error reading PreviewImage/,
};

async function _readTags(file: string, tags: string[]): Promise<Record<string, unknown>> {
  const { stdout } = await runExiftool([
    '-json',
    '-G1',
    '-n',
    '-struct',
    ...tags.map((tag) => `-${tag}`),
    file,
  ]);
  const result = (JSON.parse(stdout) as Record<string, unknown>[])[0];
  delete result.SourceFile;
  return result;
}

async function _writeTags(args: string[], directory: string, expectedWarning?: RegExp) {
  const argfile = path.join(directory, 'arguments.txt');
  writeFileSync(argfile, `${args.join('\n')}\n`, 'utf8');
  const result = await runExiftool(['-charset', 'filename=UTF8', '-@', argfile]);
  if (expectedWarning) expect(result.stderr).toMatch(expectedWarning);
  else expect(result.stderr.trim()).toBe('');
  return result;
}

const fingerprint = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

describe('editor metadata on real demo samples', () => {
  it('restores place labels when importing an edited GPS-only copy', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'photokin-edit-location-'));
    try {
      const source = path.join(samples, 'jpg/gps/DSCN0010.jpg');
      const beforeHash = fingerprint(source);
      const target = path.join(directory, 'edited.jpg');
      writeFileSync(target, readFileSync(path.join(samples, 'jpg/Canon_40D.jpg')));
      await runExiftool(['-all=', '-overwrite_original', target]);
      await _writeTags(editMetadataArgs(source, target, 100, 68, []), directory);
      const { stdout } = await runExiftool(buildExiftoolReadArgs([target], { includeGeolocation: true }));
      const [raw] = JSON.parse(stdout) as ExiftoolRawMetadata[];
      const metadata = mapParsedExiftoolToAssetMetadata(parseRawExiftoolTags(raw));
      expect(metadata.location).toMatchObject({
        latitude: expect.closeTo(43.4674, 3),
        longitude: expect.closeTo(11.8851, 3),
        city: expect.any(String),
        country: expect.any(String),
        countryCode: 'IT',
      });
      expect(fingerprint(source)).toBe(beforeHash);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 10_000);

  it('replaces cropped face regions, round-trips names, and removes stale previews', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'photokin-edit-faces-'));
    try {
      const fixture = path.join(samples, 'jpg/Canon_40D.jpg');
      const source = path.join(directory, 'source with spaces.jpg');
      const target = path.join(directory, 'edited.png.tmp');
      writeFileSync(source, readFileSync(fixture));
      const faces = [
        { name: 'Alex, Taylor | {\u00e9}', area: { x: 0.25, y: 0.5, w: 0.2, h: 0.2 } },
        { name: 'Cropped away', area: { x: 0.8, y: 0.5, w: 0.2, h: 0.2 } },
      ];
      await _writeTags(editMetadataArgs(fixture, source, 100, 68, faces), directory);
      await _writeTags([`-ThumbnailImage<=${fixture}`, '-overwrite_original', source], directory);
      expect(await _readTags(source, ['ThumbnailImage'])).toHaveProperty('IFD1:ThumbnailImage');
      const beforeHash = fingerprint(source);
      writeFileSync(target, readFileSync(path.join(root, 'src-tauri/icons/32x32.png')));
      const edit = {
        ...initialEdit(100, 68, 'png'),
        crop: [0, 0, 0.5, 1] as [number, number, number, number],
        width: 32,
        height: 32,
      };
      const survivingFaces = faces.flatMap((face) => {
        const area = transformRegion(face.area, edit, 100, 68);
        return area ? [{ name: face.name, area }] : [];
      });
      expect(survivingFaces).toHaveLength(1);
      await _writeTags(editMetadataArgs(source, target, 32, 32, survivingFaces), directory);
      expect(await _readTags(target, ['XMP-mwg-rs:RegionInfo'])).toEqual({
        'XMP-mwg-rs:RegionInfo': {
          AppliedToDimensions: { W: 32, H: 32, Unit: 'pixel' },
          RegionList: [
            {
              Name: faces[0].name,
              Type: 'Face',
              Area: { X: 0.5, Y: 0.5, W: 0.4, H: 0.2, Unit: 'normalized' },
            },
          ],
        },
      });
      expect(
        await _readTags(target, ['ThumbnailImage', 'PreviewImage', 'JpgFromRaw', 'RegionInfoMP']),
      ).toEqual({});
      await _writeTags(editMetadataArgs(source, target, 32, 32, []), directory);
      expect(await _readTags(target, ['XMP-mwg-rs:RegionInfo', 'RegionInfoMP'])).toEqual({});
      expect(fingerprint(source)).toBe(beforeHash);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 10_000);

  it.each(sources.flatMap((source) => ['jpg', 'png', 'webp'].map((format) => ({ source, format }))))(
    'checks supported metadata or safety warnings from $source into $format',
    async ({ source, format }) => {
      const directory = mkdtempSync(path.join(tmpdir(), 'photokin-edit-metadata-'));
      try {
        const original = path.join(samples, source);
        const beforeHash = fingerprint(original);
        const before = await _readTags(original, preservedTags);
        const target = path.join(directory, `edited \u00e9 space.${format}.tmp`);
        const raster =
          format === 'jpg'
            ? readFileSync(path.join(samples, 'jpg/Canon_40D.jpg'))
            : format === 'png'
              ? readFileSync(path.join(root, 'src-tauri/icons/32x32.png'))
              : Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
        writeFileSync(target, raster);
        await runExiftool(['-all=', '-overwrite_original', target]);
        const dimensions = await _readTags(target, ['ImageWidth', 'ImageHeight']);
        const width = Number(Object.entries(dimensions).find(([key]) => key.endsWith(':ImageWidth'))?.[1]);
        const height = Number(Object.entries(dimensions).find(([key]) => key.endsWith(':ImageHeight'))?.[1]);
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
        const expectedWarning =
          rejectedSources[source] ??
          (source === 'jpg/xmp/BlueSquare.jpg' && format === 'png'
            ? /Creating non-standard IPTC in PNG/
            : undefined);
        await _writeTags(editMetadataArgs(original, target, width, height, []), directory, expectedWarning);
        expect(fingerprint(original)).toBe(beforeHash);
        if (expectedWarning) return;
        const after = await _readTags(target, preservedTags);
        if (!('XMP-x:XMPToolkit' in before)) delete after['XMP-x:XMPToolkit'];
        if (format === 'webp') {
          for (const key of Object.keys(before).filter((key) => key.startsWith('IPTC:'))) {
            expect(after).not.toHaveProperty(key);
            delete before[key];
          }
        }
        expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
        for (const [key, value] of Object.entries(before)) {
          if (typeof value === 'number')
            expect(after[key], key).toBeCloseTo(value, key.endsWith(':GPSAltitude') ? 4 : 9);
          else expect(after[key], key).toEqual(value);
        }
        const geometry = await _readTags(target, [
          'EXIF:Orientation',
          'XMP-tiff:Orientation',
          'EXIF:ExifImageWidth',
          'EXIF:ExifImageHeight',
          'ThumbnailImage',
          'PreviewImage',
          'JpgFromRaw',
          'XMP-mwg-rs:RegionInfo',
          'RegionInfoMP',
        ]);
        expect(geometry).toMatchObject({
          'IFD0:Orientation': 1,
          'XMP-tiff:Orientation': 1,
          'ExifIFD:ExifImageWidth': width,
          'ExifIFD:ExifImageHeight': height,
        });
        for (const key of Object.keys(geometry)) {
          expect(key).not.toMatch(/ThumbnailImage|PreviewImage|JpgFromRaw|RegionInfo/);
        }
        // JSON encodes the complete binary profile as base64, keeping the comparison byte-exact.
        const [originalProfile] = JSON.parse(
          (await runExiftool(['-json', '-b', '-ICC_Profile', original])).stdout,
        ) as Record<string, unknown>[];
        const [editedProfile] = JSON.parse(
          (await runExiftool(['-json', '-b', '-ICC_Profile', target])).stdout,
        ) as Record<string, unknown>[];
        expect(editedProfile.ICC_Profile).toEqual(originalProfile.ICC_Profile);
        expect(fingerprint(original)).toBe(beforeHash);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    10_000,
  );
});
