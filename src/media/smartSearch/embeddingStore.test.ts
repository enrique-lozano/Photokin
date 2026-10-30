import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeEmbedding } from '@/media/embeddings';
import { clearAssetEmbeddings, searchAssets } from './embeddingStore';
import { minMatchSimilarity } from './search';

const { selectFromDB } = vi.hoisted(() => ({ selectFromDB: vi.fn() }));

vi.mock('@/db/connection/db.service', () => ({ selectFromDB, executeInDB: vi.fn() }));
vi.mock('@/db/connection/kysely', () => ({
  kyselyDB: { selectFrom: () => ({ select: () => ({}) }), deleteFrom: () => ({}) },
}));
vi.mock('./clipSidecar', () => ({ embedText: vi.fn() }));

/** `matches` photos point at the query, the rest are orthogonal to it. */
function _library(size: number, matches: number) {
  return Array.from({ length: size }, (_, index) => ({
    assetId: `asset-${index}`,
    embedding: encodeEmbedding(index < matches ? [1, 0] : [0, 1]),
  }));
}

describe('searchAssets match cutoff', () => {
  beforeEach(async () => {
    await clearAssetEmbeddings();
  });

  it.each([
    [10, 2],
    [30, 15],
    [3000, 900],
  ])('keeps every match in a library of %i with %i matches', async (size, matches) => {
    selectFromDB.mockResolvedValue(_library(size, matches));
    const hits = await searchAssets([1, 0], { limit: 5000, maxDistance: 0.5 });
    expect(hits).toHaveLength(matches);
  });

  it('returns nothing when no photo matches', async () => {
    selectFromDB.mockResolvedValue(_library(30, 0));
    expect(await searchAssets([1, 0], { limit: 50, maxDistance: 0.5 })).toEqual([]);
  });

  it('ranks everything when there is no cutoff', async () => {
    selectFromDB.mockResolvedValue(_library(30, 2));
    const hits = await searchAssets([1, 0], { limit: 50 });
    expect(hits).toHaveLength(30);
    expect(hits.slice(0, 2).map((hit) => hit.assetId)).toEqual(['asset-0', 'asset-1']);
  });
});

describe('minMatchSimilarity', () => {
  it('turns a SigLIP model scale and bias into a similarity floor', () => {
    const similarity = minMatchSimilarity('ViT-B-16-SigLIP2__webli');
    const probability = 1 / (1 + Math.exp(-(112.67 * similarity - 16.772)));
    expect(probability).toBeCloseTo(0.01, 6);
  });

  it('uses the measured floor for plain CLIP models', () => {
    expect(minMatchSimilarity('ViT-B-32__laion2b-s34b-b79k')).toBe(0.236);
  });
});
