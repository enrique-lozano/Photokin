import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Selection after a click on `id`. A plain click toggles it; a shift-click adds
 * everything between `anchorId` and `id` (both included) to what was selected.
 * Without a usable anchor a shift-click behaves like a plain click.
 */
export function clickSelection(
  current: ReadonlySet<string>,
  orderedIds: readonly string[],
  id: string,
  anchorId: string | null,
  shift: boolean,
): Set<string> {
  const next = new Set(current);
  const from = shift && anchorId !== null ? orderedIds.indexOf(anchorId) : -1;
  const to = orderedIds.indexOf(id);

  if (from === -1 || to === -1) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  const [start, end] = from < to ? [from, to] : [to, from];
  for (let i = start; i <= end; i++) next.add(orderedIds[i]);
  return next;
}

/**
 * Click / shift-click selection over `orderedIds`. Ids that leave the list are
 * dropped from `selectedIds`, so a face that gets assigned elsewhere stops
 * counting as selected.
 */
export function useRangeSelection(orderedIds: readonly string[]) {
  const [rawSelection, setRawSelection] = useState<ReadonlySet<string>>(() => new Set());
  const anchorRef = useRef<string | null>(null);

  const selectedIds = useMemo(() => {
    if (rawSelection.size === 0) return rawSelection;
    const live = new Set(orderedIds);
    const kept = [...rawSelection].filter((id) => live.has(id));
    return kept.length === rawSelection.size ? rawSelection : new Set(kept);
  }, [orderedIds, rawSelection]);

  const click = useCallback(
    (id: string, shift: boolean) => {
      setRawSelection((current) => clickSelection(current, orderedIds, id, anchorRef.current, shift));
      anchorRef.current = id;
    },
    [orderedIds],
  );

  const selectAll = useCallback(() => setRawSelection(new Set(orderedIds)), [orderedIds]);

  const clear = useCallback(() => {
    anchorRef.current = null;
    setRawSelection(new Set());
  }, []);

  return { selectedIds, click, selectAll, clear };
}
