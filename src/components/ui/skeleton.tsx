import * as React from 'react';

import { cn } from '@/lib/utils';
import './skeleton.css';

/**
 * Animated shimmer placeholder for content that is still loading. Fills its
 * positioned parent by default; pass sizing/rounding via `className`. Override
 * `--skeleton-base` / `--skeleton-highlight` to adapt it to dark surfaces.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('skeleton', className)} {...props} />;
}

export { Skeleton };
