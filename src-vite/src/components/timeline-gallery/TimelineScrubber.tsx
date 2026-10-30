import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDate } from '../../utils/dateFormatter';
import { getScrollParent } from '../../utils/scrollParent';
import './timelineScrubber.css';

/**
 * Section metadata needed by the scrubber. Sections are expected to be ordered
 * newest-first (the same order the timeline renders them top-to-bottom).
 */
export type ScrubberSection = {
  /** "YYYY-MM" */
  sectionId: string;
  year: number;
  month: number;
  /** Estimated pixel height used to lay the section out in the grid. */
  estimatedHeight: number;
};

type TimelineScrubberProps = {
  sections: ScrubberSection[];
};

type ScrubberSegment = ScrubberSection & {
  /** Height of this segment inside the scrubber track (px). */
  height: number;
  /** Offset of this segment from the top of the track (px). */
  top: number;
  hasLabel: boolean;
  hasDot: boolean;
};

const SCRUBBER_WIDTH = 56;
const PADDING_TOP = 36;
const PADDING_BOTTOM = 16;
const MIN_YEAR_LABEL_DISTANCE = 18;
const MIN_DOT_DISTANCE = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Vertical space (px) the pinned headers occupy at the top of the scroll
 * container *right now*. The top header morphs from the tall page hero to the
 * slim compact hero as the user scrolls, tracked by `--hero-progress` (0 → 1),
 * so we interpolate the hero portion between its full and compact heights and
 * add the (always-pinned) chip row. This exactly matches the bottom edge of the
 * sticky header stack throughout the transition, so the scrubber never overlaps
 * the heroes/sub-header at any scroll position.
 */
function measureHeaderOffset(scrollParent: HTMLElement): number {
  const cs = getComputedStyle(scrollParent);
  const compactH = parseFloat(cs.getPropertyValue('--compact-hero-h')) || 0;
  const chipH = parseFloat(cs.getPropertyValue('--chip-row-h')) || 0;
  if (compactH <= 0) return chipH;

  const progress = clamp(parseFloat(cs.getPropertyValue('--hero-progress')) || 0, 0, 1);
  const bigHeroH = scrollParent.querySelector<HTMLElement>('.page-hero')?.offsetHeight ?? compactH;
  return bigHeroH + (compactH - bigHeroH) * progress + chipH;
}

/**
 * Builds the scrubber segments from the timeline sections.
 *
 * The layout technique follows the Google Photos "scrubbable grid" design:
 * each month becomes a segment whose
 * height is proportional to its share of the (estimated) timeline height. Year
 * labels and month dots are then placed greedily, skipping any that would be
 * too close to the previous one so the bar stays readable.
 */
function buildSegments(sections: ScrubberSection[], trackHeight: number): ScrubberSegment[] {
  const total = sections.reduce((acc, s) => acc + s.estimatedHeight, 0);
  if (total <= 0 || trackHeight <= 0) return [];

  // Process oldest-first so the oldest month always gets a label/dot, then
  // reverse back to newest-first for display (matching the grid order).
  const reversed = [...sections].reverse();

  const segments: ScrubberSegment[] = [];
  let previousLabeledYear: number | undefined;
  let spanWithoutLabel = 0;
  let spanWithoutDot = 0;

  for (const section of reversed) {
    const height = (section.estimatedHeight / total) * trackHeight;
    const segment: ScrubberSegment = {
      ...section,
      height,
      top: 0,
      hasLabel: false,
      hasDot: false,
    };

    if (previousLabeledYear === undefined) {
      segment.hasLabel = true;
      segment.hasDot = true;
      previousLabeledYear = section.year;
      spanWithoutLabel = 0;
      spanWithoutDot = 0;
    } else {
      if (section.year !== previousLabeledYear && spanWithoutLabel > MIN_YEAR_LABEL_DISTANCE) {
        segment.hasLabel = true;
        previousLabeledYear = section.year;
        spanWithoutLabel = 0;
      }
      if (height > 4 && spanWithoutDot > MIN_DOT_DISTANCE) {
        segment.hasDot = true;
        spanWithoutDot = 0;
      }
    }

    spanWithoutLabel += height;
    spanWithoutDot += height;
    segments.push(segment);
  }

  segments.reverse();

  let top = 0;
  for (const segment of segments) {
    segment.top = top;
    top += segment.height;
  }

  return segments;
}

