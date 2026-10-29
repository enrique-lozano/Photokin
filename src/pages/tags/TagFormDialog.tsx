import { Button } from '@/components/ui/button';
import { BulkActionProgress } from '@/components/bulk-action/BulkActionProgress';
import { BulkActionResultStep } from '@/components/bulk-action/BulkActionResultStep';
import { useBulkActionDialog, useInertWhen } from '@/components/bulk-action/useBulkActionDialog';
import { Collapse } from '@/components/ui/collapse';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { TagsService } from '@/db/api/services/tags.service';
import { TagInClient } from '@/db/models/TagDTO';
import type { BulkOutcome } from '@/system/bulkOutcome';
import { IconInfoCircle } from '@tabler/icons-react';
import { FormEvent, useEffect, useState } from 'react';
import { TagColorPicker } from './TagColorPicker';
import { TagWriteBackNote } from './TagWriteBackNote';

interface TagFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided the dialog edits this tag, otherwise it creates a new one. */
  tag?: TagInClient | null;
}

export function TagFormDialog({ open, onOpenChange, tag }: TagFormDialogProps) {
  const isEditing = !!tag;

  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const bulkAction = useBulkActionDialog();
  const isUpdatingFiles = bulkAction.phase.kind === 'running';
  const editorRef = useInertWhen(isUpdatingFiles);

  useEffect(() => {
    if (!open) return;

    setName(tag?.name ?? '');
    setColor(tag?.color ?? null);
    setIsSaving(false);
    bulkAction.reset();
  }, [open, tag?.id, bulkAction.reset]);

  const trimmedName = name.trim();
  // Editing renames a single node, so slashes would be misleading here.
  const normalizedName = trimmedName.replace(/\//g, ' ');
  const canSubmit = trimmedName.length > 0 && !isSaving && !isUpdatingFiles;
  // Nested tags inherit their root's color, so only a root tag can be colored.
  const canColor = isEditing ? tag?.parentId === null : !trimmedName.includes('/');
  const colorChange = canColor ? { color } : {};
  // Only a rename reaches the files: color lives in Photokin's database alone.
  const rewritesFiles = isEditing && trimmedName.length > 0 && normalizedName !== tag?.name;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    if (isEditing && tag && rewritesFiles) {
      await bulkAction.run({
        label: 'Updating tag',
        summary: () => 'Tag updated',
        action: async (onFileProgress): Promise<BulkOutcome> => {
          const result = await TagsService.update(
            tag.id,
            { name: normalizedName, ...colorChange },
            onFileProgress,
          );
          return {
            total: 1,
            fileCount: result.fileCount,
            fileFailures: result.fileFailures,
            undo: async () => {
              const current = await TagsService.getByUUID(tag.id);
              if (current.name !== normalizedName || (canColor && current.color !== color)) {
                throw new Error('This tag was edited again after the rename');
              }
              const reverted = await TagsService.update(tag.id, {
                name: tag.name,
                ...(canColor ? { color: tag.color } : {}),
              });
              if (reverted.fileFailures.length > 0) {
                throw new Error(reverted.warnings.join('; '));
              }
            },
          };
        },
      });
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && tag) {
        await TagsService.update(tag.id, { name: normalizedName, ...colorChange });
        toast.success('Tag updated');
      } else {
        const created = await TagsService.createTag(trimmedName, color);
        toast.success(`Tag "${created.fullPath}" created`);
      }

      onOpenChange(false);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !isUpdatingFiles && onOpenChange(value)}>
      <DialogContent className="w-[min(92vw,28rem)]" hideCloseButton={isUpdatingFiles}>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit tag' : 'New tag'}</DialogTitle>
            <DialogDescription>
              {bulkAction.phase.kind === 'running'
                ? 'Renaming this tag in the library and affected photo files.'
                : bulkAction.phase.kind === 'result'
                  ? 'Review what was updated and any files that could not be written.'
                  : isEditing
                    ? canColor
                      ? 'Rename this tag and optionally pick a color.'
                      : 'Rename this tag. It uses the color of its top-level tag.'
                    : 'Create a new tag. Nested tags use the color of their top-level tag.'}
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
                className={`flex flex-col gap-4 ${
                  isUpdatingFiles ? 'pointer-events-none select-none opacity-60' : ''
                }`}
                aria-busy={isUpdatingFiles}
              >
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="tag-name-input">
                    {isEditing ? 'Name' : 'Name or path'}
                  </label>
                  <Input
                    id="tag-name-input"
                    autoFocus
                    value={name}
                    placeholder={isEditing ? 'Tag name' : 'e.g. Travel/Spain/Madrid'}
                    onChange={(event) => setName(event.target.value)}
                  />

                  {!isEditing && (
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                      <IconInfoCircle size={16} className="mt-px shrink-0" />
                      <span>
                        Use <code className="font-mono">/</code> to create nested tags. For example{' '}
                        <code className="font-mono">Travel/Spain</code> creates a <strong>Spain</strong> tag
                        inside <strong>Travel</strong> (existing levels are reused).
                      </span>
                    </p>
                  )}
                </div>

                {canColor && (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Color</span>
                    <TagColorPicker value={color} onChange={setColor} seed={tag?.id ?? trimmedName} />
                  </div>
                )}

                {/* Spacing lives inside the collapsing region so it leaves no gap when closed. */}
                <Collapse open={rewritesFiles} className="-mt-4">
                  <TagWriteBackNote className="mt-4" />
                </Collapse>
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
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={!canSubmit}>
                      {isSaving ? 'Saving...' : isEditing ? 'Save changes' : 'Create tag'}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
