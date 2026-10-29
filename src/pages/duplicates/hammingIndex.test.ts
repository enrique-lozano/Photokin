import { describe, expect, it } from 'vitest';
import { HammingBkTree, hammingPointDistance, PerceptualHashPoint } from './hammingIndex';

function _points(count: number): PerceptualHashPoint[] {
  let state = 0x12345678;
  const next = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
  return Array.from({ length: count }, (_, index) => ({
    hi: next(),
    lo: next(),
    representative: `asset-${index}`,
  }));
}

describe('HammingBkTree', () => {
  it('returns exactly the same neighbours as a brute-force search', () => {
    const tree = new HammingBkTree();
    const inserted: PerceptualHashPoint[] = [];

    for (const point of _points(200)) {
      for (const threshold of [0, 4, 10, 19]) {
        const expected = inserted
          .filter((candidate) => hammingPointDistance(point, candidate) <= threshold)
          .map((candidate) => candidate.representative)
          .sort();
        expect(tree.within(point, threshold).sort()).toEqual(expected);
      }
      tree.insert(point);
      inserted.push(point);
    }
  });
});
