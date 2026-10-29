import clsx from 'clsx';
import type { KeyboardEvent, ReactNode } from 'react';
import './segmented.css';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Optional leading icon (inline layout) — e.g. Gallery/Faces. */
  icon?: ReactNode;
  /** Optional trailing/stacked count — e.g. the Duplicates type filter. */
  count?: ReactNode;
};

/**
 * The single segmented (tab) control used across the app: the Gallery/Faces
 * view switch, the Duplicates type filter and the Calendar month/day switch all
 * render through this. Visual language is one filled pill track with a
 * primary-tinted active segment; the two layout knobs cover every existing use:
 *
 * - `fill` — segments share the full width (`flex: 1`) instead of hugging their
 *   content. Used by the Duplicates and Calendar switches.
 * - `stacked` — label sits over a larger count rather than inline. Used by the
 *   Duplicates type filter.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  fill = false,
  stacked = false,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  fill?: boolean;
  stacked?: boolean;
  className?: string;
}) {
  /**
   * A tablist is a single tab stop: arrows move between segments (and select
   * them, as the panels swap instantly) while Tab leaves the control.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();

    const current = options.findIndex((option) => option.value === value);
    const nextIndex = (current + step + options.length) % options.length;

    onChange(options[nextIndex].value);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={clsx('segmented', fill && 'segmented--fill', stacked && 'segmented--stacked', className)}
      onKeyDown={handleKeyDown}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={option.label}
            title={option.label}
            tabIndex={selected ? 0 : -1}
            className={clsx('segmented__option hover:text-secondary-navbar-foreground', selected && 'active')}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            <span className="segmented__label">{option.label}</span>
            {option.count !== undefined && (
              <span className="segmented__count font-semibold">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
