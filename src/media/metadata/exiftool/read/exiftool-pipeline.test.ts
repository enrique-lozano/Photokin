import { AssetMeteringMode } from '@/media/metadata/fields/meteringMode';
import { AssetOrientation } from '@/media/metadata/fields/orientation';
import { describe, expect, it } from 'vitest';
import { EXIFTOOL_FIELDS, EXIFTOOL_NUMERIC_TAGS, EXIFTOOL_SELECTED_TAGS } from '../exiftool-fields';
import {
  getParsedRegions,
  getParsedTagSet,
  hasEmbeddedCaptureDate,
  mapParsedExiftoolToAssetMetadata,
} from './exiftool-pipeline';
import { buildExiftoolReadArgs } from './exiftool-read';
import { parseRawExiftoolTags } from './exiftool-reader';

describe('parseRawExiftoolTags', () => {
  it('parses grouped keys into selected Tags-compatible shape', () => {
    const parsed = parseRawExiftoolTags({
      'EXIF:DateTimeOriginal': '2024:01:02 03:04:05',
      'EXIF:Orientation': 6,
      'File:ImageWidth': 3000,
      'File:ImageHeight': 2000,
      'XMP:ISO': 400,
      'EXIF:Aperture': 2.8,
      'EXIF:Exposure': '1/200',
      'EXIF:FocalLength': '50 mm',
      'EXIF:Make': 'Canon',
      'EXIF:Model': 'R6',
      'EXIF:Lens': 'RF50',
      'XMP:Description': 'A sample image',
      'IPTC:Keywords': ['People/Jane', 'Jane'],
      'XMP:Subject': ['Events|Party'],
      RegionInfo: {
        RegionList: [
          {
            Name: 'Jane',
            Area: { X: 0.4, Y: 0.6, W: 0.2, H: 0.3 },
          },
        ],
      },
    });

    const metadata = mapParsedExiftoolToAssetMetadata(parsed);
    expect(metadata.orientation).toBe(AssetOrientation.Rotate90CW);
    expect(metadata.width).toBe(2000);
    expect(metadata.height).toBe(3000);
    expect(metadata.camera.ISO).toBe(400);
    expect(metadata.description).toBe('A sample image');
    expect(getParsedTagSet(parsed).has('People/Jane')).toBe(true);
    expect(getParsedTagSet(parsed).has('Events/Party')).toBe(true);
    expect(getParsedRegions(parsed)).toHaveLength(1);
  });

  it('keeps the richest hierarchy for a leaf carried by several keyword schemes', () => {
    // `Keywords` (flat) has higher read priority than `TagsList`, but the deeper
    // path must still win so hierarchy is not flattened away.
    const parsed = parseRawExiftoolTags({
      'IPTC:Keywords': ['Alejandro López', 'actor'],
      'XMP-digiKam:TagsList': ['People/Alejandro López'],
      'XMP-lr:HierarchicalSubject': ['People|Alejandro López'],
    });

    const set = getParsedTagSet(parsed);
    expect(set.has('People/Alejandro López')).toBe(true);
    expect(set.has('Alejandro López')).toBe(false);
    expect(set.has('actor')).toBe(true);
  });

  it('splits the semicolon-joined Windows XPKeywords string into separate tags', () => {
    const parsed = parseRawExiftoolTags({ 'EXIF:XPKeywords': 'actor;nude;Alejandro López' });
    const set = getParsedTagSet(parsed);
    expect(set.has('actor')).toBe(true);
    expect(set.has('nude')).toBe(true);
    expect(set.has('Alejandro López')).toBe(true);
  });

  it('reads CatalogSets but ignores the write-only ACDSee Categories XML', () => {
    const parsed = parseRawExiftoolTags({
      'XMP-mediapro:CatalogSets': ['People|Bob'],
      'XMP-acdsee:Categories': '<Categories><Category Assigned="1">Alice</Category></Categories>',
    });

    const set = getParsedTagSet(parsed);
    expect(set.has('People/Bob')).toBe(true);
    // The ACDSee XML is never parsed, so its keyword does not leak in.
    expect([...set].some((path) => path.includes('Alice'))).toBe(false);
    expect([...set].some((path) => path.includes('Categories'))).toBe(false);
  });

  it('falls back safely for invalid and missing values', () => {
    const parsed = parseRawExiftoolTags({
      DateTimeOriginal: 'invalid-date',
      Orientation: 'Unknown',
      ImageWidth: 'wide' as unknown as number,
      ImageHeight: null as unknown as number,
      RegionInfo: { RegionList: [{ Name: 123, Area: {} }] },
    });

    const metadata = mapParsedExiftoolToAssetMetadata(parsed);
    expect(metadata.orientation).toBe(AssetOrientation.Horizontal);
    expect(metadata.width).toBe(1);
    expect(metadata.height).toBe(1);
    expect(metadata.camera.ISO).toBeNull();
    expect(getParsedRegions(parsed)).toEqual([]);
  });

  it('takes both dimensions from the same tag when a crop leaves stale Exif ones', () => {
    // A landscape capture cropped to a portrait: the Exif tags still describe
    // the original frame. Mixing them with the real raster would report
    // 6000x4000 and size the gallery tile to an aspect ratio that never existed.
    const parsed = parseRawExiftoolTags({
      ImageWidth: 2250,
      ImageHeight: 3000,
      ExifImageWidth: 6000,
      ExifImageHeight: 4000,
    });

    const metadata = mapParsedExiftoolToAssetMetadata(parsed);
    expect(metadata.width).toBe(2250);
    expect(metadata.height).toBe(3000);
  });

  it.each([90, -90, 270, -270])('swaps video dimensions for Rotation=%s', (rotation) => {
    const parsed = parseRawExiftoolTags({
      'QuickTime:Rotation': rotation,
      ImageWidth: 1920,
      ImageHeight: 1080,
    });

    const metadata = mapParsedExiftoolToAssetMetadata(parsed);
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1920);
    expect(buildExiftoolReadArgs(['video.mp4'])).toContain('-Rotation#');
  });

  it.each([0, 180, -180, 360])('keeps video dimensions for Rotation=%s', (rotation) => {
    const metadata = mapParsedExiftoolToAssetMetadata(
      parseRawExiftoolTags({ Rotation: rotation, ImageWidth: 1920, ImageHeight: 1080 }),
    );
    expect(metadata.width).toBe(1920);
    expect(metadata.height).toBe(1080);
  });

  it('falls back to the Exif dimensions when the raster ones are absent', () => {
    const parsed = parseRawExiftoolTags({
      ExifImageWidth: 4000,
      ExifImageHeight: 3000,
    });

    const metadata = mapParsedExiftoolToAssetMetadata(parsed);
    expect(metadata.width).toBe(4000);
    expect(metadata.height).toBe(3000);
  });

  it('drops nullish keys and ExifTool nullish sentinels', () => {
    const parsed = parseRawExiftoolTags({
      SourceFile: '/photos/a.jpg',
      ISO: null as unknown as number,
      Make: undefined as unknown as string,
      // ExifTool sometimes serializes missing values as these literals; they
      // should be treated like null/undefined and removed from the output.
      Model: 'undef',
      Lens: '  null  ',
      FocalLength: 'undefined',
      Keywords: ['Alice', null as unknown as string, 'undef'],
    });

    expect(parsed.SourceFile).toBe('/photos/a.jpg');
    expect('ISO' in parsed).toBe(false);
    expect('Make' in parsed).toBe(false);
    expect('Model' in parsed).toBe(false);
    expect('Lens' in parsed).toBe(false);
    expect('FocalLength' in parsed).toBe(false);
    expect(parsed.Keywords).toEqual(['Alice']);
  });

  it('keeps grouped-key fallback behavior and parse priorities', () => {
    const parsed = parseRawExiftoolTags({
      'EXIF:DateTimeOriginal': '2024:02:01 10:00:00',
      'QuickTime:MediaDuration': 9.5,
      'EXIF:Orientation': 6,
      ImageDescription: '',
      Description: 'fallback description',
    });

    const metadata = mapParsedExiftoolToAssetMetadata(parsed);
    expect(metadata.date.toISOString()).toBe('2024-02-01T10:00:00.000Z');
    expect(metadata.duration).toBe(9.5);
    expect(metadata.orientation).toBe(AssetOrientation.Rotate90CW);
    // A blank higher-priority tag falls through to the next one in the field.
    expect(metadata.description).toBe('fallback description');
  });

  it('prefers DateTimeOriginal over CreateDate and GPSDateTime', () => {
    const parsed = parseRawExiftoolTags({
      'EXIF:DateTimeOriginal': '2024:03:03 08:00:00+00:00',
      'EXIF:CreateDate': '2024:04:04 08:00:00+00:00',
      'Composite:GPSDateTime': '2024:01:01 08:00:00Z',
    });

    const metadata = mapParsedExiftoolToAssetMetadata(parsed);
    expect(metadata.date.toISOString()).toBe('2024-03-03T08:00:00.000Z');
  });

  it('reports whether the file carries an embedded capture date', () => {
    expect(
      hasEmbeddedCaptureDate(parseRawExiftoolTags({ 'EXIF:DateTimeOriginal': '2024:03:03 08:00:00' })),
    ).toBe(true);
    expect(hasEmbeddedCaptureDate(parseRawExiftoolTags({ 'EXIF:CreateDate': '2024:03:03 08:00:00' }))).toBe(
      true,
    );
    expect(
      hasEmbeddedCaptureDate(parseRawExiftoolTags({ 'Composite:GPSDateTime': '2024:03:03 08:00:00Z' })),
    ).toBe(true);
    expect(
      hasEmbeddedCaptureDate(parseRawExiftoolTags({ 'System:FileModifyDate': '2024:03:03 08:00:00' })),
    ).toBe(false);
    expect(hasEmbeddedCaptureDate(parseRawExiftoolTags({}))).toBe(false);
  });

  it('maps the XMP/IPTC title, trimming blanks to null', () => {
    expect(mapParsedExiftoolToAssetMetadata(parseRawExiftoolTags({ 'XMP:Title': '  Sunset  ' })).title).toBe(
      'Sunset',
    );
    expect(mapParsedExiftoolToAssetMetadata(parseRawExiftoolTags({ Title: '   ' })).title).toBeNull();
    expect(mapParsedExiftoolToAssetMetadata(parseRawExiftoolTags({})).title).toBeNull();
  });

  it('maps the XMP rating and clears the title independently of the description', () => {
    const metadata = mapParsedExiftoolToAssetMetadata(
      parseRawExiftoolTags({ Rating: 4, Description: 'A caption' }),
    );
    expect(metadata.rating).toBe(4);
    expect(metadata.title).toBeNull();
    expect(metadata.description).toBe('A caption');
  });

  it('applies GPSAltitudeRef when the camera is below sea level', () => {
    const metadata = mapParsedExiftoolToAssetMetadata(
      parseRawExiftoolTags({
        GPSLatitude: -33.8568,
        GPSLongitude: 151.2153,
        GPSAltitude: 12,
        GPSAltitudeRef: 1,
      }),
    );
    expect(metadata.location?.altitude).toBe(-12);
  });
});

