import { ReactNode } from 'react';
import { TreeColorDot } from '../../components/tree/TreeColorDot';
import { TreeEntryEl } from '../../components/tree/TreeEntryEl.model';
import { TagDTO, TagInClient } from '../../db/models/TagDTO';

function ancestorIdsForTag(tagId: string, tags: TagDTO[]): Set<string> {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const ancestors = new Set<string>();

  let current = byId.get(tagId);
  while (current?.parentId) {
    ancestors.add(current.parentId);
    current = byId.get(current.parentId);
  }

  return ancestors;
}

function ancestorsToOpenForSelection(tags: TagDTO[], selectedIds: string[] | undefined): Set<string> {
  const toOpen = new Set<string>();
  for (const id of selectedIds ?? []) {
    for (const ancestorId of ancestorIdsForTag(id, tags)) {
      toOpen.add(ancestorId);
    }
  }
  return toOpen;
}

export function mapTagsToTreeItems(
  tags: TagInClient[],
  opts?: {
    initiallySelectedIDs?: string[];
    initiallyOpenedIDs?: string[];
    /** Optional per-tag context-menu content (rendered on right click). */
    renderPopover?: (tag: TagDTO) => ReactNode;
  },
): TreeEntryEl[] {
  const ancestorsToOpen = ancestorsToOpenForSelection(tags, opts?.initiallySelectedIDs);

  // Create a map of tags by their id for quick lookup
  const tagMap = new Map<string, TreeEntryEl>();

  // Initialize the map with empty children arrays
  tags.forEach((tag) => {
    tagMap.set(tag.id, {
      name: tag.name,
      id: tag.id,
      children: [],
      open: (opts?.initiallyOpenedIDs?.some((x) => x === tag.id) ?? false) || ancestorsToOpen.has(tag.id),
      selected: opts?.initiallySelectedIDs?.some((x) => x === tag.id) ?? false,
      startIcon: tag.parentId ? undefined : <TreeColorDot seed={tag.rootId} color={tag.color} />,
      popover: opts?.renderPopover ? () => opts.renderPopover!(tag) : undefined,
    });
  });

  // Build the tree structure
  const tree: TreeEntryEl[] = [];

  tags.forEach((tag) => {
    const currentTag = tagMap.get(tag.id)!;
    if (tag.parentId) {
      const parentTag = tagMap.get(tag.parentId);
      if (parentTag) {
        parentTag.children.push(currentTag);
      }
    } else {
      tree.push(currentTag);
    }
  });

  return tree;
}
