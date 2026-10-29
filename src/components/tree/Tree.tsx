import { CSSProperties, DragEvent, useRef, useState } from 'react';
import TreeEntry from './TreeEntry';
import { TreeDragDropOptions, TreeEntryEl } from './TreeEntryEl.model';
import { filterTreeItemsByName } from './filterTreeItems';

/** Props for the Tree component. */
type TreeEntryProps = {
  /** The array of tree entries to display */
  entries: TreeEntryEl[];

  /** A string used to filter the tree entries by its name */
  filter?: string;

  /** Height in pixels for each row in the tree */
  itemHeightPx?: number;

  /** Enables proposing hierarchy moves by dragging rows onto rows or the tree root. */
  dragDrop?: TreeDragDropOptions;
};

/** Tree component that displays a list of TreeEntry components. */
export function Tree({ entries, filter, itemHeightPx, dragDrop }: TreeEntryProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null | undefined>(undefined);
  const filteredEntries = !filter ? entries : filterTreeItemsByName(entries, filter);

  // Only pin an explicit row height when a caller asks for one; otherwise the
  // tree inherits the shared `--sidebar-row-height` token from `.page-sidebar`.
  const style =
    itemHeightPx !== undefined ? ({ '--tree-item-height': `${itemHeightPx}px` } as CSSProperties) : undefined;

  const clearDragState = () => {
    draggedIdRef.current = null;
    setDraggedId(null);
    setDropTargetId(undefined);
  };

  const startDragging = (id: string) => {
    // Drag-over can fire before React commits the drag-start state update.
    // Keep a synchronous copy so the first target is immediately droppable.
    draggedIdRef.current = id;
    setDraggedId(id);
  };

  const handleRootDragOver = (event: DragEvent<HTMLDivElement>) => {
    const sourceId = draggedIdRef.current;
    if (!dragDrop || !sourceId || !dragDrop.canDrop(sourceId, null)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetId(null);
  };

  const handleRootDrop = (event: DragEvent<HTMLDivElement>) => {
    const sourceId = draggedIdRef.current;
    if (!dragDrop || !sourceId || !dragDrop.canDrop(sourceId, null)) return;
    event.preventDefault();
    dragDrop.onDrop(sourceId, null);
    clearDragState();
  };

  return (
    <div
      className={
        'tree-root' +
        (draggedId ? ' is-dragging' : '') +
        (dropTargetId === null ? ' is-root-drop-target' : '')
      }
      style={style}
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
      onDragEnd={clearDragState}
    >
      {filteredEntries.map((entry) => (
        <TreeEntry
          key={entry.id}
          depth={1}
          entry={entry}
          dragDrop={dragDrop}
          draggedId={draggedId}
          getDraggedId={() => draggedIdRef.current}
          dropTargetId={dropTargetId}
          onDragStarted={startDragging}
          onDropTargetChanged={setDropTargetId}
          onDragFinished={clearDragState}
        />
      ))}
    </div>
  );
}
