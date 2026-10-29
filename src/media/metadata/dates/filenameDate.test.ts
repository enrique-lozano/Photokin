import { describe, expect, it } from 'vitest';
import { parseCaptureDateFromFilename } from './filenameDate';

const iso = (date: Date | null) => date?.toISOString() ?? null;

describe('parseCaptureDateFromFilename', () => {
  it('parses the common IMG_/VID_/PXL_ camera pattern', () => {
    expect(iso(parseCaptureDateFromFilename('IMG_20220701_113932.jpg'))).toBe('2022-07-01T11:39:32.000Z');
    expect(iso(parseCaptureDateFromFilename('VID_20220701_113932.mp4'))).toBe('2022-07-01T11:39:32.000Z');
  });

  it('tolerates a trailing millisecond block (Pixel)', () => {
    expect(iso(parseCaptureDateFromFilename('PXL_20220701_113932123.jpg'))).toBe('2022-07-01T11:39:32.000Z');
  });

  it('parses dashed date and time separators', () => {
    expect(iso(parseCaptureDateFromFilename('2022-07-01 11.39.32.jpg'))).toBe('2022-07-01T11:39:32.000Z');
    expect(iso(parseCaptureDateFromFilename('Screenshot_2022-07-01-11-39-32.png'))).toBe(
      '2022-07-01T11:39:32.000Z',
    );
  });

  it('parses a compact run with no separators', () => {
    expect(iso(parseCaptureDateFromFilename('20220701113932.jpg'))).toBe('2022-07-01T11:39:32.000Z');
  });

  it('falls back to midnight when only a date is present', () => {
    expect(iso(parseCaptureDateFromFilename('IMG-20220701-WA0001.jpg'))).toBe('2022-07-01T00:00:00.000Z');
    expect(iso(parseCaptureDateFromFilename('2022-07-01.jpg'))).toBe('2022-07-01T00:00:00.000Z');
  });

  it('returns null when there is no date', () => {
    expect(parseCaptureDateFromFilename('vacation.jpg')).toBeNull();
    expect(parseCaptureDateFromFilename('DSC00123.jpg')).toBeNull();
  });

  it('rejects impossible dates', () => {
    expect(parseCaptureDateFromFilename('2022-13-40_000000.jpg')).toBeNull();
    expect(parseCaptureDateFromFilename('20220230_120000.jpg')).toBeNull();
  });

  it('ignores long unrelated digit runs', () => {
    expect(parseCaptureDateFromFilename('1655678901234.jpg')).toBeNull();
  });
});
