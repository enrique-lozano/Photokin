import { TreeEntryEl } from './TreeEntryEl.model';

export function applyRecursiveFn<T extends TreeEntryEl | TreeEntryEl[]>(
  entries: T,
  fn: (entry: TreeEntryEl) => void,
): T {
  const parseEntry = (entry: TreeEntryEl) => {
    fn(entry);
    entry.children = entry.children.map((child) => applyRecursiveFn(child, fn));

    return entry;
  };

  return (Array.isArray(entries) ? entries.map((x) => parseEntry(x)) : parseEntry(entries)) as T;
}

/** Reorder a tree (and every nested level) in place by the given comparator. */
export function sortTreeEntries(
  entries: TreeEntryEl[],
  compare: (a: TreeEntryEl, b: TreeEntryEl) => number,
): void {
  entries.sort(compare);
  for (const entry of entries) {
    if (entry.children?.length) sortTreeEntries(entry.children, compare);
  }
}

/**
 * The root of the selected subtree, i.e. the entry the user clicked. The
 * traversal is parent-first, so the first selected entry is that root even when
 * its children are selected too (recursive mode).
 */
export function findSelectedRootEntry(tree: TreeEntryEl[] | null): TreeEntryEl | null {
  for (const entry of tree ?? []) {
    if (entry.selected) return entry;

    const selectedChild = findSelectedRootEntry(entry.children);
    if (selectedChild) return selectedChild;
  }

  return null;
}

export const updateSelectedState = (
  tree: TreeEntryEl[],
  itemId: string,
  params: { isRecursive: boolean },
): TreeEntryEl[] => {
  return tree.map((entry) => {
    if (entry.id === itemId) {
      return {
        ...entry,
        selected: true,
        children: applyRecursiveFn(entry.children, (e) => {
          e.selected = params.isRecursive;
        }),
      };
    } else {
      return {
        ...entry,
        selected: false,
        children: updateSelectedState(entry.children, itemId, params),
      };
    }
  });
};
