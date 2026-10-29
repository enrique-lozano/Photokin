import { FaceStatus } from '@/db/models/TagRegionInfoDTO';
import { encodeEmbedding } from '@/media/embeddings';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchFacesToPeople, selectDiverseReferences } from './faceEmbeddingStore';

const { query, selectFromDBMock } = vi.hoisted(() => {
  const queryBuilder = {
    innerJoin: vi.fn(),
    select: vi.fn(),
    where: vi.fn(),
  };
  queryBuilder.innerJoin.mockReturnValue(queryBuilder);
  queryBuilder.select.mockReturnValue(queryBuilder);
  queryBuilder.where.mockReturnValue(queryBuilder);

  return {
    query: queryBuilder,
    selectFromDBMock: vi.fn(),
  };
});

vi.mock('@/db/connection/db.service', () => ({
  executeInDB: vi.fn(),
  selectFromDB: selectFromDBMock,
}));
vi.mock('@/db/connection/kysely', () => ({
  kyselyDB: {
    selectFrom: vi.fn(() => query),
  },
}));

describe('matchFacesToPeople', () => {
  beforeEach(() => {
    selectFromDBMock.mockReset();
    query.where.mockClear();
  });

  it('rechecks existing suggestions and reports stale ones as unmatched candidates', async () => {
    selectFromDBMock
      .mockResolvedValueOnce([
        { tagId: 'person-a', embedding: encodeEmbedding([1, 0]) },
        { tagId: 'person-b', embedding: encodeEmbedding([0, 1]) },
      ])
      .mockResolvedValueOnce([
        {
          regionId: 'existing-suggestion',
          assetId: 'selected-photo',
          tagId: 'person-b',
          embedding: encodeEmbedding([0, 1]),
        },
        {
          regionId: 'stale-suggestion',
          assetId: 'selected-photo',
          tagId: 'person-a',
          embedding: encodeEmbedding([-1, 0]),
        },
        {
          regionId: 'outside-scope',
          assetId: 'other-photo',
          tagId: null,
          embedding: encodeEmbedding([1, 0]),
        },
      ]);

    await expect(
      matchFacesToPeople({
        candidateAssetIds: ['selected-photo'],
        matchMaxDistance: 0.2,
        maxRefsPerTag: 10,
      }),
    ).resolves.toEqual({
      referencePeople: 2,
      candidates: [
        { regionId: 'existing-suggestion', previousTagId: 'person-b', matchedTagId: 'person-b' },
        { regionId: 'stale-suggestion', previousTagId: 'person-a', matchedTagId: null },
      ],
    });

    expect(query.where).toHaveBeenCalledWith('tagRegionInfo.faceStatus', '=', FaceStatus.Pending);
  });

  it('matches against the diverse reference subset rather than the first rows', async () => {
    // Five confirmed faces for one person, four of them near-identical. Capped
    // at two, row order would keep two of the duplicates and miss the outlier.
    selectFromDBMock
      .mockResolvedValueOnce([
        { tagId: 'person-a', embedding: encodeEmbedding([1, 0.01]) },
        { tagId: 'person-a', embedding: encodeEmbedding([1, 0.02]) },
        { tagId: 'person-a', embedding: encodeEmbedding([1, 0.03]) },
        { tagId: 'person-a', embedding: encodeEmbedding([1, 0.04]) },
        { tagId: 'person-a', embedding: encodeEmbedding([0, 1]) },
      ])
      .mockResolvedValueOnce([
        {
          regionId: 'looks-like-the-outlier',
          assetId: 'photo',
          tagId: null,
          embedding: encodeEmbedding([0, 1]),
        },
      ]);

    await expect(matchFacesToPeople({ matchMaxDistance: 0.2, maxRefsPerTag: 2 })).resolves.toMatchObject({
      candidates: [{ regionId: 'looks-like-the-outlier', previousTagId: null, matchedTagId: 'person-a' }],
    });
  });
});

describe('selectDiverseReferences', () => {
  const identity = (embedding: Float32Array) => embedding;
  const vector = (...values: number[]) => new Float32Array(values);

  it('returns every item when the cap is not reached', () => {
    const items = [vector(1, 0), vector(0, 1)];
    expect(selectDiverseReferences(items, identity, 5)).toEqual(items);
  });

  it('keeps the spread of a person instead of near-duplicates', () => {
    const frontal = vector(1, 0);
    const nearDuplicate = vector(0.999, 0.044);
    const outlier = vector(-1, 0);

    const picked = selectDiverseReferences([frontal, nearDuplicate, outlier], identity, 2);

    // The outlier earns a slot, and the two near-identical faces share one
    // between them rather than filling the whole set.
    expect(picked).toContain(outlier);
    expect(picked.filter((item) => item === frontal || item === nearDuplicate)).toHaveLength(1);
  });

  it('is stable across runs so suggestions do not churn', () => {
    const items = [vector(1, 0), vector(0.7, 0.7), vector(0, 1), vector(-0.7, 0.7), vector(-1, 0)];

    const first = selectDiverseReferences(items, identity, 3);
    expect(selectDiverseReferences(items, identity, 3)).toEqual(first);
  });
});
