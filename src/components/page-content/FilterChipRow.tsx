import { Skeleton } from '@/components/ui/skeleton';
import { VerticalDivider } from '@/components/ui/verticalDivider';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ContentFilterChip } from './contentFilterChips';
import { FilterChip } from './FilterChip';
import { FilterChipLeading } from './FilterChipLeading';

interface FilterChipRowProps {
  chips: ContentFilterChip[];
  activeChipIds: string[];
  onToggle: (chip: ContentFilterChip) => void;
  /** Locks every chip, e.g. while their counts are being recomputed. */
  disabled?: boolean;
}

interface RenderItem {
  chip: ContentFilterChip;
  /** Renders in the left "selected" section and shows the active styling. */
  selected: boolean;
  /** Removed chips stay mounted (out of flow) until their exit animation ends. */
  exiting: boolean;
}

/** Exit fade/scale duration. */
const EXIT_MS = 220;
/** Move (FLIP) and enter duration. */
const MOVE_MS = 340;
const MOVE_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** Key under which the section divider is tracked for FLIP. */
const DIVIDER_KEY = '__divider__';

/**
 * Signature of the *visible structure*: selected ids then suggestion ids, in
 * order. A real toggle/reorder/add/remove changes it (and animates); a
 * count-only refresh (e.g. background indexing) does not, so it never stacks a
 * second motion on top of the one the user triggered.
 */
function structureSignature(chips: ContentFilterChip[], activeIds: string[]): string {
  const active = new Set(activeIds);
  const selected = chips.filter((chip) => active.has(chip.id)).map((chip) => chip.id);
  const rest = chips.filter((chip) => !active.has(chip.id)).map((chip) => chip.id);
  return `${selected.join('|')}||${rest.join('|')}`;
}

/**
 * Quick-filter chips laid out as two sections — selected on the left, a thin
 * divider, then the scrollable suggestions — while remaining a single FLIP
 * container so chips glide smoothly between the two sections instead of being
 * clipped at a boundary.
 *
 * Choreography:
 *  • toggling a chip slides it across into / out of the selected section (FLIP);
 *  • chips that no longer match drop out of flow and fade/scale away so their
 *    neighbours glide into the gap;
 *  • brand-new chips fade/scale in; the divider itself FLIPs so it never jumps.
 *
 * Two safeguards prevent overlapping animations: only *structural* changes
 * animate (counts swap in place), and positions are measured visually
 * (`getBoundingClientRect`) so a mid-flight update re-targets from where a chip
 * currently is rather than fighting the running transition.
 *
 * Selection is rendered from `activeChipIds` alone, so a toggle lands on the
 * same frame as the click — it never waits for the (much slower) recount of the
 * suggestions, which arrives later as a second, independent motion.
 */
