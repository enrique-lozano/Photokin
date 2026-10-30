/**
 * A stable, evenly spread accent colour for an entity that has no colour of its
 * own (a tag or person the user never picked one for). Deterministic, so the same
 * id keeps its colour across sessions and views.
 */
export type ColorFromSeedVariant = 'entity' | 'tree';

const VARIANT_HSL: Record<ColorFromSeedVariant, { saturation: number; lightness: number }> = {
  entity: { saturation: 55, lightness: 55 },
  tree: { saturation: 66, lightness: 58 },
};

export function colorFromSeed(seed: string, variant: ColorFromSeedVariant = 'entity'): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = seed.charCodeAt(index) + ((hash << 5) - hash);
  }
  const { saturation, lightness } = VARIANT_HSL[variant];
  return `hsl(${Math.abs(hash) % 360} ${saturation}% ${lightness}%)`;
}

export function colorFromId(id: string): string {
  return colorFromSeed(id, 'entity');
}
