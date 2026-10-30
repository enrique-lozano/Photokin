/**
 * Walks up from `element` and returns the nearest vertically-scrollable
 * ancestor, to be used as an IntersectionObserver `root` or as the reference
 * box for windowed rendering. Returns `null` (the viewport) when no scrollable
 * ancestor exists.
 */
export function getScrollParent(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null;

  while (current) {
    const { overflowY } = window.getComputedStyle(current);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}
