import { expect, it } from 'vitest';
import { editMetadataArgs } from './editMetadata';

it('copies all writable metadata and ICC before fixing geometry and stale previews', () => {
  const args = editMetadataArgs('source.jpg', 'output.jpg', 640, 480, []);
  expect(args.slice(0, 4)).toEqual(['-tagsFromFile', 'source.jpg', '-all:all', '-ICC_Profile']);
  expect(args).toContain('-XMP-x:XMPToolkit');
  expect(args).toContain('-EXIF:Orientation#=1');
  expect(args).toContain('-EXIF:ExifImageWidth=640');
  expect(args).toContain('-ThumbnailImage=');
  expect(args).toContain('-XMP-mwg-rs:RegionInfo=');
  expect(args.at(-1)).toBe('output.jpg');
});

it('rewrites confirmed regions after clearing stale ones and rejects argfile injection', () => {
  const args = editMetadataArgs('source.jpg', 'output.jpg', 640, 480, [
    { name: 'Someone', area: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 } },
  ]);
  expect(args.findIndex((arg) => arg.startsWith('-XMP-mwg-rs:RegionInfo={'))).toBeGreaterThan(
    args.indexOf('-XMP-mwg-rs:RegionInfo='),
  );
  expect(() => editMetadataArgs('source\n-execute.jpg', 'output.jpg', 1, 1, [])).toThrow();
});
