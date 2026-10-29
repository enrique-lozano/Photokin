import { BulkActionProgress } from '@/components/bulk-action/BulkActionProgress';
import { BulkActionResultStep } from '@/components/bulk-action/BulkActionResultStep';
import { useBulkActionDialog, useInertWhen } from '@/components/bulk-action/useBulkActionDialog';
import { Button } from '@/components/ui/button';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { TagsService } from '@/db/api/services/tags.service';
import { PersonSex } from '@/db/models/TagDTO';
import type { BulkOutcome } from '@/system/bulkOutcome';
import { FormEvent, useEffect, useState } from 'react';
import { TagWriteBackNote } from '../tags/TagWriteBackNote';
import { derivePersonAge } from './personBio';

/**
 * Sentinel for the "Unspecified" sex option: Radix `SelectItem` forbids an empty
 * string value, so we map '' ⇆ this constant at the Select boundary.
 */
const SEX_UNSPECIFIED = 'unspecified';

type PersonFormTarget = {
  id: string;
  name: string;
  sex: PersonSex | null;
  dateBirth: string | null;
  dateDead: string | null;
  description: string | null;
};

type PersonEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: PersonFormTarget | null;
};

export function PersonEditDialog({ open, onOpenChange, person }: PersonEditDialogProps) {
  const [name, setName] = useState('');
  const [sex, setSex] = useState<PersonSex | ''>('');
  const [dateBirth, setDateBirth] = useState('');
  const [dateDead, setDateDead] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const bulkAction = useBulkActionDialog();
  const isUpdatingFiles = bulkAction.phase.kind === 'running';
  const editorRef = useInertWhen(isUpdatingFiles);

  useEffect(() => {
    if (!open || !person) return;

    setName(person.name);
    setSex(person.sex ?? '');
    setDateBirth(person.dateBirth ?? '');
    setDateDead(person.dateDead ?? '');
    setDescription(person.description ?? '');
    setIsSaving(false);
    bulkAction.reset();
  }, [open, person?.id, bulkAction.reset]);

  const trimmedName = name.trim();
  const normalizedName = trimmedName.replace(/\//g, ' ');
  const canSubmit = trimmedName.length > 0 && !isSaving && !isUpdatingFiles;
  // Only the rename is mirrored into the files; every other field on this form
  // (sex, dates, description) stays in Photokin.
  const rewritesFiles = trimmedName.length > 0 && normalizedName !== person?.name;
  const derivedAge = derivePersonAge(dateBirth, dateDead);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !person) return;

    const save = async (onFileProgress?: (processed: number, total: number) => void) => {
      const result = await TagsService.update(
        person.id,
        {
          name: normalizedName,
          sex: sex || null,
          dateBirth: dateBirth || null,
          dateDead: dateDead || null,
          description: description || null,
        },
        onFileProgress,
      );

      return result;
    };

    if (rewritesFiles) {
      await bulkAction.run({
        label: 'Updating person',
        summary: () => 'Person updated',
        action: async (onFileProgress): Promise<BulkOutcome> => {
          const result = await save(onFileProgress);
          return {
            total: 1,
            fileCount: result.fileCount,
            fileFailures: result.fileFailures,
            undo: async () => {
              const current = await TagsService.getByUUID(person.id);
              const expected = {
                name: normalizedName,
                sex: sex || null,
                dateBirth: dateBirth || null,
                dateDead: dateDead || null,
                description: description.trim() || null,
              };
              if (
                current.name !== expected.name ||
                current.sex !== expected.sex ||
                current.dateBirth !== expected.dateBirth ||
                current.dateDead !== expected.dateDead ||
                current.description !== expected.description
              ) {
                throw new Error('This person was edited again after the change');
              }

              const reverted = await TagsService.update(person.id, {
                name: person.name,
                sex: person.sex,
                dateBirth: person.dateBirth,
                dateDead: person.dateDead,
                description: person.description,
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
      await save();
      toast.success('Person updated');
      onOpenChange(false);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !isUpdatingFiles && onOpenChange(value)}>
      <DialogContent className="w-[min(92vw,34rem)]" hideCloseButton={isUpdatingFiles}>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Edit details</DialogTitle>
            <DialogDescription>
              {bulkAction.phase.kind === 'running'
                ? 'Renaming this person in the library and affected photo files.'
                : bulkAction.phase.kind === 'result'
                  ? 'Review what was updated and any files that could not be written.'
                  : 'Update this person’s details.'}
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
                  <label className="text-sm font-medium" htmlFor="person-name-input">
                    Name
                  </label>
                  <Input
                    id="person-name-input"
                    autoFocus
                    value={name}
                    placeholder="Person name"
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="person-sex-input">
                    Sex
                  </label>
                  <Select
                    value={sex === '' ? SEX_UNSPECIFIED : sex}
                    onValueChange={(value) => setSex(value === SEX_UNSPECIFIED ? '' : (value as PersonSex))}
                  >
                    <SelectTrigger id="person-sex-input" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEX_UNSPECIFIED}>Unspecified</SelectItem>
                      <SelectItem value={PersonSex.Female}>Female</SelectItem>
                      <SelectItem value={PersonSex.Male}>Male</SelectItem>
                      <SelectItem value={PersonSex.Other}>Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="flex min-w-0 flex-col gap-2">
                    <label className="text-sm font-medium" htmlFor="person-birth-input">
                      Born
                    </label>
                    <Input
                      id="person-birth-input"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Year"
                      value={dateBirth}
                      onChange={(event) => setDateBirth(event.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </div>

                  <div className="flex min-w-0 flex-col gap-2">
                    <label className="text-sm font-medium" htmlFor="person-dead-input">
                      Died
                    </label>
                    <Input
                      id="person-dead-input"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Year"
                      value={dateDead}
                      onChange={(event) => setDateDead(event.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </div>

                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-sm font-medium">Age</span>
                    <div className="flex h-10 items-center gap-2 rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground">
                      {derivedAge ? (
                        <>
                          <strong className="text-foreground">{derivedAge.age}</strong>
                          derived
                        </>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="person-description-input">
                    Brief description
                  </label>
                  <Textarea
                    id="person-description-input"
                    value={description}
                    rows={3}
                    placeholder="A sentence or two about this person…"
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>

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
                      {isSaving ? 'Saving...' : 'Save changes'}
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
