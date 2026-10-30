import { BulkActionProgress } from '@/components/bulk-action/BulkActionProgress';
import { BulkActionResult } from '@/components/bulk-action/BulkActionResult';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SplitButton, SplitButtonMain } from '@/components/ui/split-button';
import { toast } from '@/components/ui/toast';
import { PersonRegion } from '@/db/models/PersonInfo';
import type { BulkFileProgress, BulkOutcome } from '@/system/bulkOutcome';
import { IconArrowBackUp, IconCheck, IconClock, IconEyeOff, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { FaceSelectionGrid } from './FaceSelectionGrid';
import { mergeOutcomes, UnselectedFacesMenu, UnselectedFacesOption } from './UnselectedFacesMenu';

type FaceAction = 'confirm' | 'dismiss' | 'hide' | 'delete';

/** What happens to the faces the user leaves unselected. */
type Leftover = 'dismiss' | 'keep' | 'hide' | 'delete';

function leftoverOptions(personName: string): UnselectedFacesOption<Leftover>[] {
  return [
    {
      value: 'dismiss',
      label: 'Dismiss',
      hint: `Not ${personName}. They go back to Unknown faces`,
      icon: <IconArrowBackUp size={16} />,
    },
    {
      value: 'keep',
      label: 'Keep as suggestions',
      hint: 'Decide on them later',
      icon: <IconClock size={16} />,
    },
    {
      value: 'hide',
      label: 'Ignore',
      hint: 'Someone you don’t know or don’t want in People',
      icon: <IconEyeOff size={16} />,
    },
    {
      value: 'delete',
      label: 'Not a face',
      hint: 'The face detector got these wrong',
      icon: <IconTrash size={16} />,
      destructive: true,
    },
  ];
}

/** Reports how many of the affected files have been written so far. */
type FileProgress = (processed: number, total: number) => void;

/**
 * The modal's own view of the work, which stops matching the live rows the
 * moment an action starts: confirming a face removes it from the suggestion
 * query while its files are still being written. `running` and `result` keep
 * the snapshot the action was launched with so the counts on screen never
 * collapse to zero mid-write.
 */
type Phase =
  | {
      kind: 'review';
    }
  | {
      kind: 'running';
      /** The step in progress: confirming the selection, then the leftovers. */
      step: FaceAction;
      regions: PersonRegion[];
      selectedIds: string[];
      progress: BulkFileProgress;
    }
  | { kind: 'result'; summary: string; outcome: BulkOutcome };

type SuggestionsReviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  regions: PersonRegion[];
  onConfirm: (regionIds: string[], onFileProgress: FileProgress) => Promise<BulkOutcome>;
  onDismiss: (regionIds: string[]) => Promise<BulkOutcome>;
  onDeleteAll: (regionIds: string[], onFileProgress: FileProgress) => Promise<BulkOutcome>;
  onHide: (regionIds: string[], onFileProgress: FileProgress) => Promise<BulkOutcome>;
};

