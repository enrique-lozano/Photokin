import type { Icon } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { useImportStatus } from '@/components/page-content/ImportStatus';
import { cn } from '@/lib/utils';

export type EmptyStateSize = 'page' | 'panel' | 'sidebar';

export interface EmptyStateProps {
  icon: Icon;
  title: string;
  description?: ReactNode;
  /** One or more buttons offering the obvious next step. */
  action?: ReactNode;
  /**
   * Swaps the copy for a provisional message while an import still has this
   * kind of work pending, so an unfinished library never reads as final.
   */
  pendingImport?: 'metadata' | 'places';
  /**
   * `panel` is the compact variant for side panes and dialog lists; `sidebar`
   * is the left-aligned hint that sits where the rows of a left navigator go.
   */
  size?: EmptyStateSize;
  className?: string;
}

/**
 * The one way to say "there is nothing here": a tinted icon, a short title, an
 * optional explanation and the next step. It centers itself within a minimum
 * height, so it sits the same whether its parent is a flex column or a block.
 */
export function EmptyState({
  icon: IconComponent,
  title,
  description,
  action,
  pendingImport,
  size = 'page',
  className,
}: EmptyStateProps) {
  const status = useImportStatus();
  const pending =
    pendingImport &&
    status?.data &&
    (status.data.scanning ||
      status.data.metadata > 0 ||
      (pendingImport === 'places' && status.data.locations > 0));
  const pendingDescription = status?.running
    ? 'Results may appear as more photos are processed.'
    : 'Import is unfinished. These results are not complete yet.';
  const isPage = size === 'page';
  const shownDescription = pending ? pendingDescription : description;
  const shownTitle = pending ? 'No matches yet' : title;

  if (size === 'sidebar') {
    return (
      <div
        data-slot="empty-state"
        data-size={size}
        className={cn(
          'empty-state mx-0.5 my-1 rounded-lg border border-dashed border-secondary-navbar-foreground/15 px-3 py-2.5 text-left',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-secondary-navbar-foreground">
          <IconComponent size={16} stroke={1.75} className="shrink-0 text-muted-foreground" aria-hidden />
          <h3 className="m-0 min-w-0 truncate text-sm font-medium">{shownTitle}</h3>
        </div>
        {shownDescription && (
          <p className="mt-1 pl-6 text-xs text-pretty text-muted-foreground">{shownDescription}</p>
        )}
        {action && <div className="mt-2 flex flex-wrap items-center gap-2 pl-6 empty:hidden">{action}</div>}
      </div>
    );
  }

  return (
    <div
      data-slot="empty-state"
      data-size={size}
      className={cn(
        'empty-state flex w-full flex-1 flex-col items-center justify-center text-center',
        isPage ? 'min-h-[min(28rem,60vh)] px-6 py-12' : 'px-4 py-8',
        className,
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center justify-center border border-primary/15 bg-primary/10 text-primary',
          isPage ? 'mb-4 size-14 rounded-2xl' : 'mb-3 size-10 rounded-xl',
        )}
      >
        <IconComponent size={isPage ? 26 : 20} stroke={1.75} aria-hidden />
      </div>

      <h3 className={cn('text-foreground', isPage ? 'text-base font-semibold' : 'text-sm font-medium')}>
        {shownTitle}
      </h3>

      {shownDescription && (
        <p
          className={cn(
            'text-pretty text-muted-foreground',
            isPage ? 'mt-1.5 max-w-sm text-sm' : 'mt-1 max-w-64 text-xs',
          )}
        >
          {shownDescription}
        </p>
      )}

      {action && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-center gap-2 empty:hidden',
            isPage ? 'mt-5' : 'mt-3',
          )}
        >
          {action}
        </div>
      )}
    </div>
  );
}
