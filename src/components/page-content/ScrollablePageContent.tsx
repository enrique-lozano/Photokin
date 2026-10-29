import clsx from 'clsx';
import { useEffect, useRef, type ReactNode } from 'react';
import { SelectionBar } from '../selection-bar/SelectionBar';
import { ImportStatus, ImportStatusProvider } from './ImportStatus';
import './pageContent.css';

/** Height (px) of the pinned compact hero; mirrors `--compact-hero-h` in CSS. */
const COMPACT_HERO_HEIGHT = 44;

interface ScrollablePageContentProps {
  /** Big page hero (scrolls with the content). */
  hero?: ReactNode;
  /**
   * Slim (~40px) hero variant that pins to the top of the scroll area. It is
   * rendered *before* the full hero and the full hero is pulled up over it
   * (negative margin + opaque background). As the user scrolls, a scroll-linked
   * `--hero-progress` (0 → 1) drives a cross-fade between the two: the full hero
   * dissolves and lifts while the compact bar fades to fully opaque, so the
   * handoff is a single smooth morph rather than both bars showing at once.
   */
  compactHero?: ReactNode;
  /**
   * Optional block rendered directly under the hero and *above* the sticky
   * sub-header (e.g. a person's "about" strip). It scrolls away with the hero
   * rather than sticking, matching the mocks where the profile sits above the
   * filter chips.
   */
  heroBelow?: ReactNode;
  /** Sticky sub-header with temporal filters and view toggles. */
  subHeader?: ReactNode;
  /** Main body, typically a timeline gallery. */
  children: ReactNode;
}

/**
 * Single scroll region that stacks the hero, an optional compact pinned hero,
 * the sticky sub-header and the page body. The `--compact-hero-h`/`--chip-row-h`
 * custom properties it sets let every sticky layer below (chip row, timeline
 * date headers) compose their `top` offsets without hard-coding magic numbers.
 */
export function ScrollablePageContent({
  hero,
  compactHero,
  heroBelow,
  subHeader,
  children,
}: ScrollablePageContentProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasCompactHero = Boolean(compactHero);

  // Drive the hero → compact-hero cross-fade from the scroll position. We expose
  // a normalized 0→1 `--hero-progress` over the distance it takes the full hero
  // to scroll down to the compact bar's height; the CSS maps that to the two
  // bars' opacity/transform. rAF-throttled so it never blocks scrolling.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !hasCompactHero) return;

    let frame = 0;
    const update = (): void => {
      frame = 0;
      const heroEl = scroller.querySelector<HTMLElement>('.page-hero');
      const range = Math.max(1, (heroEl?.offsetHeight ?? 0) - COMPACT_HERO_HEIGHT);
      const progress = Math.min(1, Math.max(0, scroller.scrollTop / range));
      scroller.style.setProperty('--hero-progress', progress.toFixed(4));
    };
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [hasCompactHero]);

  return (
    <div className="page-scroll-layout">
      <div
        ref={scrollRef}
        className={clsx(
          'page-scroll',
          compactHero && 'page-scroll--has-compact-hero',
          heroBelow && 'page-scroll--has-hero-below',
          subHeader && 'page-scroll--has-subheader',
        )}
      >
        {compactHero}
        {hero}
        {heroBelow && <div className="page-scroll__hero-below">{heroBelow}</div>}
        {subHeader}
        <div className="page-scroll__body">
          <ImportStatusProvider>
            <ImportStatus />
            {children}
          </ImportStatusProvider>
        </div>
      </div>
      <SelectionBar />
    </div>
  );
}