function countFaces(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'face' : 'faces'}`;
}

/** The leftovers' part of the button label, e.g. "dismiss 2"; `all` when nothing is confirmed. */
function leftoverVerb(leftover: Leftover, count: number, all: boolean): string {
  const n = all && count > 1 ? `all ${count.toLocaleString()}` : count.toLocaleString();
  if (leftover === 'dismiss') return `dismiss ${n}`;
  if (leftover === 'hide') return `ignore ${n}`;
  return `mark ${n} as ${count === 1 ? 'not a face' : 'not faces'}`;
}

export function SuggestionsReviewModal({
  open,
  onOpenChange,
  personName,
  regions,
  onConfirm,
  onDismiss,
  onDeleteAll,
  onHide,
}: SuggestionsReviewModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [leftover, setLeftover] = useState<Leftover>('dismiss');
  const [phase, setPhase] = useState<Phase>({ kind: 'review' });
  const [isUndoing, setIsUndoing] = useState(false);

  const regionKey = regions.map((region) => region.id).join(',');

  // Keyed on the suggestion membership rather than the array identity, so a
  // live-query refresh mid-review doesn't wipe what the user deselected. Only
  // seeded while reviewing: once an action runs, the incoming rows describe the
  // result of the write, not what the user is acting on.
  useEffect(() => {
    if (open && phase.kind === 'review') setSelectedIds(regionKey.split(',').filter(Boolean));
  }, [open, regionKey, phase.kind]);

  // Back to the safe default every time, so "Not a face" never carries over
  // from an earlier review.
  useEffect(() => {
    if (!open) {
      setPhase({ kind: 'review' });
      setLeftover('dismiss');
      setIsUndoing(false);
    }
  }, [open]);

  // Intersected with the rows still on screen: a face the user selected may
  // already have been named elsewhere, and the services reject unknown ids.
  const selectedSet = new Set(selectedIds);
  const toConfirm = regions.filter((region) => selectedSet.has(region.id));
  const unselected = regions.filter((region) => !selectedSet.has(region.id));
  const toLeftover = leftover === 'keep' ? [] : unselected;
  const options = leftoverOptions(personName);
  const leftoverOption = options.find((option) => option.value === leftover)!;

  const actionLabel =
    toConfirm.length > 0
      ? `Confirm ${toConfirm.length.toLocaleString()}${toLeftover.length > 0 ? ` · ${leftoverVerb(leftover, toLeftover.length, false)}` : ''}`
      : toLeftover.length > 0
        ? leftoverVerb(leftover, toLeftover.length, true).replace(/^./, (c) => c.toUpperCase())
        : 'Confirm';

  function summaryFor(confirmed: number, leftoverCount: number): string {
    const parts: string[] = [];
    if (confirmed > 0) parts.push(`confirmed ${countFaces(confirmed)} for ${personName}`);
    if (leftoverCount > 0) {
      const faces = countFaces(leftoverCount);
      parts.push(
        leftover === 'dismiss'
          ? `sent ${faces} back to Unknown faces`
          : leftover === 'hide'
            ? `ignored ${faces}`
            : `marked ${faces} as not faces`,
      );
    }
    const text = parts.join(' and ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  async function apply() {
    const steps: { action: FaceAction; regions: PersonRegion[] }[] = [
      { action: 'confirm' as const, regions: toConfirm },
      { action: leftover === 'keep' ? 'dismiss' : leftover, regions: toLeftover },
    ].filter((step) => step.regions.length > 0);
    if (steps.length === 0) return;

    const snapshot = steps.flatMap((step) => step.regions);
    const snapshotSelected = toConfirm.map((region) => region.id);
    const outcomes: BulkOutcome[] = [];

    for (const { action, regions: stepRegions } of steps) {
      setPhase({
        kind: 'running',
        step: action,
        regions: snapshot,
        selectedIds: snapshotSelected,
        progress: null,
      });
      const mutate =
        action === 'confirm'
          ? onConfirm
          : action === 'dismiss'
            ? onDismiss
            : action === 'hide'
              ? onHide
              : onDeleteAll;
      try {
        outcomes.push(
          await mutate(
            stepRegions.map((region) => region.id),
            (processed, total) =>
              setPhase((current) =>
                current.kind === 'running' ? { ...current, progress: { processed, total } } : current,
              ),
          ),
        );
      } catch (error) {
        toast.error(String(error));
        // Nothing was applied yet, so drop straight back to the review list.
        // Otherwise report what did go through, undo included.
        if (outcomes.length === 0) {
          setPhase({ kind: 'review' });
          return;
        }
        break;
      }
    }

    const outcome = mergeOutcomes(outcomes);
    setPhase({
      kind: 'result',
      summary: summaryFor(
        outcomes.length > 0 && steps[0].action === 'confirm' ? toConfirm.length : 0,
        outcomes.length === steps.length ? toLeftover.length : 0,
      ),
      outcome,
    });
  }

  async function handleUndo() {
    if (phase.kind !== 'result' || !phase.outcome.undo) return;

    setIsUndoing(true);
    try {
      await phase.outcome.undo();
      toast.success('Change undone');
      onOpenChange(false);
    } catch (error) {
      toast.error(`Could not undo change: ${String(error)}`);
    } finally {
      setIsUndoing(false);
    }
  }

  // Reachable when the last suggestion is handled from somewhere else while
  // this is open. Says so, rather than showing a grid of nothing under buttons
  // counting to zero.
  const isEmpty = phase.kind === 'review' && regions.length === 0;

  const description = isEmpty
    ? `Nothing is waiting for review on ${personName} any more.`
    : phase.kind === 'review'
      ? `Select the faces that are ${personName}. ${
          leftover === 'dismiss'
            ? 'The rest go back to Unknown faces.'
            : leftover === 'keep'
              ? 'The rest stay as suggestions.'
              : leftover === 'hide'
                ? 'The rest are ignored.'
                : 'The rest are marked as not faces.'
        }`
      : phase.kind === 'running'
        ? `${phase.regions.length.toLocaleString()} ${phase.regions.length === 1 ? 'face' : 'faces'} — saving your library and the photo files.`
        : 'Here’s what changed.';

  return (
    <Dialog open={open} onOpenChange={(value) => phase.kind !== 'running' && onOpenChange(value)}>
      <DialogContent className="w-[min(94vw,42rem)]" hideCloseButton={phase.kind === 'running'}>
        <DialogHeader>
          <DialogTitle>Review suggestions for {personName}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          {phase.kind === 'result' ? (
            <BulkActionResult summary={phase.summary} outcome={phase.outcome} />
          ) : isEmpty ? (
            <p className="suggestions-modal-empty">No suggested faces left.</p>
          ) : (
            <FaceSelectionGrid
              regions={phase.kind === 'running' ? phase.regions : regions}
              selectedIds={phase.kind === 'running' ? phase.selectedIds : selectedIds}
              onSelectedIdsChange={setSelectedIds}
              readOnly={phase.kind === 'running'}
              unselectedBadge={leftover === 'keep' ? undefined : leftoverOption.icon}
            />
          )}
        </DialogBody>

        <DialogFooter>
          {phase.kind === 'running' ? (
            <BulkActionProgress
              label={
                phase.step === 'confirm'
                  ? 'Confirming faces'
                  : phase.step === 'dismiss'
                    ? 'Dismissing suggestions'
                    : phase.step === 'hide'
                      ? 'Ignoring faces'
                      : 'Marking as not faces'
              }
              progress={phase.progress}
            />
          ) : phase.kind === 'result' ? (
            <>
              {phase.outcome.undo && (
                <Button variant="outline" onClick={() => void handleUndo()} isLoading={isUndoing}>
                  Undo
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)} disabled={isUndoing}>
                Done
              </Button>
            </>
          ) : isEmpty ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <SplitButton
                variant={toConfirm.length === 0 && leftover === 'delete' ? 'destructive' : 'default'}
              >
                <SplitButtonMain
                  onClick={() => void apply()}
                  disabled={toConfirm.length + toLeftover.length === 0}
                >
                  {toConfirm.length > 0 ? <IconCheck size={16} /> : leftoverOption.icon}
                  {actionLabel}
                </SplitButtonMain>
                <UnselectedFacesMenu
                  options={options}
                  value={leftover}
                  onValueChange={setLeftover}
                  unselectedCount={unselected.length}
                />
              </SplitButton>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
