import { VerticalDivider } from '@/components/ui/verticalDivider';
import { useHorizontalScrollFades } from '@/hooks/useHorizontalScrollFades';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { useRef, type ReactNode } from 'react';

interface ContentSubHeaderProps {
  /** Left side: temporal/quick filter chips for the current item. */
  filters?: ReactNode;
  /** Right side: view toggles (include children, zoom on faces, group-by, …). */
  actions?: ReactNode;
}

/**
 * Secondary header below the hero. Hosts the intelligent quick-filter chips on
 * the left and per-view toggles on the right. Sticks to the top of the scroll
 * area so the filters stay reachable while browsing the timeline.
 *
 * Renders nothing when there are neither filter chips nor right-side actions,
 * so an item with no useful recommendations doesn't show an empty bar.
 */
export function ContentSubHeader({ filters, actions }: ContentSubHeaderProps) {
  const filtersRef = useRef<HTMLDivElement>(null);
  useHorizontalWheelScroll(filtersRef);
  useHorizontalScrollFades(filtersRef);

  const hasFilters = Array.isArray(filters) ? filters.length > 0 : Boolean(filters);

  if (!hasFilters && !actions) {
    return null;
  }

  return (
    <div className="content-subheader">
      <div ref={filtersRef} className="content-subheader__filters">
        {filters}
      </div>
      {hasFilters && actions && <VerticalDivider className="mx-2" />}
      {actions && <div className="content-subheader__actions">{actions}</div>}
    </div>
  );
}
