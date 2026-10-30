import { BulkActionProgress } from '@/components/bulk-action/BulkActionProgress';
import { BulkActionResultStep } from '@/components/bulk-action/BulkActionResultStep';
import { useBulkActionDialog, useInertWhen } from '@/components/bulk-action/useBulkActionDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InputWithIcon } from '@/components/ui/inputWithIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TagsService } from '@/db/api/services/tags.service';
import { TagInClient } from '@/db/models/TagDTO';
import { cn } from '@/lib/utils';
import type { BulkOutcome } from '@/system/bulkOutcome';
import { IconArrowRight, IconGitMerge, IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { TagWriteBackNote } from './TagWriteBackNote';

interface MergeTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: TagInClient[];
  countById: Record<string, number>;
  /**
   * A tag that is always part of the merge and cannot be unticked. Used when the
   * dialog is opened from a tag's detail page: we are merging *this* tag with the
   * other tags the user picks, so removing it from the selection makes no sense.
   */
  lockedTagId?: string;
  /** Reuses the tag merge operation with people-specific user-facing copy. */
  mode?: 'tags' | 'people';
}

/**
 * Merge several tags into a single one. Every photo/video tagged with a source
 * tag is re-tagged with the chosen target, nested tags are re-parented and the
 * now-empty source tags are removed.
 */