describe('location name derivation', () => {
  it('keeps embedded place text over the reverse-geocoded label', () => {
    const metadata = mapParsedExiftoolToAssetMetadata(
      parseRawExiftoolTags({
        GPSLatitude: 40.0346,
        GPSLongitude: -3.5986,
        City: 'Aranjuez',
        Country: 'Spain',
        GeolocationCity: 'Ontígola',
        GeolocationRegion: 'Castile-La Mancha',
        GeolocationCountry: 'Spain',
      }),
    );
    expect(metadata.location?.name).toBe('Aranjuez, Spain');
    expect(metadata.location?.source).toBe('file');
  });

  it('falls back to the reverse-geocoded city/region/country when no place text is embedded', () => {
    const metadata = mapParsedExiftoolToAssetMetadata(
      parseRawExiftoolTags({
        GPSLatitude: 40.0346,
        GPSLongitude: -3.5986,
        GeolocationCity: 'Aranjuez',
        GeolocationRegion: 'Community of Madrid',
        GeolocationCountry: 'Spain',
      }),
    );
    expect(metadata.location?.name).toBe('Aranjuez, Community of Madrid, Spain');
    expect(metadata.location?.source).toBe('auto');
    expect(metadata.location?.latitude).toBeCloseTo(40.0346);
  });

  it('deduplicates repeated geocoded segments', () => {
    const metadata = mapParsedExiftoolToAssetMetadata(
      parseRawExiftoolTags({
        GPSLatitude: 1.29,
        GPSLongitude: 103.85,
        GeolocationCity: 'Singapore',
        GeolocationRegion: 'Singapore',
        GeolocationCountry: 'Singapore',
      }),
    );
    expect(metadata.location?.name).toBe('Singapore');
  });

  it('leaves the name null when only coordinates are known', () => {
    const metadata = mapParsedExiftoolToAssetMetadata(
      parseRawExiftoolTags({ GPSLatitude: 12.34, GPSLongitude: 56.78 }),
    );
    expect(metadata.location?.name).toBeNull();
    expect(metadata.location?.source).toBeNull();
    expect(metadata.location?.latitude).toBeCloseTo(12.34);
  });
});

