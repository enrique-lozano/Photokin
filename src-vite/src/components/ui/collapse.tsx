import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface CollapseProps {
  open: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Animates its content between hidden and shown without needing a fixed height,
 * using the `grid-template-rows: 0fr → 1fr` technique. The inner wrapper keeps
 * `overflow-hidden` so content is clipped while collapsing.
 *
 * Closed content is `invisible`, which keeps any controls inside out of the tab
 * order. Transitioning `visibility` holds it visible for the whole collapse, so
 * the content still fades out instead of vanishing.
 */
export function Collapse({ open, className, children }: CollapseProps) {
  return (
    <div
      aria-hidden={!open}
      className={cn(
        'grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out motion-reduce:transition-none',
        open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0',
        className,
      )}
    >
      {/* `-mx-1 px-1` widens the clip box just enough that focus rings on
       * edge controls aren't shaved off, without shifting the content. */}
      <div className="-mx-1 overflow-hidden px-1">{children}</div>
    </div>
  );
}
