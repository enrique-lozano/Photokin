import { describe, expect, it } from 'vitest';
import { RatingMode } from '@/common/ratingModeOptions';
import { buildChipCandidates } from './contentFilterChips';

describe('buildChipCandidates quality chips', () => {
  const emptyScope = {
    years: [],
    people: [],
    places: [],
  };

  it('surfaces Favorites in favorites rating mode only', () => {
    const { toCount } = buildChipCandidates({ ...emptyScope, ratingMode: RatingMode.Favorites });
    const qualityIds = toCount.filter((chip) => chip.group === 'quality').map((chip) => chip.id);

    expect(qualityIds).toEqual(['favorites']);
  });

  it('surfaces Top rated in stars rating mode only', () => {
    const { toCount } = buildChipCandidates({ ...emptyScope, ratingMode: RatingMode.Stars });
    const qualityIds = toCount.filter((chip) => chip.group === 'quality').map((chip) => chip.id);

    expect(qualityIds).toEqual(['top-rated']);
  });
});
