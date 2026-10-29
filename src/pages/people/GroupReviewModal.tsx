import { BulkActionProgress } from '@/components/bulk-action/BulkActionProgress';
import { BulkActionResultStep } from '@/components/bulk-action/BulkActionResultStep';
import { useBulkActionDialog } from '@/components/bulk-action/useBulkActionDialog';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SplitButton, SplitButtonMain } from '@/components/ui/split-button';
import { toast } from '@/components/ui/toast';
import { PersonRegion } from '@/db/models/PersonInfo';
import { TagInClient } from '@/db/models/TagDTO';
import type { BulkOutcome } from '@/system/bulkOutcome';
import { IconClock, IconEyeOff, IconTrash, IconUnlink, IconUserPlus } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { AssignFacePopover, AssignPersonOption } from './AssignFacePopover';
import { FaceSelectionGrid } from './FaceSelectionGrid';
import { mergeOutcomes, UnselectedFacesMenu, UnselectedFacesOption } from './UnselectedFacesMenu';

/** What happens to the faces the user leaves unselected. */
type Leftover = 'remove' | 'keep' | 'hide' | 'delete';

const LEFTOVER_OPTIONS: UnselectedFacesOption<Leftover>[] = [
  {
    value: 'remove',
    label: 'Remove from group',
    hint: 'They don’t belong here. They go back to Unknown faces on their own',
    icon: <IconUnlink size={16} />,
  },
  {
    value: 'keep',
    label: 'Keep in group',
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

type FileProgress = (processed: number, total: number) => void;

function countFaces(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'face' : 'faces'}`;
}

type GroupReviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Heading for the group under review, e.g. "Group 3". */
  groupLabel: string;
  regions: PersonRegion[];
  existingPeople: AssignPersonOption[];
  existingTags: TagInClient[];
  onAssignExisting: (
    regionIds: string[],
    tagId: string,
    onFileProgress: (processed: number, total: number) => void,
  ) => Promise<BulkOutcome>;
  onCreateNew: (
    regionIds: string[],
    name: string,
    onFileProgress: (processed: number, total: number) => void,
  ) => Promise<BulkOutcome>;
  onBreakUp: (regionIds: string[]) => Promise<BulkOutcome>;
  onHide: (
    regionIds: string[],
    onFileProgress: (processed: number, total: number) => void,
  ) => Promise<BulkOutcome>;
  onDiscard: (
    regionIds: string[],
    onFileProgress: (processed: number, total: number) => void,
  ) => Promise<BulkOutcome>;
};

/**
 * Review a suggested group before naming it: every face in the cluster is shown
 * so a wrong member can be deselected. The selected faces are named; the split
 * button's menu picks what happens to the rest, and with nothing selected the
 * button acts on the whole group.
 */
export function GroupReviewModal({
  open,
  onOpenChange,
  groupLabel,
  regions,
  existingPeople,
  existingTags,
  onAssignExisting,
  onCreateNew,
  onBreakUp,
  onHide,
  onDiscard,
}: GroupReviewModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [leftover, setLeftover] = useState<Leftover>('remove');
  const bulkAction = useBulkActionDialog();
  const isRunning = bulkAction.phase.kind === 'running';
  const regionKey = regions.map((region) => region.id).join(',');

  // Keyed on the group's membership, not on the array identity, so a live-query
  // refresh mid-review doesn't wipe what the user already deselected.
  useEffect(() => {
    if (open && bulkAction.phase.kind === 'edit') {
      setSelectedIds(regionKey.split(',').filter(Boolean));
    }
  }, [open, regionKey, bulkAction.phase.kind]);

  // Back to the safe default every time, so "Not a face" never carries over
  // from an earlier review.
  useEffect(() => {
    if (open) {
      bulkAction.reset();
      setLeftover('remove');
    }
  }, [open, bulkAction.reset]);

  const selectedSet = new Set(selectedIds);
  const toAssign = regions.filter((region) => selectedSet.has(region.id));
  const unselected = regions.filter((region) => !selectedSet.has(region.id));
  const toLeftover = leftover === 'keep' ? [] : unselected;
  const leftoverOption = LEFTOVER_OPTIONS.find((option) => option.value === leftover)!;

  const leftoverLabel =
    leftover === 'remove'
      ? toAssign.length > 0
        ? `remove ${toLeftover.length.toLocaleString()}`
        : 'Break up group'
      : leftover === 'hide'
        ? toAssign.length > 0
          ? `ignore ${toLeftover.length.toLocaleString()}`
          : `Ignore ${toLeftover.length > 1 ? 'all ' : ''}${toLeftover.length.toLocaleString()}`
        : toAssign.length > 0
          ? `mark ${toLeftover.length.toLocaleString()} as ${toLeftover.length === 1 ? 'not a face' : 'not faces'}`
          : `Mark ${toLeftover.length > 1 ? 'all ' : ''}${toLeftover.length.toLocaleString()} as ${toLeftover.length === 1 ? 'not a face' : 'not faces'}`;

  const actionLabel =
    toAssign.length > 0
      ? `Assign ${toAssign.length.toLocaleString()}${toLeftover.length > 0 ? ` · ${leftoverLabel}` : ''}`
      : toLeftover.length > 0
        ? leftoverLabel
        : 'Assign';

  function close() {
    onOpenChange(false);
  }

  function runLeftover(regionIds: string[], onFileProgress: FileProgress): Promise<BulkOutcome> {
    if (leftover === 'remove') return onBreakUp(regionIds);
    if (leftover === 'hide') return onHide(regionIds, onFileProgress);
    return onDiscard(regionIds, onFileProgress);
  }

  function describeLeftover(count: number): string {
    if (leftover === 'remove')
      return toAssign.length > 0 ? `removed ${countFaces(count)} from the group` : `broke up ${groupLabel}`;
    return leftover === 'hide' ? `ignored ${countFaces(count)}` : `marked ${countFaces(count)} as not faces`;
  }

  /**
   * Names the selection first, then applies the chosen leftover action. A
   * failure in the second step still reports the first, so its undo stays
   * reachable.
   */
  async function apply(
    label: string,
    describeAssign: (count: number) => string,
    assign?: (regionIds: string[], onFileProgress: FileProgress) => Promise<BulkOutcome>,
  ) {
    const assignIds = toAssign.map((region) => region.id);
    const leftoverIds = toLeftover.map((region) => region.id);
    let leftoverApplied = false;

    await bulkAction.run({
      label,
      summary: () => {
        const parts = [
          ...(assign ? [describeAssign(assignIds.length)] : []),
          ...(leftoverApplied ? [describeLeftover(leftoverIds.length)] : []),
        ];
        const text = parts.join(' and ');
        return text.charAt(0).toUpperCase() + text.slice(1);
      },
      action: async (onFileProgress) => {
        const outcomes: BulkOutcome[] = [];
        if (assign) outcomes.push(await assign(assignIds, onFileProgress));
        if (leftoverIds.length > 0) {
          try {
            outcomes.push(await runLeftover(leftoverIds, onFileProgress));
            leftoverApplied = true;
          } catch (error) {
            if (outcomes.length === 0) throw error;
            toast.error(String(error));
          }
        }
        return mergeOutcomes(outcomes);
      },
    });
  }

  function assignExisting(tagId: string) {
    const personName = existingPeople.find((person) => person.id === tagId)?.name ?? 'person';
    return apply(
      'Assigning faces',
      (count) => `assigned ${countFaces(count)} to ${personName}`,
      (regionIds, onFileProgress) => onAssignExisting(regionIds, tagId, onFileProgress),
    );
  }

  function createNew(name: string) {
    return apply(
      'Creating person',
      (count) => `created ${name} from ${countFaces(count)}`,
      (regionIds, onFileProgress) => onCreateNew(regionIds, name, onFileProgress),
    );
  }

  function applyLeftoverOnly() {
    return apply(
      leftover === 'remove'
        ? 'Breaking up group'
        : leftover === 'hide'
          ? 'Ignoring faces'
          : 'Marking as not faces',
      () => '',
    );
  }

  const mainButton = (
    <SplitButtonMain
      onClick={toAssign.length === 0 ? () => void applyLeftoverOnly() : undefined}
      disabled={toAssign.length + toLeftover.length === 0}
    >
      {toAssign.length > 0 ? <IconUserPlus size={16} /> : leftoverOption.icon}
      {actionLabel}
    </SplitButtonMain>
  );

  return (
    <Dialog open={open} onOpenChange={(value) => !isRunning && onOpenChange(value)}>
      <DialogContent className="w-[min(94vw,42rem)]" hideCloseButton={isRunning}>
        <DialogHeader>
          <DialogTitle>
            {groupLabel} · {regions.length} {regions.length === 1 ? 'face' : 'faces'}
          </DialogTitle>
          <DialogDescription>
            {bulkAction.phase.kind === 'running'
              ? 'Saving the group decision to the library and affected photo files.'
              : bulkAction.phase.kind === 'result'
                ? 'Review what was updated and any files that could not be written.'
                : `Hover a face to see the whole photo. Select the faces of the same person — ${
                    leftover === 'remove'
                      ? 'the rest go back to Unknown faces on their own.'
                      : leftover === 'keep'
                        ? 'the rest stay in this group for later.'
                        : leftover === 'hide'
                          ? 'the rest are ignored.'
                          : 'the rest are marked as not faces.'
                  }`}
          </DialogDescription>
        </DialogHeader>

        {bulkAction.phase.kind === 'result' ? (
          <BulkActionResultStep
            summary={bulkAction.phase.summary}
            outcome={bulkAction.phase.outcome}
            isUndoing={bulkAction.isUndoing}
            onUndo={() => void bulkAction.undo(close)}
            onDone={close}
          />
        ) : (
          <>
            <DialogBody className="flex flex-col gap-3" aria-busy={isRunning}>
              <FaceSelectionGrid
                regions={regions}
                selectedIds={selectedIds}
                onSelectedIdsChange={setSelectedIds}
                readOnly={isRunning}
                unselectedBadge={leftover === 'keep' ? undefined : leftoverOption.icon}
              />
            </DialogBody>

            <DialogFooter>
              {bulkAction.phase.kind === 'running' ? (
                <BulkActionProgress label={bulkAction.phase.label} progress={bulkAction.phase.progress} />
              ) : (
                <>
                  <Button variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                  <SplitButton
                    variant={toAssign.length === 0 && leftover === 'delete' ? 'destructive' : 'default'}
                  >
                    {toAssign.length > 0 ? (
                      <AssignFacePopover
                        title="Assign these faces"
                        side="top"
                        align="end"
                        faces={toAssign}
                        existingPeople={existingPeople}
                        existingTags={existingTags}
                        onAssignExisting={(tagId) => {
                          void assignExisting(tagId);
                        }}
                        onCreateNew={(name) => {
                          void createNew(name);
                        }}
                      >
                        {mainButton}
                      </AssignFacePopover>
                    ) : (
                      mainButton
                    )}
                    <UnselectedFacesMenu
                      options={LEFTOVER_OPTIONS}
                      value={leftover}
                      onValueChange={setLeftover}
                      unselectedCount={unselected.length}
                    />
                  </SplitButton>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