describe('shutter speed and metering mode mapping', () => {
  it('converts ExifTool shutter speed strings into milliseconds', () => {
    const fractional = mapParsedExiftoolToAssetMetadata(
      parseRawExiftoolTags({ 'EXIF:ShutterSpeed': '1/250' }),
    );
    expect(fractional.camera.ShutterSpeed).toBe(4);

    const longExposure = mapParsedExiftoolToAssetMetadata(
      parseRawExiftoolTags({ 'EXIF:ShutterSpeed': '2"' }),
    );
    expect(longExposure.camera.ShutterSpeed).toBe(2000);

    const missing = mapParsedExiftoolToAssetMetadata(parseRawExiftoolTags({}));
    expect(missing.camera.ShutterSpeed).toBeNull();
  });

  it('coerces the allowlisted date tags to a Date', () => {
    const parsed = parseRawExiftoolTags({ 'EXIF:DateTimeOriginal': '2024:01:02 03:04:05' });
    expect(parsed.DateTimeOriginal).toBeInstanceOf(Date);
  });

  it('keeps non-date string tags whose names contain date-like substrings', () => {
    // `Creator` contains "creat" — a name heuristic would wrongly treat it as a date.
    const parsed = parseRawExiftoolTags({ 'XMP:Creator': 'John Smith' });
    expect(parsed.Creator).toBe('John Smith');

    const rights = mapParsedExiftoolToAssetMetadata(parsed).rights;
    expect(rights?.creator).toBe('John Smith');
  });

  it('keeps the raw string when a date tag is unparseable', () => {
    const parsed = parseRawExiftoolTags({ 'EXIF:DateTimeOriginal': 'not a date' });
    expect(parsed.DateTimeOriginal).toBe('not a date');
  });

  it('maps numeric and string metering modes onto the AssetMeteringMode enum', () => {
    const numeric = mapParsedExiftoolToAssetMetadata(parseRawExiftoolTags({ 'EXIF:MeteringMode': 5 }));
    expect(numeric.camera.MeteringMode).toBe(AssetMeteringMode.MultiSegment);

    const labeled = mapParsedExiftoolToAssetMetadata(
      parseRawExiftoolTags({ 'EXIF:MeteringMode': 'Center-weighted average' }),
    );
    expect(labeled.camera.MeteringMode).toBe(AssetMeteringMode.CenterWeightedAverage);

    const unknown = mapParsedExiftoolToAssetMetadata(
      parseRawExiftoolTags({ 'EXIF:MeteringMode': 'definitely not a mode' }),
    );
    expect(unknown.camera.MeteringMode).toBeNull();
  });
});

