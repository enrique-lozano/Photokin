import { AssetsService } from '@/db/api/services/assets.service';
import { BulkActionProgress } from '@/components/bulk-action/BulkActionProgress';
import { BulkActionResultStep } from '@/components/bulk-action/BulkActionResultStep';
import {
  useInertWhen,
  useBulkActionDialog,
  type BulkActionDialogPhaseKind,
} from '@/components/bulk-action/useBulkActionDialog';
import { TagsService } from '@/db/api/services/tags.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { TagInClient } from '@/db/models/TagDTO';
import {
  tagCheckState,
  tagTreeCheckState,
  tagTreeToggleChanges,
  type TagCheckState,
} from '@/media/metadata/tags/tagAssignments';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import { AssetThumbnail } from '@/components/asset-thumbnail/AssetThumbnail';
import type { BulkOutcome } from '@/system/bulkOutcome';
import { IconPlus, IconSearch, IconTagOff, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Collapse } from '../ui/collapse';
import { MetadataImpactNotice } from '../ui/confirmation-dialog';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { TagCheckboxTree } from './TagCheckboxTree';
import './editTags.css';
import { useEditTagsDialog } from './editTagsDialogStore';
import { buildTagTree, filterTagTree } from './tagTree';

const MAX_THUMBS = 14;

