import type { AssetInClient } from '@/db/models/AssetInClient';
import type { TimelineSortBy } from '@/stores/settingsStore';
import { groupAssets, sortAssets, type FlatGroup } from './groupSort';

/** Sorts photos, then buckets them into sections for a non-calendar grouping. */
export function arrangeFlatSegments(
  files: AssetInClient[],
  options: {
    groupBy: 'none' | 'rating' | 'place';
    sortBy: TimelineSortBy;
    sortReversed: boolean;
    sectionReversed: boolean;
    seed: number;
    favoritesMode: boolean;
  },
): FlatGroup[] {
  const sorted = sortAssets(files, options.sortBy, options.sortReversed, options.seed);
  return groupAssets(sorted, options.groupBy, {
    reversed: options.sectionReversed,
    favoritesMode: options.favoritesMode,
  });
}
