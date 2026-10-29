import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirmationDialogStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LightboxImageContext } from '@/context/LightboxContext';
import { TRASH_RETENTION_DAYS } from '@/system/trash';
import { formatBytes } from '@/utils/numberFormatter';
import { IconBan, IconDotsVertical, IconTrash } from '@tabler/icons-react';
import { useContext, useMemo } from 'react';
import { keptCount, membersToRemove, recoverableBytes, removeCount } from './duplicateSelectors';
import { DuplicateMember, DuplicateRelationship, RELATIONSHIP_META } from './duplicateTypes';
import { keepRuleJustification } from './keepRule';
import { SetKeepSelector } from './SetKeepSelector';
import { SetMemberTile } from './SetMemberTile';
import { useDuplicateRemoval } from './useDuplicateRemoval';
import { useDuplicatesStore } from './useDuplicatesStore';

/** Photos shot within this span read as "the same moment" for the header. */
const COHERENT_CAPTURE_WINDOW_MS = 5 * 60 * 1000;

function memberCaptureTime(member: DuplicateMember): number | null {
  const date = member.asset.metadata.date;
  return date ? date.getTime() : null;
}

/**
 * Returns a representative capture time only when the whole set was shot at
 * essentially the same moment (all bursts qualify, and so do non-burst sets
 * whose frames share a tight capture window). Otherwise the header omits the
 * "shot {time}" clause entirely, since a mixed-date set has no single date.
 */
function coherentShotTime(members: DuplicateMember[], isBurst: boolean, fallback: Date | null): Date | null {
  const times = members.map(memberCaptureTime).filter((time): time is number => time !== null);
  if (times.length !== members.length || times.length === 0) return null;
  const spread = Math.max(...times) - Math.min(...times);
  const window = isBurst ? COHERENT_CAPTURE_WINDOW_MS : 1000;
  if (spread > window) return null;
  return fallback ?? new Date(Math.min(...times));
}

function formatShotTime(date: Date, withTime: boolean): string {
  return date.toLocaleString(undefined, {
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DuplicateSetView() {
  const sets = useDuplicatesStore((state) => state.sets);
  const activeSetId = useDuplicatesStore((state) => state.activeSetId);
  const decisions = useDuplicatesStore((state) => state.decisions);
  const keepRule = useDuplicatesStore((state) => state.keepRule);
  const manualEdited = useDuplicatesStore((state) => state.manualEdited);
  const gridColumns = useDuplicatesStore((state) => state.gridColumns);
  const toggleMember = useDuplicatesStore((state) => state.toggleMember);
  const ignoreSet = useDuplicatesStore((state) => state.ignoreSet);

  const removeAssets = useDuplicateRemoval();
  const { openLightbox } = useContext(LightboxImageContext);

  const activeSet = useMemo(() => sets.find((set) => set.id === activeSetId) ?? null, [sets, activeSetId]);

  const orderedIds = useMemo(() => activeSet?.members.map((member) => member.asset.id) ?? [], [activeSet]);

  if (!activeSet) {
    return (
      <div className="dup-set-view dup-set-view--empty">
        <p>Select a set from the list to review it.</p>
      </div>
    );
  }

  const meta = RELATIONSHIP_META[activeSet.relationship];
  const kept = keptCount(activeSet, decisions);
  const toRemove = removeCount(activeSet, decisions);
  const freed = recoverableBytes(activeSet, decisions);
  const isBurst = activeSet.relationship === DuplicateRelationship.Burst;
  const shotTime = coherentShotTime(activeSet.members, isBurst, activeSet.capturedAt);

  async function handleRemoveFromSet() {
    if (!activeSet) return;
    const confirmed = await confirm({
      icon: <IconTrash size={24} />,
      title: `Move ${toRemove.toLocaleString()} ${toRemove === 1 ? 'photo' : 'photos'} to Trash?`,
      description: `${formatBytes(freed)} can be recovered. Items remain recoverable for ${TRASH_RETENTION_DAYS} days.`,
      confirmLabel: `Move ${toRemove.toLocaleString()} to Trash`,
      tone: 'destructive',
    });
    if (!confirmed) return;

    const members = membersToRemove(activeSet, decisions);
    await removeAssets(
      members.map((member) => ({
        id: member.asset.id,
        filename: member.asset.filename,
        fullPath: member.asset.fullPath,
      })),
    );
  }

  async function handleNotDuplicates() {
    if (!activeSet) return;
    const confirmed = await confirm({
      icon: <IconBan size={24} />,
      title: 'Mark as not duplicates?',
      description: 'This set will be ignored in future scans. You can restore it from Ignored at any time.',
      confirmLabel: 'Not duplicates',
    });
    if (!confirmed) return;
    ignoreSet(activeSet.id);
  }

  return (
    <div className="dup-set-view">
      <header className="dup-set-header">
        <div className="dup-set-header__lead">
          <div className="dup-set-header__titlerow">
            <h3 className="dup-set-header__title text-sm font-semibold">{activeSet.title}</h3>
            <span className="dup-badge text-muted-foreground">
              <span className="dup-dot" style={{ background: meta.dotColor }} />
              {meta.label}
            </span>
          </div>
          <p className="dup-set-header__meta text-sm">
            {activeSet.members.length} frames · keeping {kept} ·{' '}
            <span className="text-success font-semibold">{formatBytes(freed)} recoverable</span>
            {shotTime && <> · shot {formatShotTime(shotTime, isBurst)}</>}
          </p>
        </div>

        <div className="dup-set-header__actions">
          <SetKeepSelector setId={activeSet.id} />
          <Button disabled={toRemove === 0} onClick={() => void handleRemoveFromSet()}>
            <IconTrash size={16} />
            Remove {toRemove}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                title="Duplicate set actions"
                aria-label="Duplicate set actions"
              >
                <IconDotsVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  // Let the menu unmount before the dialog, or pointer-events stay locked.
                  window.setTimeout(() => void handleNotDuplicates(), 0);
                }}
              >
                Not duplicates
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="dup-set-content">
        <p className="dup-set-reassure text-xs">
          Removed photos go to Trash — recoverable for {TRASH_RETENTION_DAYS} days.
        </p>
        <div
          className="dup-member-grid"
          style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
        >
          {activeSet.members.map((member, index) => {
            const isRepresentative = index === activeSet.representativeIndex;
            const decision = decisions[member.asset.id] ?? 'keep';
            const keepTag = manualEdited ? null : keepRuleJustification(keepRule, isBurst);
            const showMatch =
              !isRepresentative &&
              activeSet.relationship !== DuplicateRelationship.Exact &&
              member.matchPercent < 100;

            return (
              <SetMemberTile
                key={member.asset.id}
                member={member}
                decision={decision}
                isRepresentative={isRepresentative && activeSet.relationship !== DuplicateRelationship.Exact}
                showMatch={showMatch}
                keepTag={decision === 'keep' ? keepTag : null}
                onToggle={() => toggleMember(activeSet.id, member.asset.id)}
                onOpenViewer={() =>
                  openLightbox(member.asset, null, { assetIds: orderedIds, preserveOrder: true })
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
