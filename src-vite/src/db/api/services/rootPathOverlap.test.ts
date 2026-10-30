import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tauri-apps/api/path')>();
  return { ...actual, sep: () => '/' };
});

import { findRootPathOverlap } from './rootPathOverlap';

describe('findRootPathOverlap', () => {
  it('accepts folders unrelated to the library', () => {
    expect(findRootPathOverlap(['C:\\Photos\\2024'], ['C:\\Photos\\2025'])).toBeNull();
  });

  it('keeps a similarly prefixed sibling unrelated', () => {
    expect(findRootPathOverlap(['C:\\Photos\\2025-backup'], ['C:\\Photos\\2025'])).toBeNull();
  });

  it('rejects a folder already in the library, ignoring separators and case', () => {
    expect(findRootPathOverlap(['c:/photos/2025/'], ['C:\\Photos\\2025'])).toBe(
      '"2025" is already in the library.',
    );
  });

  it('rejects a folder nested inside a library root', () => {
    expect(findRootPathOverlap(['C:\\Photos\\2025\\06 - June'], ['C:\\Photos\\2025'])).toBe(
      '"06 - June" is inside "2025", which is already in the library.',
    );
  });

  it('rejects a folder containing a library root', () => {
    expect(findRootPathOverlap(['C:\\Photos\\2025'], ['C:\\Photos\\2025\\06 - June'])).toBe(
      '"2025" contains "06 - June", which is already in the library. Remove "06 - June" first, or pick another folder.',
    );
  });

  it('rejects folders that overlap within the same selection', () => {
    expect(findRootPathOverlap(['C:\\Photos\\2025', 'C:\\Photos\\2025\\06 - June'], [])).toBe(
      '"06 - June" and "2025" overlap. Select only the outer folder.',
    );
  });
});