export function FilterChipRow({ chips, activeChipIds, onToggle, disabled }: FilterChipRowProps) {
  const [items, setItems] = useState<RenderItem[]>(() =>
    chips.map((chip) => ({ chip, selected: activeChipIds.includes(chip.id), exiting: false })),
  );

  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const dividerRef = useRef<HTMLSpanElement | null>(null);
  /** Visual rects (include any in-flight transform) for the FLIP "First" frame. */
  const prevRects = useRef(new Map<string, DOMRect>());
  /** Flow offsets used to pin a chip in place while it animates out. */
  const prevOffsets = useRef(new Map<string, { left: number; top: number }>());
  const enteringIds = useRef(new Set<string>());
  const shouldAnimate = useRef(false);
  const lastSignature = useRef(structureSignature(chips, activeChipIds));
  const removalTimers = useRef(new Map<string, number>());
  const styleResetTimers = useRef(new Set<number>());

  // Reconcile the mounted list with the incoming chips and selection. Capture
  // positions only when the visible structure actually changes, so count-only
  // refreshes don't animate. `selected` is derived here so the section move and
  // the active highlight land together as one motion.
  useLayoutEffect(() => {
    const signature = structureSignature(chips, activeChipIds);
    const structureChanged = signature !== lastSignature.current;
    lastSignature.current = signature;
    shouldAnimate.current = structureChanged;

    if (structureChanged) {
      const rects = new Map<string, DOMRect>();
      const offsets = new Map<string, { left: number; top: number }>();
      nodes.current.forEach((node, id) => {
        rects.set(id, node.getBoundingClientRect());
        offsets.set(id, { left: node.offsetLeft, top: node.offsetTop });
      });
      if (dividerRef.current) rects.set(DIVIDER_KEY, dividerRef.current.getBoundingClientRect());
      prevRects.current = rects;
      prevOffsets.current = offsets;
    }

    setItems((prev) => {
      const incomingIds = new Set(chips.map((chip) => chip.id));
      const prevIds = new Set(prev.map((item) => item.chip.id));

      enteringIds.current = structureChanged
        ? new Set(chips.filter((chip) => !prevIds.has(chip.id)).map((chip) => chip.id))
        : new Set();

      // A chip that re-appears cancels any pending removal.
      chips.forEach((chip) => {
        const timer = removalTimers.current.get(chip.id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          removalTimers.current.delete(chip.id);
        }
      });

      const present: RenderItem[] = chips.map((chip) => ({
        chip,
        selected: activeChipIds.includes(chip.id),
        exiting: false,
      }));
      const exiting: RenderItem[] = prev
        .filter((item) => !incomingIds.has(item.chip.id))
        .map((item) => ({ chip: item.chip, selected: false, exiting: true }));

      return [...present, ...exiting];
    });
  }, [chips, activeChipIds]);

  // FLIP "Invert + Play" (and enter/exit) once the new list has committed.
  useLayoutEffect(() => {
    const animate = shouldAnimate.current;

    items.forEach((item) => {
      const node = nodes.current.get(item.chip.id);
      if (!node) return;

      if (item.exiting) {
        animateExit(node, prevOffsets.current.get(item.chip.id));
        if (!removalTimers.current.has(item.chip.id)) {
          const timer = window.setTimeout(() => {
            removalTimers.current.delete(item.chip.id);
            setItems((prev) => prev.filter((it) => it.chip.id !== item.chip.id));
          }, EXIT_MS + 30);
          removalTimers.current.set(item.chip.id, timer);
        }
        return;
      }

      if (!animate) return;

      // A chip that was mid-exit and came back: clear the leftover out-of-flow
      // styles and let it enter again cleanly.
      const wasExiting = node.style.position === 'absolute';
      if (wasExiting) clearInlineStyles(node);

      const previous = prevRects.current.get(item.chip.id);
      if (!previous || wasExiting || enteringIds.current.has(item.chip.id)) {
        animateEnter(node);
        scheduleStyleReset(node);
        return;
      }

      flipMove(node, previous);
      scheduleStyleReset(node);
    });

    if (animate && dividerRef.current) {
      const previous = prevRects.current.get(DIVIDER_KEY);
      if (previous) {
        flipMove(dividerRef.current, previous);
        scheduleStyleReset(dividerRef.current);
      }
    }

    // Consume the structural change so follow-up `setItems` calls (e.g. an
    // exiting chip un-mounting mid-glide) don't re-run FLIP and snap chips that
    // are still animating.
    shouldAnimate.current = false;
  }, [items]);

  useEffect(() => {
    return () => {
      removalTimers.current.forEach((timer) => window.clearTimeout(timer));
      removalTimers.current.clear();
      styleResetTimers.current.forEach((timer) => window.clearTimeout(timer));
      styleResetTimers.current.clear();
    };
  }, []);

  function scheduleStyleReset(node: HTMLElement): void {
    const timer = window.setTimeout(() => {
      styleResetTimers.current.delete(timer);
      node.style.transition = '';
      node.style.transform = '';
      node.style.opacity = '';
    }, MOVE_MS + 30);
    styleResetTimers.current.add(timer);
  }

  const selectedItems = items.filter((item) => item.selected && !item.exiting);
  const otherItems = items.filter((item) => !item.selected || item.exiting);
  const showDivider = selectedItems.length > 0 && otherItems.some((item) => !item.exiting);

  const renderChip = (item: RenderItem) => (
    <FilterChip
      key={item.chip.id}
      ref={(node) => {
        if (node) nodes.current.set(item.chip.id, node);
        else nodes.current.delete(item.chip.id);
      }}
      label={item.chip.label}
      leading={<FilterChipLeading chip={item.chip} />}
      count={item.chip.count}
      active={item.selected}
      disabled={disabled}
      onClick={() => onToggle(item.chip)}
    />
  );

  return (
    <>
      {selectedItems.map(renderChip)}
      {showDivider && <VerticalDivider ref={dividerRef} />}
      {otherItems.map(renderChip)}
    </>
  );
}

/** Measure the settled layout, invert to the captured visual spot, then play. */
function flipMove(node: HTMLElement, previous: DOMRect): void {
  node.style.transition = 'none';
  node.style.transform = 'none';
  const next = node.getBoundingClientRect();
  const dx = previous.left - next.left;
  const dy = previous.top - next.top;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

  node.style.transform = `translate(${dx}px, ${dy}px)`;
  requestAnimationFrame(() => {
    node.style.transition = `transform ${MOVE_MS}ms ${MOVE_EASING}`;
    node.style.transform = 'none';
  });
}

function animateExit(node: HTMLElement, position?: { left: number; top: number }): void {
  if (node.dataset.exiting === 'true') return;
  node.dataset.exiting = 'true';

  // Pin where it was so removing it from flow lets the neighbours reflow while
  // it fades out on top.
  node.style.position = 'absolute';
  if (position) {
    node.style.left = `${position.left}px`;
    node.style.top = `${position.top}px`;
  }
  node.style.margin = '0';
  node.style.pointerEvents = 'none';
  node.style.transform = 'none';
  node.style.opacity = '1';

  requestAnimationFrame(() => {
    node.style.transition = `opacity ${EXIT_MS}ms ease, transform ${EXIT_MS}ms ease`;
    node.style.opacity = '0';
    node.style.transform = 'scale(0.82)';
  });
}

function animateEnter(node: HTMLElement): void {
  node.style.transition = 'none';
  node.style.opacity = '0';
  node.style.transform = 'scale(0.82)';
  requestAnimationFrame(() => {
    node.style.transition = `opacity ${MOVE_MS}ms ease, transform ${MOVE_MS}ms ${MOVE_EASING}`;
    node.style.opacity = '1';
    node.style.transform = 'none';
  });
}

function clearInlineStyles(node: HTMLElement): void {
  delete node.dataset.exiting;
  node.style.position = '';
  node.style.left = '';
  node.style.top = '';
  node.style.margin = '';
  node.style.pointerEvents = '';
  node.style.transition = '';
  node.style.transform = '';
  node.style.opacity = '';
}

/** Widths of the placeholder pills, roughly those of typical chip labels. */
const PLACEHOLDER_WIDTHS = [92, 74, 108];

/** Holds the chip row's place while its chips are being computed, so the gallery doesn't jump. */
export function FilterChipPlaceholders() {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      {PLACEHOLDER_WIDTHS.map((width) => (
        <Skeleton key={width} className="h-8 shrink-0 rounded-full" style={{ width }} />
      ))}
    </div>
  );
}
