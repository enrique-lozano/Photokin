import { TreeColorDot } from '@/components/tree/TreeColorDot';
import { Checkbox } from '@/components/ui/checkbox';
import { TagCheckState } from '@/media/metadata/tags/tagAssignments';
import { IconChevronRight } from '@tabler/icons-react';
import { TagTreeNode } from './tagTree';

/** A checkbox that also renders the `indeterminate` visual (a dash). */
export function TriStateCheckbox({
  state,
  onChange,
  ariaLabel,
}: {
  state: TagCheckState;
  onChange: () => void;
  ariaLabel: string;
}) {
  return (
    <Checkbox
      checked={state === 'indeterminate' ? 'indeterminate' : state === 'checked'}
      aria-label={ariaLabel}
      onCheckedChange={onChange}
    />
  );
}

interface TagRowCallbacks {
  getState: (id: string) => TagCheckState;
  onToggle: (id: string) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  /** When true (e.g. an active search), every node renders expanded. */
  forceExpanded?: boolean;
}

interface TagCheckboxTreeProps extends TagRowCallbacks {
  nodes: TagTreeNode[];
}

export function TagCheckboxTree({ nodes, ...callbacks }: TagCheckboxTreeProps) {
  return (
    <div className="edit-tags-tree" role="tree">
      {nodes.map((node) => (
        <TagTreeRow key={node.id} node={node} depth={0} {...callbacks} />
      ))}
    </div>
  );
}

interface TagTreeRowProps extends TagRowCallbacks {
  node: TagTreeNode;
  depth: number;
}

function TagTreeRow({
  node,
  depth,
  getState,
  onToggle,
  expandedIds,
  onToggleExpand,
  forceExpanded,
}: TagTreeRowProps) {
  const hasChildren = node.children.length > 0;
  const expanded = Boolean(forceExpanded) || expandedIds.has(node.id);
  const state = getState(node.id);

  return (
    <div className="edit-tags-branch" role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <div className="edit-tags-row" style={{ paddingLeft: `${depth * 18}px` }}>
        <button
          type="button"
          className={'edit-tags-caret' + (expanded ? ' expanded' : '') + (hasChildren ? '' : ' is-leaf')}
          aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          disabled={!hasChildren}
          onClick={() => hasChildren && onToggleExpand(node.id)}
        >
          <IconChevronRight size={16} />
        </button>

        <label className="edit-tags-row-label">
          <TriStateCheckbox state={state} onChange={() => onToggle(node.id)} ariaLabel={node.name} />
          {depth === 0 && <TreeColorDot seed={node.rootId} color={node.color} />}
          <span className="edit-tags-row-name">{node.name}</span>
        </label>
      </div>

      {hasChildren && expanded && (
        <div className="edit-tags-children">
          {node.children.map((child) => (
            <TagTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              getState={getState}
              onToggle={onToggle}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              forceExpanded={forceExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}
