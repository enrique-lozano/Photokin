import clsx from 'clsx';
import { forwardRef, type ReactNode } from 'react';

interface FilterChipProps {
  label: ReactNode;
  /** Optional trailing count shown as `· N`. */
  count?: number;
  active?: boolean;
  /** Optional leading adornment (colored dot, icon, …). */
  leading?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

/** A pill-style filter chip used in the content sub-header and overview pages. */
export const FilterChip = forwardRef<HTMLButtonElement, FilterChipProps>(function FilterChip(
  { label, count, active, leading, onClick, disabled },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      // A chip with an `active` state is a toggle, so it has to announce it.
      aria-pressed={active}
      className={clsx('filter-chip', active && 'filter-chip--active')}
      onClick={onClick}
    >
      {leading && <span className="filter-chip__leading">{leading}</span>}
      <span className="filter-chip__label">{label}</span>
      {count !== undefined && (
        <span className="filter-chip__count text-muted-foreground">· {count.toLocaleString()}</span>
      )}
    </button>
  );
});
