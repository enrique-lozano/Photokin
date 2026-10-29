import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { TagsService } from '@/db/api/services/tags.service';
import { TagInClient } from '@/db/models/TagDTO';
import { IconTagOff, IconTrash, IconUserOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { toast } from '@/components/ui/toast';
import { trackProcess } from '@/system/processTracker';
import { ProcessKind } from '@/stores/processStore';

type DeleteTagsDialogProps =
  | {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      mode: 'single';
      tag: TagInClient | null;
      entityKind?: 'tag' | 'person';
    }
  | {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      mode: 'unused';
      tag?: never;
      entityKind?: never;
    };

export function DeleteTagsDialog(props: DeleteTagsDialogProps) {
  const { open, onOpenChange, mode } = props;
  const tag = mode === 'single' ? props.tag : null;
  const entityKind = mode === 'single' ? (props.entityKind ?? 'tag') : 'tag';

  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  /** Photos affected for single mode; tag count for unused mode. */
  const [affectedCount, setAffectedCount] = useState(0);
  const [faceRegionCount, setFaceRegionCount] = useState(0);
  const [unusedTagNames, setUnusedTagNames] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsLoadingStats(true);
    setIsDeleting(false);
    setAffectedCount(0);
    setFaceRegionCount(0);
    setUnusedTagNames([]);

    const loadStats = async (): Promise<void> => {
      if (mode === 'single') {
        const [assetCount, regionCount] = tag
          ? await Promise.all([TagsService.getAssetCount(tag.id), TagsService.getFaceRegionCount(tag.id)])
          : [0, 0];
        if (!cancelled) {
          setAffectedCount(assetCount);
          setFaceRegionCount(regionCount);
        }
        return;
      }

      const [unusedIds, tags] = await Promise.all([TagsService.getUnusedTagIds(), TagsService.getAll()]);
      if (cancelled) return;

      const unused = new Set(unusedIds);
      setAffectedCount(unusedIds.length);
      setUnusedTagNames(
        tags
          .filter((candidate) => unused.has(candidate.id))
          .map((candidate) => candidate.fullPath)
          .sort((left, right) => left.localeCompare(right)),
      );
    };

    loadStats()
      .catch((error) => {
        if (!cancelled) toast.error(String(error));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingStats(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, tag]);

  const handleConfirm = async () => {
    setIsDeleting(true);

    try {
      if (mode === 'single') {
        if (!tag) return;
        const name = tag.name;
        await trackProcess(
          {
            kind: ProcessKind.Generic,
            title: entityKind === 'person' ? `Removing person · ${name}` : `Deleting tag · ${name}`,
            progress: 0,
            successMessage: entityKind === 'person' ? `Person "${name}" removed` : `Tag "${name}" deleted`,
            getWarnings: (result: { warnings: string[] }) => result.warnings,
          },
          async (reporter) =>
            TagsService.delete(tag.id, (processed, total) => reporter.setProgress(processed, total)),
        );
      } else {
        const removed = await TagsService.deleteUnusedTags();
        toast.success(
          removed === 0
            ? 'No unused tags to remove'
            : `${removed} unused tag${removed > 1 ? 's' : ''} removed`,
        );
      }

      onOpenChange(false);
    } catch (error) {
      if (mode !== 'single') toast.error(String(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const title =
    mode === 'single'
      ? entityKind === 'person'
        ? `Remove "${tag?.name ?? ''}"?`
        : `Delete "${tag?.name ?? ''}"?`
      : isLoadingStats
        ? 'Delete unused tags?'
        : `Delete ${affectedCount.toLocaleString()} unused tag${affectedCount === 1 ? '' : 's'}?`;

  const hasFaceRegions = faceRegionCount > 0;

  const description = isLoadingStats
    ? mode === 'single'
      ? 'Checking what will be removed…'
      : 'Looking for unused tags…'
    : mode === 'unused'
      ? affectedCount === 0
        ? 'There are no unused tags to delete.'
        : `Permanently remove ${affectedCount.toLocaleString()} tag${affectedCount === 1 ? '' : 's'} that aren't used by any photo or video.`
      : `${
          entityKind === 'person'
            ? `This permanently removes “${tag?.name ?? ''}” and any nested tags`
            : 'This permanently removes this tag and all of its nested tags'
        }${
          affectedCount === 0
            ? '. They are not used by any library items.'
            : ` from ${affectedCount.toLocaleString()} library item${affectedCount === 1 ? '' : 's'}.`
        }${
          hasFaceRegions
            ? ` Its ${faceRegionCount.toLocaleString()} face region${faceRegionCount === 1 ? '' : 's'} and their recognition data are deleted too; other people in those photos are untouched.`
            : ''
        }`;

  const preview =
    mode === 'unused' && !isLoadingStats && unusedTagNames.length > 0 ? (
      <div className="rounded-md border bg-muted/20 p-3">
        <p className="text-xs font-medium text-muted-foreground">Tags to be deleted</p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {unusedTagNames.slice(0, 6).map((name) => (
            <li key={name} className="truncate" title={name}>
              {name}
            </li>
          ))}
        </ul>
        {unusedTagNames.length > 6 && (
          <p className="mt-2 text-xs text-muted-foreground">
            And {(unusedTagNames.length - 6).toLocaleString()} more
          </p>
        )}
      </div>
    ) : undefined;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={
        mode === 'unused' ? (
          <IconTrash size={24} />
        ) : entityKind === 'person' || hasFaceRegions ? (
          <IconUserOff size={24} />
        ) : (
          <IconTagOff size={24} />
        )
      }
      title={title}
      description={description}
      confirmLabel={
        mode === 'single'
          ? entityKind === 'person'
            ? 'Remove person'
            : 'Delete tag'
          : `Delete ${affectedCount.toLocaleString()} tag${affectedCount === 1 ? '' : 's'}`
      }
      onConfirm={() => void handleConfirm()}
      tone={mode === 'unused' ? 'warning' : 'destructive'}
      fileMetadataImpact={mode === 'single' && affectedCount > 0 ? 'automatic' : undefined}
      content={preview}
      confirmDisabled={isLoadingStats || (mode === 'single' ? !tag : affectedCount === 0)}
      isConfirming={isDeleting}
      keepOpenOnConfirm
    />
  );
}
