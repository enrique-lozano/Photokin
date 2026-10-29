import { colorFromSeed } from '@/utils/colorFromId';

type TreeColorDotProps = {
  seed: string;
  /** Explicit color. When omitted/null a stable color is derived from `seed`. */
  color?: string | null;
};

export function TreeColorDot({ seed, color }: TreeColorDotProps) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        flexShrink: 0,
        backgroundColor: color ?? colorFromSeed(seed, 'tree'),
      }}
    />
  );
}
