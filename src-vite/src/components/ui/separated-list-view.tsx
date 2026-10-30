import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './separated-list-view.css';

type Props<T> = {
  items: readonly T[];
  itemKey: (item: T) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  /** Initial estimate only; rendered rows are measured, including separators. */
  estimateSize: number | ((item: T) => number);
  separatorBuilder?: (item: T, index: number) => ReactNode;
  emptyState?: ReactNode;
  className?: string;
  'aria-label': string;
};

const FOCUSABLE =
  ':is(button, a[href], input, textarea, select, [tabindex], [contenteditable="true"]):not(:disabled):not([tabindex="-1"]):not([type="hidden"])';

/**
 * Lazy, measured list for bounded scroll containers. Use stable item keys and
 * give the list a new React key when a filter/sort should reset its scroll.
 */
export function SeparatedListView<T>({
  items,
  itemKey,
  renderItem,
  estimateSize,
  separatorBuilder,
  emptyState,
  className,
  'aria-label': ariaLabel,
}: Props<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [pendingFocus, setPendingFocus] = useState<{ index: number; last: boolean } | null>(null);
  const getItemKey = useCallback((index: number) => itemKey(items[index]), [items, itemKey]);
  const estimateRowSize = useCallback(
    (index: number) => (typeof estimateSize === 'number' ? estimateSize : estimateSize(items[index])),
    [items, estimateSize],
  );
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: estimateRowSize,
    overscan: 5,
    initialRect: { width: 0, height: 600 },
    rangeExtractor: (range) => {
      const indices = new Set(defaultRangeExtractor(range));
      // Scrolling must not unmount the active control and drop keyboard focus.
      for (const index of [focusedIndex, pendingFocus?.index ?? null]) {
        if (index !== null && index < items.length) indices.add(index);
      }
      return [...indices].sort((a, b) => a - b);
    },
  });

  useLayoutEffect(() => {
    if (pendingFocus === null) return;
    const row = scrollRef.current?.querySelector<HTMLElement>(`[data-index="${pendingFocus.index}"]`);
    const controls = row?.querySelectorAll<HTMLElement>(FOCUSABLE);
    const control = controls?.[pendingFocus.last ? controls.length - 1 : 0];
    control?.focus({ preventScroll: true });
    setPendingFocus(null);
  }, [pendingFocus]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (event.key !== 'Tab' && (target.matches('input, textarea, select') || target.isContentEditable))
      return;
    const row = target.closest<HTMLElement>('[data-index]');
    if (!row || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = Number(row.dataset.index);
    let next: number;
    if (event.key === 'ArrowDown') next = index + 1;
    else if (event.key === 'ArrowUp') next = index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'Tab') {
      const controls = [...row.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const boundary = event.shiftKey ? controls[0] : controls.at(-1);
      if (target !== boundary) return;
      next = index + (event.shiftKey ? -1 : 1);
    } else return;
    if (next < 0 || next >= items.length) return;
    event.preventDefault();
    setPendingFocus({ index: next, last: event.key === 'Tab' && event.shiftKey });
    virtualizer.scrollToIndex(next, { align: 'auto' });
  };

  return (
    <div
      ref={scrollRef}
      className={cn('separated-list-view', className)}
      role="list"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      onFocusCapture={(event) => {
        const row = event.target.closest<HTMLElement>('[data-index]');
        if (row) setFocusedIndex(Number(row.dataset.index));
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedIndex(null);
      }}
    >
      {items.length === 0 ? (
        emptyState
      ) : (
        <div className="separated-list-view__content" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              ref={virtualizer.measureElement}
              data-index={row.index}
              role="listitem"
              aria-posinset={row.index + 1}
              aria-setsize={items.length}
              className="separated-list-view__item"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              {renderItem(items[row.index], row.index)}
              {row.index < items.length - 1 && separatorBuilder?.(items[row.index], row.index)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
