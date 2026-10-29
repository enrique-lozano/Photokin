import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

interface VerticalDividerProps {
  /** Extra classes, e.g. a different height or margin for a taller row. */
  className?: string;
}

/**
 * Hairline vertical rule that splits clusters inside a horizontal row (selected
 * chips vs suggestions, filters vs view toggles, …). Decorative only, so it is
 * hidden from assistive tech.
 */
export const VerticalDivider = forwardRef<HTMLSpanElement, VerticalDividerProps>(function VerticalDivider(
  { className },
  ref,
) {
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={cn('mx-0.5 h-[22px] w-px shrink-0 self-center rounded-[1px] bg-border', className)}
    />
  );
});