describe('mapParsedExiftoolToAssetMetadata', () => {
  it('maps parsed metadata into AssetMetadata', () => {
    // `-Duration#` disables PrintConv so Duration comes back as raw seconds
    // rather than a formatted string like "0:01:02".
    const parsed = parseRawExiftoolTags({
      CreateDate: '2024:05:01 12:30:00+02:00',
      Duration: 62.5,
      ImageWidth: 1920,
      ImageHeight: 1080,
      Keywords: ['Alice'],
    });
    const metadata = mapParsedExiftoolToAssetMetadata(parsed);

    expect(metadata.duration).toBe(62.5);
    expect(getParsedTagSet(parsed).has('Alice')).toBe(true);
    expect(metadata.width).toBe(1920);
    expect(metadata.height).toBe(1080);
    expect(metadata.date.toISOString()).toBe('2024-05-01T10:30:00.000Z');
  });
});

describe('ExifTool selected tag allowlist', () => {
  it('lists every tag declared by a field exactly once', () => {
    const declaredTags = [
      ...new Set(Object.values(EXIFTOOL_FIELDS).flatMap((spec) => spec.tags as readonly string[])),
    ];

    // The allowlist is partitioned by field `kind`, so a kind that is not routed
    // into one of the tag groups would silently drop its tags from every read.
    expect([...EXIFTOOL_SELECTED_TAGS].sort()).toEqual(declaredTags.sort());

    // ACDSee `Categories` is write-only, so it is deliberately not declared.
    expect(EXIFTOOL_SELECTED_TAGS).not.toContain('Categories');
  });

  it('requests numeric tags with the # suffix so values arrive unformatted', () => {
    const args = buildExiftoolReadArgs(['photo.jpg']);

    for (const tag of EXIFTOOL_NUMERIC_TAGS) {
      expect(args).toContain(`-${tag}#`);
      expect(args).not.toContain(`-${tag}`);
    }

    // String tags must stay unsuffixed, or exiftool returns raw codes instead
    // of the human-readable values the pipeline maps.
    expect(args).toContain('-Make');
    expect(args).not.toContain('-Make#');
  });

  it('uses selected tags by default and supports full-read opt-out', () => {
    const defaultArgs = buildExiftoolReadArgs(['photo.jpg']);
    expect(defaultArgs).toEqual(expect.arrayContaining(['-SourceFile', '-DateTimeOriginal', '-RegionInfo']));
    expect(defaultArgs).not.toContain('-all');

    const fullReadArgs = buildExiftoolReadArgs(['photo.jpg'], { useSelectedTagsOnly: false });
    expect(fullReadArgs).toContain('-all');
    expect(fullReadArgs).not.toContain('-SourceFile');
  });

  it('defers the offline reverse geocoder unless explicitly requested', () => {
    const args = buildExiftoolReadArgs(['photo.jpg']);
    expect(args).not.toContain('geolocation');
    expect(args).toEqual(
      expect.arrayContaining(['-GeolocationCity', '-GeolocationRegion', '-GeolocationCountry']),
    );

    const geocoded = buildExiftoolReadArgs(['photo.jpg'], { includeGeolocation: true });
    expect(geocoded).toContain('-api');
    expect(geocoded).toContain('geolocation');
    expect(geocoded).toContain('GeolocFeature=-PPLX');
  });
});