function EditTagsContent({
  assets,
  onClose,
  onRunningChange,
  onPhaseChange,
}: {
  assets: AssetInClient[];
  onClose: () => void;
  onRunningChange: (running: boolean) => void;
  onPhaseChange: (phase: BulkActionDialogPhaseKind) => void;
}) {
  const [allTags, setAllTags] = useState<TagInClient[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  const [actions, setActions] = useState<Map<string, boolean>>(new Map());
  const [pendingNewTags, setPendingNewTags] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [addInput, setAddInput] = useState('');
  const bulkAction = useBulkActionDialog(onRunningChange, onPhaseChange);
  const isApplying = bulkAction.phase.kind === 'running';
  const editorRef = useInertWhen(isApplying);

  const total = assets.length;

  useEffect(() => {
    let cancelled = false;
    const assetIds = assets.map((asset) => asset.id);
    void Promise.all([TagsService.getAll(), TagsService.getTagCountsForAssets(assetIds)]).then(
      ([tags, tagCounts]) => {
        if (cancelled) return;
        setAllTags(tags);
        setCounts(tagCounts);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [assets]);

  const parentById = useMemo(() => new Map((allTags ?? []).map((tag) => [tag.id, tag.parentId])), [allTags]);
  const childrenByParent = useMemo(() => {
    const children = new Map<string, string[]>();
    for (const tag of allTags ?? []) {
      if (!tag.parentId) continue;
      const siblings = children.get(tag.parentId) ?? [];
      siblings.push(tag.id);
      children.set(tag.parentId, siblings);
    }
    return children;
  }, [allTags]);
  const idByFullPath = useMemo(
    () => new Map((allTags ?? []).map((tag) => [tag.fullPath, tag.id])),
    [allTags],
  );

  const tree = useMemo(() => buildTagTree(allTags ?? []), [allTags]);
  const filteredTree = useMemo(() => filterTagTree(tree, filter), [tree, filter]);
  const forceExpanded = filter.trim().length > 0;

  const baseState = (id: string) => tagCheckState(counts?.get(id) ?? 0, total);
  const ownState = (id: string): TagCheckState =>
    actions.has(id) ? (actions.get(id) ? 'checked' : 'unchecked') : baseState(id);
  const descendantIdsOf = (id: string): string[] => {
    const descendants: string[] = [];
    const pending = [...(childrenByParent.get(id) ?? [])];
    while (pending.length > 0) {
      const descendantId = pending.pop()!;
      descendants.push(descendantId);
      pending.push(...(childrenByParent.get(descendantId) ?? []));
    }
    return descendants;
  };
  const getState = (id: string): TagCheckState => {
    const descendantStates = descendantIdsOf(id).map(ownState);
    return tagTreeCheckState(ownState(id), descendantStates);
  };

  const toggle = (id: string) => {
    const changes = tagTreeToggleChanges(id, descendantIdsOf(id), getState(id));
    setActions((prev) => new Map([...prev, ...changes]));
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasPresentTags = (counts?.size ?? 0) > 0;

  // Stage removal of every keyword currently on the selection (present tags are
  // exactly the keys of `counts`) and drop any not-yet-created additions.
  const clearAll = () => {
    setActions(new Map([...(counts?.keys() ?? [])].map((id) => [id, false])));
    setPendingNewTags([]);
  };

  const addTagIds = useMemo(
    () => [...actions].filter(([id, desired]) => desired && baseState(id) !== 'checked').map(([id]) => id),
    [actions, counts, total],
  );
  const removeTagIds = useMemo(
    () => [...actions].filter(([id, desired]) => !desired && baseState(id) !== 'unchecked').map(([id]) => id),
    [actions, counts, total],
  );

  // Kept separate from `canApply` so the write-back notice stays up while the
  // edit is being applied, instead of collapsing the moment the button locks.
  const hasPendingChanges = addTagIds.length > 0 || removeTagIds.length > 0 || pendingNewTags.length > 0;
  const canApply = !isApplying && counts !== null && hasPendingChanges;

  function submitAddTag() {
    const normalized = addInput
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join('/');
    setAddInput('');
    if (!normalized) return;

    const existingId = idByFullPath.get(normalized);
    if (existingId) {
      setActions((prev) => new Map(prev).set(existingId, true));
      setExpandedIds((prev) => {
        const next = new Set(prev);
        let parent = parentById.get(existingId) ?? null;
        while (parent) {
          next.add(parent);
          parent = parentById.get(parent) ?? null;
        }
        return next;
      });
      return;
    }

    setPendingNewTags((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
  }

  async function handleApply() {
    if (!canApply) return;
    await bulkAction.run({
      label: 'Updating tags',
      summary: (outcome) =>
        `Updated tags on ${outcome.total.toLocaleString()} ${outcome.total === 1 ? 'file' : 'files'}`,
      action: async (onFileProgress): Promise<BulkOutcome> => {
        const assetIds = assets.map((asset) => asset.id);
        const beforeByAsset = await AssetsService.getTagIdsByAsset(assetIds);
        let additions = [...addTagIds];
        if (pendingNewTags.length > 0) {
          const created = await TagsService.parseAndInsertNeccesaryTags(pendingNewTags);
          additions = [...additions, ...created.map((tag) => tag.id)];
        }

        const filenameById = new Map(assets.map((asset) => [asset.id, asset.filename]));
        const { updated, fileFailures } = await AssetsService.updateAssetsTags(
          { assetIds, addTagIds: additions, removeTagIds },
          onFileProgress,
        );
        const afterByAsset = await AssetsService.getTagIdsByAsset(assetIds);
        const changedAssets = assets.filter((asset) => {
          const before = [...(beforeByAsset.get(asset.id) ?? [])].sort();
          const after = [...(afterByAsset.get(asset.id) ?? [])].sort();
          return JSON.stringify(before) !== JSON.stringify(after);
        });
        const undo =
          changedAssets.length > 0
            ? () =>
                AssetsService.restoreAssetsTags(
                  changedAssets.map((asset) => ({
                    id: asset.id,
                    beforeTagIds: [...(beforeByAsset.get(asset.id) ?? [])],
                    expectedTagIds: [...(afterByAsset.get(asset.id) ?? [])],
                  })),
                ).then((failures) => {
                  if (failures.size > 0) throw new Error([...failures.values()].join('; '));
                })
            : undefined;

        return {
          total: updated,
          fileCount: updated,
          undo,
          fileFailures: [...fileFailures].map(([id, message]) => ({
            id,
            label: filenameById.get(id) ?? id,
            reason: `could not write to file (${message})`,
          })),
        };
      },
    });
  }

  const shownThumbs = assets.slice(0, MAX_THUMBS);
  const extraThumbs = assets.length - shownThumbs.length;
  const isLoading = allTags === null || counts === null;

  if (bulkAction.phase.kind === 'result') {
    return (
      <BulkActionResultStep
        summary={bulkAction.phase.summary}
        outcome={bulkAction.phase.outcome}
        isUndoing={bulkAction.isUndoing}
        onUndo={() => void bulkAction.undo(onClose)}
        onDone={onClose}
      />
    );
  }

  return (
    <>
      <DialogBody
        ref={editorRef}
        className={`flex flex-col gap-3 overflow-hidden ${isApplying ? 'pointer-events-none select-none opacity-60' : ''}`}
        aria-busy={isApplying}
      >
        <div className="edit-tags-thumbs">
          {shownThumbs.map((asset) => (
            <div className="edit-tags-thumb" key={asset.id} title={asset.filename}>
              <AssetThumbnail asset={asset} size={ThumbnailSize.XS} />
            </div>
          ))}
          {extraThumbs > 0 && <span className="edit-tags-thumbs-more">+{extraThumbs}</span>}
        </div>

        <form
          className="edit-tags-add"
          onSubmit={(event) => {
            event.preventDefault();
            submitAddTag();
          }}
        >
          <Input
            value={addInput}
            onChange={(event) => setAddInput(event.target.value)}
            placeholder="Add a keyword (use Parent/Child for a nested one)"
            aria-label="Add a keyword"
          />
          <Button type="submit" variant="outline" disabled={!addInput.trim()}>
            <IconPlus size={16} />
            Add
          </Button>
        </form>

        {pendingNewTags.length > 0 && (
          <div className="edit-tags-new">
            {pendingNewTags.map((path) => (
              <span className="edit-tags-new-chip" key={path}>
                {path}
                <button
                  type="button"
                  aria-label={`Remove ${path}`}
                  onClick={() => setPendingNewTags((prev) => prev.filter((item) => item !== path))}
                >
                  <IconX size={13} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="edit-tags-search">
          <IconSearch size={16} className="edit-tags-search-icon" />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter keywords"
            aria-label="Filter keywords"
          />
        </div>

        <div className="edit-tags-tree-scroll">
          {isLoading ? (
            <p className="edit-tags-empty">Loading keywords…</p>
          ) : filteredTree.length === 0 ? (
            <p className="edit-tags-empty">
              {tree.length === 0 ? 'No keywords yet. Add one above.' : 'No keywords match your filter.'}
            </p>
          ) : (
            <TagCheckboxTree
              nodes={filteredTree}
              getState={getState}
              onToggle={toggle}
              expandedIds={expandedIds}
              onToggleExpand={toggleExpand}
              forceExpanded={forceExpanded}
            />
          )}
        </div>
        {/* Spacing lives inside the collapsing region so it leaves no gap when closed. */}
        <Collapse open={hasPendingChanges} className="-mt-3">
          <MetadataImpactNotice impact="automatic" showReadOnly className="mt-3" />
        </Collapse>
      </DialogBody>

      <DialogFooter>
        {bulkAction.phase.kind === 'running' ? (
          <BulkActionProgress label={bulkAction.phase.label} progress={bulkAction.phase.progress} />
        ) : (
          <>
            <Button
              variant="ghost"
              className="mr-auto text-muted-foreground hover:text-destructive-text"
              onClick={clearAll}
              disabled={isApplying || !hasPresentTags}
            >
              <IconTagOff size={16} />
              Clear all
            </Button>
            <Button variant="outline" onClick={onClose} disabled={isApplying}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={!canApply}>
              Apply
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}

export function EditTagsDialog() {
  const open = useEditTagsDialog((state) => state.open);
  const assets = useEditTagsDialog((state) => state.assets);
  const close = useEditTagsDialog((state) => state.close);
  const [rendered, setRendered] = useState(assets);
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<BulkActionDialogPhaseKind>('edit');

  useEffect(() => {
    if (open) {
      setRendered(assets);
    } else {
      setIsRunning(false);
      setPhase('edit');
    }
  }, [assets, open]);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !isRunning && close()}>
      <DialogContent
        className={`${phase === 'result' ? '' : 'h-[min(85vh,44rem)]'} w-[min(92vw,40rem)]`}
        hideCloseButton={isRunning}
      >
        <DialogHeader>
          <DialogTitle>Edit tags</DialogTitle>
          <DialogDescription>
            {phase === 'running'
              ? 'Saving keyword changes to the library and photo files.'
              : phase === 'result'
                ? 'Review what was updated and any files that could not be written.'
                : rendered.length === 1
                  ? 'Check the keywords to apply to this photo.'
                  : `Check the keywords to apply to all ${rendered.length} photos. A dash means only some already have that keyword.`}
          </DialogDescription>
        </DialogHeader>
        {open && rendered.length > 0 && (
          <EditTagsContent
            key={rendered.map((asset) => asset.id).join(',')}
            assets={rendered}
            onClose={close}
            onRunningChange={setIsRunning}
            onPhaseChange={setPhase}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
