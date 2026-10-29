import { AssetFingerprintCache } from '@/db/api/services/assetFingerprints.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { describe, expect, it, vi } from 'vitest';
import { scanForDuplicates } from './duplicateScanner';
import { DuplicateRelationship } from './duplicateTypes';
import { pickKeptAssetId } from './keepRule';
import { distanceToMatchPercent } from './perceptualHash';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@/media/thumbnails/thumbnail', () => ({
  getExistingThumbnailPath: vi.fn(),
  resolveThumbnailPath: vi.fn(),
}));

/** 0101… on every row: the most structured fingerprint there is. */
const BASE = 0x5555555555555555n;
const THRESHOLD = 7;

const _flip = (hash: bigint, bits: number[]): bigint =>
  bits.reduce((acc, bit) => acc ^ (1n << BigInt(bit)), hash);
const _range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Assets with pre-computed fingerprints (so nothing is read from disk), strongest first. */
function _library(
  hashes: Record<string, bigint>,
  { stepMs = 60_000 }: { stepMs?: number } = {},
): { assets: AssetInClient[]; cache: AssetFingerprintCache } {
  const ids = Object.keys(hashes);
  const assets = ids.map(
    (id, index) =>
      ({
        id,
        filename: `${id}.jpg`,
        filesize: 1000 - index,
        fullPath: `/photos/${id}.jpg`,
        metadata: {
          width: 100 * (ids.length - index),
          height: 100,
          date: new Date(new Date(2024, 0, 1).getTime() + index * stepMs),
          camera: { Make: 'Acme', Model: 'X1' },
        },
      }) as AssetInClient,
  );
  const cache: AssetFingerprintCache = new Map(
    assets.map((asset) => [
      asset.id,
      { size: asset.filesize, pHash: hashes[asset.id].toString(), contentHash: `sha-${asset.id}` },
    ]),
  );
  return { assets, cache };
}

describe('scanForDuplicates', () => {
  it('never shows a similar photo below the threshold against its set reference', async () => {
    // A, B and E are within 6 bits of each other, as are D and C, and both D
    // and C are within 6 of B; but A↔C and A↔D are 12 apart. The split yields
    // {A,B,E} and {D,C}; every member of the smaller {D,C} has a twin (B) in
    // the other, so merging used to join them and C, D read 81% against A.
    const B = BASE;
    const { assets, cache } = _library({
      A: _flip(B, _range(0, 5)),
      D: _flip(B, _range(6, 11)),
      B,
      C: _flip(B, [6, 7, 8, 12, 13, 14]),
      E: _flip(B, _range(0, 2)),
    });

    const { sets } = await scanForDuplicates(
      assets,
      { albumIds: [], includeSubAlbums: true, similarityThreshold: THRESHOLD },
      undefined,
      cache,
    );

    const minimum = distanceToMatchPercent(THRESHOLD);
    for (const set of sets) {
      for (const member of set.members) expect(member.matchPercent).toBeGreaterThanOrEqual(minimum);
    }
    expect(sets.map((set) => set.members.map((member) => member.asset.id).sort())).toEqual(
      expect.arrayContaining([
        ['A', 'B', 'E'],
        ['C', 'D'],
      ]),
    );
  });

  it('never chains a burst past the threshold when merging redundant sets', async () => {
    // Frames a second apart, each 2 bits from the previous one, so the whole
    // run is a burst but its ends are 12 bits apart. The split yields
    // {f0..f3} and {f4..f6}; every frame of the latter has a twin in the former,
    // and merging them used to put f6 at 81% against f0.
    const { assets, cache } = _library(
      Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`f${i}`, _flip(BASE, _range(0, 2 * i - 1))])),
      { stepMs: 1000 },
    );

    const { sets } = await scanForDuplicates(
      assets,
      { albumIds: [], includeSubAlbums: true, similarityThreshold: THRESHOLD },
      undefined,
      cache,
    );

    const minimum = distanceToMatchPercent(THRESHOLD);
    expect(sets.length).toBeGreaterThan(0);
    for (const set of sets) {
      for (const member of set.members) expect(member.matchPercent).toBeGreaterThanOrEqual(minimum);
    }
  });

  it('lists byte-identical copies as their own exact set, apart from similar photos', async () => {
    // `copy` is a byte-identical twin of `orig`, and both look like `next`. The
    // copies must not be absorbed into a Similar set (which hid them from the
    // Exact tab), and no photo may appear in two sets.
    const { assets, cache } = _library({
      orig: BASE,
      copy: BASE,
      next: _flip(BASE, [0, 1]),
      other: _flip(BASE, [0, 1, 2]),
    });
    const [orig, copy] = assets;
    copy.filesize = orig.filesize;
    cache.set('copy', { ...cache.get('orig')!, size: copy.filesize });

    const { sets } = await scanForDuplicates(
      assets,
      { albumIds: [], includeSubAlbums: true, similarityThreshold: THRESHOLD },
      undefined,
      cache,
    );

    const idsOf = (relationship: DuplicateRelationship) =>
      sets
        .filter((set) => set.relationship === relationship)
        .map((set) => set.members.map((member) => member.asset.id).sort());
    expect(idsOf(DuplicateRelationship.Exact)).toEqual([['copy', 'orig']]);
    expect(idsOf(DuplicateRelationship.Similar)).toEqual([['next', 'other']]);
  });

  it('lets the slider alone decide, even for featureless photos (fog, night)', async () => {
    // Flat fingerprints 4 bits (94%) apart: grouped when the slider allows 94%.
    const { assets, cache } = _library({ fog: 0n, night: _flip(0n, [0, 9, 18, 27]) });
    const scan = (similarityThreshold: number) =>
      scanForDuplicates(
        assets,
        { albumIds: [], includeSubAlbums: true, similarityThreshold },
        undefined,
        cache,
      );

    expect((await scan(THRESHOLD)).sets.map((set) => set.members.length)).toEqual([2]);
    expect((await scan(3)).sets).toEqual([]);
  });

  it('shows the reference first, then the closest matches, in similar sets', async () => {
    // `far` is older than `close`, so date order alone would put it second.
    const { assets, cache } = _library({
      reference: BASE,
      far: _flip(BASE, _range(0, 5)),
      close: _flip(BASE, [0, 1]),
    });

    const { sets } = await scanForDuplicates(
      assets,
      { albumIds: [], includeSubAlbums: true, similarityThreshold: THRESHOLD },
      undefined,
      cache,
    );

    expect(sets).toHaveLength(1);
    expect(sets[0].members.map((member) => member.asset.id)).toEqual(['reference', 'close', 'far']);
    expect(sets[0].representativeIndex).toBe(0);

    // Keep ties (same size and resolution) still go to the earliest photo,
    // whatever the display order.
    const tied = {
      ...sets[0],
      members: sets[0].members.map((member) => ({
        ...member,
        asset: { ...member.asset, filesize: 1, metadata: { ...member.asset.metadata, width: 1, height: 1 } },
      })) as (typeof sets)[0]['members'],
    };
    expect(pickKeptAssetId(tied, 'largest-file')).toBe('reference');
    expect(pickKeptAssetId({ ...tied, members: [...tied.members].reverse() }, 'largest-file')).toBe(
      'reference',
    );
  });
});
