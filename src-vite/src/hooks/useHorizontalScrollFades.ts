import { useEffect, type RefObject } from 'react';

/** Width of the fade covering a scrollable edge. */
const FADE_PX = 24;

/**
 * Fades the edges of a horizontally scrolling row only where content is
 * actually cut off: no fade at rest, a left one once scrolled away from the
 * start, and none on the right at the end — so the last item is never dimmed.
 *
 * Writes `--fade-start` / `--fade-end` on the element; the row's own CSS turns
 * them into a mask.
 */
export function useHorizontalScrollFades(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;

    const update = () => {
      // Sub-pixel layout means the ends are rarely hit exactly.
      const maxScroll = scroller.scrollWidth - scroller.clientWidth;
      const start = scroller.scrollLeft > 1 ? FADE_PX : 0;
      const end = scroller.scrollLeft < maxScroll - 1 ? FADE_PX : 0;
      scroller.style.setProperty('--fade-start', `${start}px`);
      scroller.style.setProperty('--fade-end', `${end}px`);
    };

    update();
    scroller.addEventListener('scroll', update, { passive: true });

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(scroller);
    // Items come and go (chips re-rank as filters change), which changes the
    // scrollable width without resizing the row itself.
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(scroller, { childList: true });

    return () => {
      scroller.removeEventListener('scroll', update);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [ref]);
}
