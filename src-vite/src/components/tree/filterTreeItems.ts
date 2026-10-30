import { TreeEntryEl } from './TreeEntryEl.model';

/**
 * Filter the tree elements returning only the ones that match the filter.
 *
 * To match the filter, the element or one of its children should contain in its
 * name the specified filter.
 */
export const treeNameMatches = (entry: TreeEntryEl, filter: string): boolean =>
  entry.name.toLowerCase().includes(filter.toLowerCase());

export const filterTreeItemsByName = (treeElements: TreeEntryEl[], filter: string): TreeEntryEl[] => {
  return filterTreeItemsByCondition(treeElements, (treeEl) => treeNameMatches(treeEl, filter));
};

/**
 * Counts entries whose own name matches `filter`.
 *
 * Ancestors kept open only so a match stays visible are not counted, and neither
 * are descendants shown only because an ancestor matched. `include` drops rows
 * that are not part of the section total, such as album folders with no album row.
 */
export const countTreeNameMatches = (
  entries: TreeEntryEl[],
  filter: string,
  include: (entry: TreeEntryEl) => boolean = () => true,
): number => {
  if (!filter) return 0;

  let count = 0;
  const walk = (nodes: TreeEntryEl[]) => {
    for (const node of nodes) {
      if (include(node) && treeNameMatches(node, filter)) count += 1;
      if (node.children.length > 0) walk(node.children);
    }
  };
  walk(entries);
  return count;
};

/**
 * Filter the tree elements returning only the ones that match the filter.
 *
 * To match the filter, the element or one of its children should contain in its
 * name the specified filter.
 */
export const filterTreeItemsByCondition = (
  treeElements: TreeEntryEl[],
  condition: (treeItem: TreeEntryEl) => boolean,
): TreeEntryEl[] => {
  return treeElements
    .map((treeEl) => {
      if (condition(treeEl)) {
        return treeEl;
      }

      const filteredChildren = filterTreeItemsByCondition(treeEl.children, condition);
      if (filteredChildren.length > 0) {
        // Force the parent open so the matching descendants are visible.
        return { ...treeEl, open: true, children: filteredChildren };
      }

      return null;
    })
    .filter((e) => e !== null) as TreeEntryEl[];
};
