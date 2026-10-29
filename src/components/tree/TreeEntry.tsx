import { IconChevronRight } from '@tabler/icons-react';
import { DragEvent, FC } from 'react';
import { Button } from '../ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '../ui/context-menu';
import { TreeDragDropOptions, TreeEntryEl } from './TreeEntryEl.model';
import './treeEntry.css';

interface TreeEntryProps {
  entry: TreeEntryEl;
  depth: number;
  dragDrop?: TreeDragDropOptions;
  draggedId: string | null;
  getDraggedId: () => string | null;
  dropTargetId: string | null | undefined;
  onDragStarted: (id: string) => void;
  onDropTargetChanged: (id: string | null | undefined) => void;
  onDragFinished: () => void;
}

/** Component to display a tree entry an its children (if any) */
export default function TreeEntry({
  entry,
  depth,
  dragDrop,
  draggedId,
  getDraggedId,
  dropTargetId,
  onDragStarted,
  onDropTargetChanged,
  onDragFinished,
}: TreeEntryProps): ReturnType<FC> {
  const haveChildren = entry.children && entry.children.length > 0;
  const isSelected = entry.selected;
  const displayedIcon = entry.open && haveChildren && entry.openIcon ? entry.openIcon : entry.startIcon;
  const isDraggable = dragDrop?.canDrag(entry.id) ?? false;
  const isDropTarget = draggedId !== null && dropTargetId === entry.id;

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (!isDraggable) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', entry.id);
    onDragStarted(entry.id);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const sourceId = getDraggedId();
    if (!dragDrop || !sourceId || sourceId === entry.id || !dragDrop.canDrop(sourceId, entry.id)) {
      event.dataTransfer.dropEffect = 'none';
      onDropTargetChanged(undefined);
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    onDropTargetChanged(entry.id);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const sourceId = getDraggedId();
    if (!dragDrop || !sourceId || sourceId === entry.id || !dragDrop.canDrop(sourceId, entry.id)) return;
    event.preventDefault();
    dragDrop.onDrop(sourceId, entry.id);
    onDragFinished();
  };

  const mainComponent = (
    <>
      <div
        id={`tree-entry-item-${entry.id}`}
        draggable={isDraggable}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null) && isDropTarget) {
            onDropTargetChanged(undefined);
          }
        }}
        onDrop={handleDrop}
        onDragEnd={onDragFinished}
        className={
          'tree-entry-item' +
          (haveChildren ? ' have-children' : '') +
          (isSelected ? ' is-selected' : '') +
          (entry.hidden ? ' is-hidden-item' : '') +
          (isDraggable ? ' is-draggable' : '') +
          (draggedId === entry.id ? ' is-drag-source' : '') +
          (isDropTarget ? ' is-drop-target' : '')
        }
      >
        <div className={'caret-icon-container ' + (entry.open ? ' expanded' : '')}>
          <Button
            size="icon"
            variant="ghost"
            className="bg-transparent border-none"
            aria-label={entry.open ? `Collapse ${entry.name}` : `Expand ${entry.name}`}
            disabled={!haveChildren}
            onClick={() => {
              if (entry.onCaretClicked) {
                entry.onCaretClicked(entry);
              }
            }}
          >
            <IconChevronRight />
          </Button>
        </div>

        <Button
          variant="ghost"
          className={'item-selector' + (isSelected ? ' is-selected' : '')}
          onClick={() => {
            if (entry.onClick) entry.onClick(entry);
          }}
          onContextMenu={() => {
            if (entry.onClick) entry.onClick(entry);
          }}
        >
          {displayedIcon && <div className="item-icon-container">{displayedIcon}</div>}
          <span className="item-label">{entry.name}</span>
        </Button>
      </div>

      <div>
        {entry.open && (
          <div style={{ paddingLeft: `18px` }}>
            {entry.children?.map((entryChild) => (
              <TreeEntry
                key={entryChild.id}
                entry={entryChild}
                depth={depth + 1}
                dragDrop={dragDrop}
                draggedId={draggedId}
                getDraggedId={getDraggedId}
                dropTargetId={dropTargetId}
                onDragStarted={onDragStarted}
                onDropTargetChanged={onDropTargetChanged}
                onDragFinished={onDragFinished}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );

  if (entry.popover) {
    return (
      <ContextMenu>
        <ContextMenuTrigger>{mainComponent}</ContextMenuTrigger>
        <ContextMenuContent>{entry.popover()}</ContextMenuContent>
      </ContextMenu>
    );
  }

  return mainComponent;
}