export function MergeTagsDialog({
  open,
  onOpenChange,
  tags,
  countById,
  lockedTagId,
  mode = 'tags',
}: MergeTagsDialogProps) {
  const [filter, setFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const bulkAction = useBulkActionDialog();
  const isMerging = bulkAction.phase.kind === 'running';
  const editorRef = useInertWhen(isMerging);

  useEffect(() => {
    if (!open) return;
    setFilter('');
    // The locked tag is always selected and kept as the default target.
    setSelectedIds(lockedTagId ? [lockedTagId] : []);
    setTargetId(lockedTagId ?? null);
    bulkAction.reset();
  }, [open, lockedTagId, bulkAction.reset]);

  const lockedTag = useMemo(
    () => (lockedTagId ? (tags.find((tag) => tag.id === lockedTagId) ?? null) : null),
    [lockedTagId, tags],
  );

  const sortedTags = useMemo(() => [...tags].sort((a, b) => a.fullPath.localeCompare(b.fullPath)), [tags]);

  const filteredTags = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    if (!normalized) return sortedTags;
    return sortedTags.filter((tag) => tag.fullPath.toLowerCase().includes(normalized));
  }, [sortedTags, filter]);

  const selectedTags = useMemo(
    () =>
      selectedIds.map((id) => tags.find((tag) => tag.id === id)).filter((tag): tag is TagInClient => !!tag),
    [selectedIds, tags],
  );

  const toggleSelected = (id: string) => {
    // The locked tag is part of the merge by definition and cannot be unticked.
    if (id === lockedTagId) return;
    setSelectedIds((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      // Keep the target valid: default to the first selection, clear if removed.
      setTargetId((currentTarget) => {
        if (currentTarget && !next.includes(currentTarget)) return next[0] ?? null;
        return currentTarget ?? next[0] ?? null;
      });
      return next;
    });
  };

  const target = selectedTags.find((tag) => tag.id === targetId) ?? null;
  const sources = selectedTags.filter((tag) => tag.id !== targetId);
  const canMerge = !!target && sources.length > 0 && !isMerging;

  // How many extra tags the user picked on top of the locked one.
  const otherSelectedCount = selectedTags.filter((tag) => tag.id !== lockedTagId).length;
  const singular = mode === 'people' ? 'person' : 'tag';
  const plural = mode === 'people' ? 'people' : 'tags';

  const mergedPhotoEstimate = useMemo(
    () => selectedTags.reduce((total, tag) => total + (countById[tag.id] ?? 0), 0),
    [selectedTags, countById],
  );

  const handleMerge = async () => {
    if (!target || sources.length === 0) return;
    const sourceCount = sources.length;
    const targetName = target.name;
    const sourceIds = sources.map((tag) => tag.id);
    const targetIdSnapshot = target.id;

    await bulkAction.run({
      label: `Merging ${plural}`,
      summary: () => `Merged ${sourceCount} ${sourceCount > 1 ? plural : singular} into "${targetName}"`,
      action: async (onFileProgress): Promise<BulkOutcome> => {
        const result = await TagsService.mergeTags(sourceIds, targetIdSnapshot, onFileProgress);
        return {
          total: sourceCount,
          fileCount: result.fileCount,
          fileFailures: result.fileFailures,
        };
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !isMerging && onOpenChange(value)}>
      <DialogContent className="w-[min(92vw,34rem)]" hideCloseButton={isMerging}>
        <DialogHeader>
          <DialogTitle>Merge {plural}</DialogTitle>
          <DialogDescription>
            {bulkAction.phase.kind === 'running'
              ? `Combining ${plural} and updating affected photo files.`
              : bulkAction.phase.kind === 'result'
                ? 'Review what was updated and any files that could not be written.'
                : mode === 'people'
                  ? lockedTag
                    ? 'Pick another person to merge with this one, then choose which person to keep. Their faces and photos will be combined.'
                    : 'Pick the people you want to combine, then choose which person to keep. Their faces and photos will be combined.'
                  : lockedTag
                    ? 'Pick the other tags to merge with this one, then choose which one to keep. All photos and videos move to the tag you keep; the others are removed.'
                    : 'Pick the tags you want to combine, then choose which one to keep. All photos and videos move to the tag you keep; the others are removed.'}
          </DialogDescription>
        </DialogHeader>

        {bulkAction.phase.kind === 'result' ? (
          <BulkActionResultStep
            summary={bulkAction.phase.summary}
            outcome={bulkAction.phase.outcome}
            isUndoing={bulkAction.isUndoing}
            onUndo={() => void bulkAction.undo(() => onOpenChange(false))}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <>
            <DialogBody
              ref={editorRef}
              className={`flex flex-col gap-3 overflow-hidden ${
                isMerging ? 'pointer-events-none select-none opacity-60' : ''
              }`}
              aria-busy={isMerging}
            >
              {lockedTag && (
                <div className="flex items-start gap-2 rounded-md border border-border bg-accent/40 px-3 py-2 text-sm">
                  <IconGitMerge size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    Merging <strong className="text-foreground">{lockedTag.name}</strong> with{' '}
                    <strong className="text-foreground">{otherSelectedCount.toLocaleString()}</strong>{' '}
                    {otherSelectedCount === 1 ? `other ${singular}` : `other ${plural}`}
                    {otherSelectedCount === 0
                      ? ` — select the ${plural} to merge below.`
                      : ' selected below.'}
                  </span>
                </div>
              )}

              <InputWithIcon
                startIcon={<IconSearch />}
                type="text"
                placeholder={`Search ${plural}`}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />

              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
                {filteredTags.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No {plural} match your search.</p>
                ) : (
                  filteredTags.map((tag) => {
                    const checked = selectedIds.includes(tag.id);
                    const isLocked = tag.id === lockedTagId;
                    return (
                      <label
                        key={tag.id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 text-sm transition-colors',
                          isLocked ? 'cursor-default bg-accent/40' : 'cursor-pointer hover:bg-accent',
                          checked && !isLocked && 'bg-accent/60',
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={isLocked}
                          onCheckedChange={() => toggleSelected(tag.id)}
                        />
                        <span className="min-w-0 flex-1 truncate" title={tag.fullPath}>
                          {tag.fullPath}
                        </span>
                        {isLocked && <Badge variant="secondary">Current</Badge>}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {(countById[tag.id] ?? 0).toLocaleString()}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              {selectedTags.length >= 2 && (
                <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
                  <label className="text-sm font-medium" htmlFor="merge-target-select">
                    Keep this tag
                  </label>
                  <Select value={targetId ?? undefined} onValueChange={setTargetId}>
                    <SelectTrigger id="merge-target-select">
                      <SelectValue placeholder="Select a tag to keep" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedTags.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          {tag.fullPath}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {target && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <IconGitMerge size={14} className="shrink-0" />
                      <span className="truncate">{sources.map((tag) => tag.name).join(', ')}</span>
                      <IconArrowRight size={14} className="shrink-0" />
                      <strong className="text-foreground">{target.name}</strong>
                    </p>
                  )}
                </div>
              )}

              {selectedTags.length >= 2 ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Up to {mergedPhotoEstimate.toLocaleString()} photos/videos will be reorganized.
                  </p>
                  <TagWriteBackNote />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Select at least two {plural} to merge.</p>
              )}
            </DialogBody>

            <DialogFooter>
              {bulkAction.phase.kind === 'running' ? (
                <BulkActionProgress label={bulkAction.phase.label} progress={bulkAction.phase.progress} />
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isMerging}
                  >
                    Cancel
                  </Button>
                  <Button type="button" onClick={() => void handleMerge()} disabled={!canMerge}>
                    Merge {plural}
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