export function TimelineScrubber({ sections }: TimelineScrubberProps) {
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // The only geometry we read from the DOM: the scroll container's visible
  // height (for the track math) and the live header offset. Everything else —
  // top/left/width and staying pinned while scrolling — is handled by the
  // sticky rail in CSS, relative to the scroll container itself.
  const [viewportHeight, setViewportHeight] = useState(0);
  const [headerOffset, setHeaderOffset] = useState(0);
  const [scrollable, setScrollable] = useState(false);
  const [indicatorY, setIndicatorY] = useState(0);
  const [currentLabel, setCurrentLabel] = useState('');
  const [isScrolling, setIsScrolling] = useState(false);

  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverY, setHoverY] = useState(0);
  const [hoverLabel, setHoverLabel] = useState('');

  const trackHeight = Math.max(0, viewportHeight - headerOffset - PADDING_TOP - PADDING_BOTTOM);

  const segments = useMemo(() => buildSegments(sections, trackHeight), [sections, trackHeight]);

  const formatMonthYear = useCallback((year: number, month: number) => {
    return formatDate(new Date(year, month - 1, 1), { month: 'short', year: 'numeric' });
  }, []);

  // Measure the scroll container's visible height and current header offset.
  // The sticky rail handles the actual positioning, so there is no rect/scroll
  // bookkeeping here — just the two numbers the track layout needs.
  useEffect(() => {
    const measure = () => {
      let scrollParent = scrollParentRef.current;
      if (!scrollParent || !scrollParent.isConnected) {
        scrollParent = getScrollParent(document.getElementById('grid'));
        scrollParentRef.current = scrollParent;
      }
      if (!scrollParent) return;

      setViewportHeight(scrollParent.clientHeight);
      setHeaderOffset(measureHeaderOffset(scrollParent));
      setScrollable(scrollParent.scrollHeight - scrollParent.clientHeight > 4);
    };

    measure();

    const grid = document.getElementById('grid');
    const scrollParent = getScrollParent(grid);
    scrollParentRef.current = scrollParent;

    const resizeObserver = new ResizeObserver(measure);
    if (scrollParent) resizeObserver.observe(scrollParent);
    if (grid) resizeObserver.observe(grid);

    window.addEventListener('resize', measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [sections]);

  /** Find the section currently at the top of the viewport via DOM offsets. */
  const scrollTopToSegment = useCallback(
    (scrollTop: number): { index: number; within: number } | null => {
      if (segments.length === 0) return null;

      let low = 0;
      let high = segments.length - 1;
      let found = 0;

      while (low <= high) {
        const mid = (low + high) >> 1;
        const el = document.getElementById(segments[mid].sectionId);
        const offsetTop = el?.offsetTop ?? 0;
        if (offsetTop <= scrollTop) {
          found = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      const el = document.getElementById(segments[found].sectionId);
      const offsetTop = el?.offsetTop ?? 0;
      const offsetHeight = el?.offsetHeight ?? 1;
      const within = clamp((scrollTop - offsetTop) / offsetHeight, 0, 1);
      return { index: found, within };
    },
    [segments],
  );

  /** Map a position on the scrubber track to a scrollTop in the container. */
  const trackYToScrollTop = useCallback(
    (trackY: number): number => {
      const scrollParent = scrollParentRef.current;
      if (!scrollParent || segments.length === 0) return 0;

      let target = segments[segments.length - 1];
      for (const segment of segments) {
        if (trackY < segment.top + segment.height) {
          target = segment;
          break;
        }
      }

      const within = clamp((trackY - target.top) / (target.height || 1), 0, 1);
      const el = document.getElementById(target.sectionId);
      const offsetTop = el?.offsetTop ?? 0;
      const offsetHeight = el?.offsetHeight ?? 0;
      return offsetTop + within * offsetHeight;
    },
    [segments],
  );

  const syncIndicator = useCallback(() => {
    const scrollParent = scrollParentRef.current;
    if (!scrollParent) return;

    const result = scrollTopToSegment(scrollParent.scrollTop);
    if (!result) return;

    const segment = segments[result.index];
    setIndicatorY(segment.top + result.within * segment.height);
    setCurrentLabel(formatMonthYear(segment.year, segment.month));
  }, [scrollTopToSegment, segments, formatMonthYear]);

  // Track scrolling of the container to move the indicator.
  useEffect(() => {
    const scrollParent = scrollParentRef.current ?? getScrollParent(document.getElementById('grid'));
    scrollParentRef.current = scrollParent;
    if (!scrollParent) return;

    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const onScroll = () => {
      setIsScrolling(true);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setIsScrolling(false), 800);

      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        // The top header collapses from full hero to compact while scrolling, so
        // keep the scrubber's inset in sync with it.
        setHeaderOffset(measureHeaderOffset(scrollParent));
        syncIndicator();
      });
    };

    scrollParent.addEventListener('scroll', onScroll, { passive: true });
    syncIndicator();

    return () => {
      scrollParent.removeEventListener('scroll', onScroll);
      if (hideTimer) clearTimeout(hideTimer);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [syncIndicator]);

  // Recompute the indicator once segments/layout change.
  useEffect(() => {
    syncIndicator();
  }, [segments, syncIndicator]);

  const updateHoverFromClientY = useCallback(
    (clientY: number) => {
      const el = scrubberRef.current;
      if (!el) return 0;
      const y = clamp(clientY - el.getBoundingClientRect().top - PADDING_TOP, 0, trackHeight);
      setHoverY(y);

      let target = segments[segments.length - 1];
      for (const segment of segments) {
        if (y < segment.top + segment.height) {
          target = segment;
          break;
        }
      }
      if (target) setHoverLabel(formatMonthYear(target.year, target.month));
      return y;
    },
    [trackHeight, segments, formatMonthYear],
  );

  const scrollToTrackY = useCallback(
    (trackY: number) => {
      const scrollParent = scrollParentRef.current;
      if (!scrollParent) return;
      scrollParent.scrollTo({ top: trackYToScrollTop(trackY), behavior: 'auto' });
    },
    [trackYToScrollTop],
  );

  // Global listeners while dragging so the scrub keeps working outside the bar.
  useEffect(() => {
    if (!isDragging) return;

    const onMove = (event: MouseEvent) => {
      const y = updateHoverFromClientY(event.clientY);
      scrollToTrackY(y);
    };
    const onUp = () => setIsDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, updateHoverFromClientY, scrollToTrackY]);

  if (!scrollable || segments.length === 0) return null;

  const isActive = isHovering || isDragging || isScrolling;

  // A zero-height sticky rail pins to the scroll viewport at the live header
  // offset (so it sits exactly below the heroes/chips and follows the container,
  // sidebar offset included, with no JS positioning). The scrubber itself is
  // absolutely positioned inside it, hugging the right edge.
  return (
    <div className="timeline-scrubber-rail" style={{ top: `${headerOffset}px` }}>
      <div
        ref={scrubberRef}
        className={`timeline-scrubber${isActive ? ' is-active' : ''}${isDragging ? ' is-dragging' : ''}`}
        style={{
          width: `${SCRUBBER_WIDTH}px`,
          height: `${Math.max(0, viewportHeight - headerOffset)}px`,
          paddingTop: `${PADDING_TOP}px`,
          paddingBottom: `${PADDING_BOTTOM}px`,
        }}
        role="scrollbar"
        aria-orientation="vertical"
        aria-valuetext={currentLabel}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onMouseMove={(event) => updateHoverFromClientY(event.clientY)}
        onMouseDown={(event) => {
          event.preventDefault();
          const y = updateHoverFromClientY(event.clientY);
          setIsDragging(true);
          scrollToTrackY(y);
        }}
        onWheel={(event) => {
          const scrollParent = scrollParentRef.current;
          if (scrollParent) scrollParent.scrollTop += event.deltaY;
        }}
      >
        <div className="timeline-scrubber__track">
          {segments.map((segment) => (
            <div
              key={segment.sectionId}
              className="timeline-scrubber__segment"
              style={{ height: `${segment.height}px` }}
            >
              {segment.hasLabel && <span className="timeline-scrubber__year">{segment.year}</span>}
              {segment.hasDot && <span className="timeline-scrubber__dot" />}
            </div>
          ))}
        </div>

        <div className="timeline-scrubber__indicator" style={{ top: `${PADDING_TOP + indicatorY}px` }}>
          {(isScrolling || isHovering) && !isDragging && currentLabel && (
            <span className="timeline-scrubber__indicator-label">{currentLabel}</span>
          )}
        </div>

        {(isHovering || isDragging) && hoverLabel && (
          <div className="timeline-scrubber__hover-label" style={{ top: `${PADDING_TOP + hoverY}px` }}>
            {hoverLabel}
          </div>
        )}
      </div>
    </div>
  );
}
