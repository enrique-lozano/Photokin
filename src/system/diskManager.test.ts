import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tauri-apps/api/path')>();
  return { ...actual, sep: () => '/' };
});

const { joinPathSync } = await import('./diskManager');

describe('joinPathSync', () => {
  it('joins the segments a library path is built from', () => {
    expect(joinPathSync('/photos', '2024/Summer', 'one.jpg')).toBe('/photos/2024/Summer/one.jpg');
  });

  it('collapses the separators around each segment', () => {
    // Album relative paths are stored with leading/trailing separators, and a
    // root-level album's is just the separator itself.
    expect(joinPathSync('/photos/', '/2024/', 'one.jpg')).toBe('/photos/2024/one.jpg');
    expect(joinPathSync('/photos', '/', 'one.jpg')).toBe('/photos/one.jpg');
  });

  it('normalizes mixed separators to the OS one', () => {
    expect(joinPathSync('C:\\photos', '2024\\Summer', 'one.jpg')).toBe('C:/photos/2024/Summer/one.jpg');
  });

  it('skips empty segments', () => {
    expect(joinPathSync('/photos', '', 'one.jpg')).toBe('/photos/one.jpg');
  });
});
