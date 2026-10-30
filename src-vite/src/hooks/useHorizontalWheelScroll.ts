import { useEffect, type RefObject } from 'react';

/**
 * Lets a plain mouse wheel scroll a horizontally-scrolling row (filter chips,
 * lightbox filmstrip, …), which the browser otherwise only does for trackpad
 * horizontal input.
 *
 * The listener is attached natively (not via React's `onWheel`) so it can be
 * non-passive and call `preventDefault`, keeping the wheel from bubbling to the
 * page scroller. When the row isn't overflowing there is nothing to scroll, so
 * the event is left alone and the page scrolls as usual.
 */
export function useHorizontalWheelScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;

    const handleWheel = (event: WheelEvent) => {
      // Only translate predominantly-vertical wheel input; leave native
      // horizontal (trackpad) scrolling untouched.
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (scroller.scrollWidth <= scroller.clientWidth) return;
      scroller.scrollLeft += event.deltaY;
      event.preventDefault();
    };

    scroller.addEventListener('wheel', handleWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', handleWheel);
  }, [ref]);
}
