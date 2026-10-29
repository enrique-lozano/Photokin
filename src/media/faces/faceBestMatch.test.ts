import { describe, expect, it, vi } from 'vitest';
import { bestMatchAmong } from './faceBestMatch';

vi.mock('@/db/connection/db.service', () => ({
  executeInDB: vi.fn(),
  selectFromDB: vi.fn(),
  selectFirstFromDB: vi.fn(),
}));
vi.mock('@/db/connection/kysely', () => ({ kyselyDB: {} }));
vi.mock('@/stores/faceScanSettingsStore', () => ({ useFaceScanSettingsStore: { getState: vi.fn() } }));

const refs = new Map([
  ['ana', [[1, 0]]],
  [
    'ben',
    [
      [0.8, 0.6],
      [0, 1],
    ],
  ],
]);

describe('bestMatchAmong', () => {
  it('picks the person with the most similar reference', () => {
    const match = bestMatchAmong([0.6, 0.8], refs, 0.5);
    expect(match?.tagId).toBe('ben');
    expect(match?.similarity).toBeCloseTo(0.96);
  });

  it('returns null when nobody is within the distance', () => {
    expect(bestMatchAmong([-1, 0], refs, 0.5)).toBeNull();
  });
});
