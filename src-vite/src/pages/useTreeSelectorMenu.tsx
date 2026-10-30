import { useState } from 'react';
import {
  applyRecursiveFn,
  findSelectedRootEntry,
  updateSelectedState,
} from '../components/tree/TreeEntry.utils';
import { TreeEntryEl } from '../components/tree/TreeEntryEl.model';

export interface TreeSelectorMenuOptions {
  /** Called after a row is selected (e.g. Tags navigates to its detail route). */
  onEntrySelect?: (entry: TreeEntryEl) => void;
  /** Whether children are included before the user touches the toggle. */
  initialSelectChildMode?: boolean;
}

export function useTreeSelectorMenu(
  tree: TreeEntryEl[] | null,
  setTree: (newTree: TreeEntryEl[] | null) => void,
  options?: TreeSelectorMenuOptions,
) {
  // Fallback for when the tree can't answer the question (nothing selected, or a
  // leaf, whose selection looks identical in both modes).
  const [selectChildPreference, setSelectChildPreference] = useState(
    options?.initialSelectChildMode ?? false,
  );
  const [searchFilter, setSearchFilter] = useState<string | undefined>();

  // The tree is the source of truth: it lives in the sidebar store, so a
  // selected subtree — and therefore the toggle — survives navigating away and back.
  const selectedRoot = findSelectedRootEntry(tree);
  const selectChildMode =
    selectedRoot && selectedRoot.children.length > 0
      ? selectedRoot.children.some((child) => child.selected)
      : selectChildPreference;

  const handleTreeEntryClick = (clickedEntry: TreeEntryEl) => {
    if (!tree) return;

    setTree(updateSelectedState(tree, clickedEntry.id, { isRecursive: selectChildMode }));
    options?.onEntrySelect?.(clickedEntry);
  };

  const handleCaretClick = (clickedEntry: TreeEntryEl) => {
    if (!tree) return;

    setTree(
      applyRecursiveFn(tree, (entry) => {
        if (clickedEntry.id === entry.id) {
          entry.open = !entry.open;
        }
      }),
    );
  };

  const handleSelectChildModeChange = (newValue: boolean) => {
    setSelectChildPreference(newValue);

    if (!tree || !selectedRoot) return;

    setTree(updateSelectedState(tree, selectedRoot.id, { isRecursive: newValue }));
  };

  const prepareTreeEntries = (entry: TreeEntryEl): TreeEntryEl => {
    const newEntry: TreeEntryEl = {
      ...entry,
      onClick: handleTreeEntryClick,
      onCaretClicked: handleCaretClick,
    };
    newEntry.children = entry.children.map(prepareTreeEntries);

    return newEntry;
  };

  const preparedTreeData = tree?.map(prepareTreeEntries) ?? null;

  return {
    preparedTreeData,
    searchFilter,
    setSearchFilter,
    selectChildMode,
    setSelectChildMode: handleSelectChildModeChange,
  };
}
