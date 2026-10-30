import { cn } from '@/lib/utils';
import { colorFromSeed } from '@/utils/colorFromId';
import { IconCheck, IconX } from '@tabler/icons-react';

/** A small curated palette of pleasant, distinguishable tag colors. */
const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
  '#78716c',
];

interface TagColorPickerProps {
  value: string | null;
  onChange: (color: string | null) => void;
  /** Seed used to preview the automatic color when no color is selected. */
  seed?: string;
}

export function TagColorPicker({ value, onChange, seed }: TagColorPickerProps) {
  const autoColor = colorFromSeed(seed ?? '', 'tree');
  const isCustom = value !== null && !PRESET_COLORS.includes(value.toLowerCase());

  return (
    <div role="group" aria-label="Color" className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        title="Automatic color"
        aria-label="Use automatic color"
        className={cn(
          'relative flex h-7 w-7 items-center justify-center rounded-full border-2 transition',
          value === null ? 'border-foreground' : 'border-transparent hover:border-muted-foreground/50',
        )}
        style={{ backgroundColor: autoColor }}
      >
        {value === null && <IconCheck size={14} className="text-white drop-shadow-sm" />}
      </button>

      <span className="mx-1 h-6 w-px bg-border" aria-hidden />

      {PRESET_COLORS.map((preset) => {
        const isSelected = value?.toLowerCase() === preset.toLowerCase();
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            title={preset}
            aria-label={`Select color ${preset}`}
            className={cn(
              'relative flex h-7 w-7 items-center justify-center rounded-full border-2 transition',
              isSelected ? 'border-foreground' : 'border-transparent hover:border-muted-foreground/50',
            )}
            style={{ backgroundColor: preset }}
          >
            {isSelected && <IconCheck size={14} className="text-white drop-shadow-sm" />}
          </button>
        );
      })}

      <label
        title="Custom color"
        className={cn(
          'relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 transition',
          isCustom ? 'border-foreground' : 'border-dashed border-muted-foreground/50 hover:border-foreground',
        )}
        style={isCustom ? { backgroundColor: value! } : undefined}
      >
        {!isCustom && (
          <span className="bg-[conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)] absolute inset-0 opacity-70" />
        )}
        {isCustom && <IconCheck size={14} className="text-white drop-shadow-sm" />}
        <input
          type="color"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={value ?? '#3b82f6'}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>

      {value !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <IconX size={14} />
          Clear
        </button>
      )}
    </div>
  );
}
