import { ReactNode } from 'react';

export interface TreeEntryEl {
  name: string;
  id: string;

  startIcon?: ReactNode;

  /** Icon shown in place of `startIcon` when the entry is expanded */
  openIcon?: ReactNode;

  /** The children of this element. Can be an empty array if the element has no children */
  children: TreeEntryEl[];

  popover?: () => ReactNode;

  selected: boolean;

  /** Function called when the tree entry is clicked */
  onClick?: (entry: TreeEntryEl) => void;

  /** Indicates whether the tree entry is expanded */
  open: boolean;
  /** Visually distinguishes an item that is only present because hidden items are shown. */
  hidden?: boolean;

  /** Function called when the caret is clicked. */
  onCaretClicked?: (entry: TreeEntryEl) => void;
}

/** Optional move behavior for trees whose hierarchy can be reorganized. */
export interface TreeDragDropOptions {
  canDrag: (entryId: string) => boolean;
  canDrop: (sourceId: string, targetId: string | null) => boolean;
  onDrop: (sourceId: string, targetId: string | null) => void;
}
