import { describe, expect, it, vi } from 'vitest';
const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../exiftoolSession', () => ({ runExiftoolSession: run }));
import { loadFullMetadata, metadataRows } from './metadataExplorer';
describe('metadata explorer', () => {
  it('preserves grouped tags and structured values', () => {
    expect(metadataRows({ SourceFile: 'private', 'EXIF:Make': 'Canon', 'XMP:Subject': ['A', 'B'] })).toEqual([
      { group: 'EXIF', tag: 'Make', value: 'Canon' },
      { group: 'XMP', tag: 'Subject', value: '["A","B"]' },
    ]);
  });
  it('orders preferred groups first while preserving tag and remaining group order', () => {
    const raw = {
      'ExifTool:ExifToolVersion': 13.58,
      'IPTC:Keywords': 'Travel',
      'XMP:Subject': ['A', 'B'],
      'ICC_Profile:ProfileDescription': 'sRGB',
      'File:FileType': 'JPEG',
      'EXIF:Make': 'Canon',
      'Composite:ImageSize': '100x100',
      'EXIF:Model': 'EOS',
    };
    const keys = Object.keys(raw);
    expect(metadataRows(raw).map(({ group, tag }) => `${group}:${tag}`)).toEqual([
      'Composite:ImageSize',
      'EXIF:Make',
      'EXIF:Model',
      'File:FileType',
      'XMP:Subject',
      'IPTC:Keywords',
      'ExifTool:ExifToolVersion',
      'ICC_Profile:ProfileDescription',
    ]);
    expect(Object.keys(raw)).toEqual(keys);
  });
  it('omits absent groups and treats ungrouped tags as File', () => {
    expect(metadataRows({ 'PNG:ColorType': 'RGB', 'XMP:Rating': 5, FileName: 'photo.png' })).toEqual([
      { group: 'File', tag: 'FileName', value: 'photo.png' },
      { group: 'XMP', tag: 'Rating', value: '5' },
      { group: 'PNG', tag: 'ColorType', value: 'RGB' },
    ]);
    expect(metadataRows({ SourceFile: 'private' })).toEqual([]);
  });
  it('deduplicates requests and invalidates on a photo revision or reload', async () => {
    run.mockResolvedValue('[{"EXIF:Make":"Canon","ExifTool:ExifToolVersion":13.58}]');
    await Promise.all([loadFullMetadata('cache.jpg', 1), loadFullMetadata('cache.jpg', 1)]);
    expect(run).toHaveBeenCalledTimes(1);
    await loadFullMetadata('cache.jpg', 2);
    await loadFullMetadata('cache.jpg', 2, true);
    expect(run).toHaveBeenCalledTimes(3);
  });
  it('allows retry after a failed read', async () => {
    run.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce('[{}]');
    await expect(loadFullMetadata('retry.jpg')).rejects.toThrow('Unavailable');
    await expect(loadFullMetadata('retry.jpg')).resolves.toMatchObject({ rows: [] });
  });
});
