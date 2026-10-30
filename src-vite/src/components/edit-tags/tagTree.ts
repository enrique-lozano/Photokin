import { TagInClient } from '@/db/models/TagDTO';

export interface TagTreeNode {
  id: string;
  name: string;
  fullPath: string;
  color: string | null;
  /** Seed for the fallback color: the root tag's id. */
  rootId: string;
  children: TagTreeNode[];
}

/** Builds a `parentId`-linked tag list into a sorted hierarchy of tree nodes. */
export function buildTagTree(tags: TagInClient[]): TagTreeNode[] {
  const byId = new Map<string, TagTreeNode>();
  for (const tag of tags) {
    byId.set(tag.id, {
      id: tag.id,
      name: tag.name,
      fullPath: tag.fullPath,
      color: tag.color,
      rootId: tag.rootId,
      children: [],
    });
  }

  const roots: TagTreeNode[] = [];
  for (const tag of tags) {
    const node = byId.get(tag.id)!;
    const parent = tag.parentId ? byId.get(tag.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (nodes: TagTreeNode[]): void => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((node) => sort(node.children));
  };
  sort(roots);

  return roots;
}

/** Keeps nodes whose name matches the query (case-insensitive) plus their ancestors. */
export function filterTagTree(nodes: TagTreeNode[], query: string): TagTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  const walk = (list: TagTreeNode[]): TagTreeNode[] =>
    list
      .map((node) => {
        const children = walk(node.children);
        if (node.name.toLowerCase().includes(q) || children.length > 0) {
          return { ...node, children };
        }
        return null;
      })
      .filter((node): node is TagTreeNode => node !== null);

  return walk(nodes);
}
