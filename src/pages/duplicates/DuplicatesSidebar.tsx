import { Segmented } from '@/components/segmented/Segmented';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { confirm } from '@/components/ui/confirmationDialogStore';
import { TRASH_RETENTION_DAYS } from '@/system/trash';
import { formatBytes } from '@/utils/numberFormatter';
import { IconArrowsSort, IconCheck, IconTrash } from '@tabler/icons-react';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { DuplicateRelationship } from './duplicateTypes';
import { filterAndSortSets, globalTotals, membersToRemove, typeCounts } from './duplicateSelectors';
import { KeepRuleControl } from './KeepRuleControl';
import { RescanControl } from './RescanControl';
import { ReviewRemoveSummary } from './ReviewRemoveSummary';
import { SetListRow } from './SetListRow';
import { useDuplicateRemoval } from './useDuplicateRemoval';
import { DuplicatesSort, DuplicatesTypeFilter, setSignature, useDuplicatesStore } from './useDuplicatesStore';

const TYPE_FILTERS: { value: DuplicatesTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: DuplicateRelationship.Exact, label: 'Exact' },
  { value: DuplicateRelationship.Similar, label: 'Similar' },
  { value: DuplicateRelationship.Burst, label: 'Bursts' },
];

const SORT_OPTIONS: { value: DuplicatesSort; label: string }[] = [
  { value: 'recoverable', label: 'Most recoverable' },
  { value: 'copies', label: 'Most copies' },
  { value: 'similarity', label: 'Most similar' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name' },
];

/** Wording of the bulk-remove panel for each segment it applies to. */
const BULK_SCOPE: Record<DuplicateRelationship | 'all', { noun: string; singular: string; cta: string }> = {
  all: { noun: 'photos', singular: 'photo', cta: 'all' },
  [DuplicateRelationship.Exact]: { noun: 'exact copies', singular: 'exact copy', cta: 'exact copies' },
  [DuplicateRelationship.Similar]: { noun: 'similar photos', singular: 'similar photo', cta: 'similar' },
  [DuplicateRelationship.Burst]: { noun: 'burst frames', singular: 'burst frame', cta: 'burst frames' },
};

export function DuplicatesSidebar() {
  const sets = useDuplicatesStore((state) => state.sets);
  const ignoredSets = useDuplicatesStore((state) => state.ignoredSets);
  const decisions = useDuplicatesStore((state) => state.decisions);
  const activeSetId = useDuplicatesStore((state) => state.activeSetId);
  const typeFilter = useDuplicatesStore((state) => state.typeFilter);
  const sort = useDuplicatesStore((state) => state.sort);
  const setActiveSet = useDuplicatesStore((state) => state.setActiveSet);
  const setTypeFilter = useDuplicatesStore((state) => state.setTypeFilter);
  const setSort = useDuplicatesStore((state) => state.setSort);
  const restoreIgnored = useDuplicatesStore((state) => state.restoreIgnored);

  const removeAssets = useDuplicateRemoval();

  const [sortOpen, setSortOpen] = useState(false);

  const counts = useMemo(() => typeCounts(sets), [sets]);

  const visibleSets = useMemo(
    () => filterAndSortSets(sets, typeFilter, sort, decisions),
    [sets, typeFilter, sort, decisions],
  );

  const showingIgnored = typeFilter === 'ignored';
  const listSets = showingIgnored ? ignoredSets : visibleSets;
  const activeSortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? '';

  // The bulk actions only cover the selected segment, never the other tabs.
  const totals = useMemo(() => globalTotals(visibleSets, decisions), [visibleSets, decisions]);
  const scope = BULK_SCOPE[typeFilter === 'ignored' ? 'all' : typeFilter];

  async function handleReviewAndRemoveAll() {
    const count = totals.toRemoveCount.toLocaleString();
    const confirmed = await confirm({
      icon: <IconTrash size={24} />,
      title: `Move ${count} ${scope.noun} to Trash?`,
      description: `Move every ${scope.singular} marked “Remove” to Trash, where it can be recovered for ${TRASH_RETENTION_DAYS} days.`,
      confirmLabel: `Move ${count} to Trash`,
      tone: 'destructive',
      content: <ReviewRemoveSummary sets={visibleSets} decisions={decisions} />,
    });
    if (!confirmed) return;

    const toRemove = visibleSets.flatMap((set) => membersToRemove(set, decisions));
    await removeAssets(
      toRemove.map((member) => ({
        id: member.asset.id,
        filename: member.asset.filename,
        fullPath: member.asset.fullPath,
      })),
    );
  }

  return (
    <div className="dup-sidebar">
      <Segmented
        ariaLabel="Filter by type"
        fill
        stacked
        value={typeFilter}
        onChange={setTypeFilter}
        options={TYPE_FILTERS.map((filter) => ({
          value: filter.value,
          label: filter.label,
          count: filter.value === 'all' ? counts.all : counts[filter.value as DuplicateRelationship],
        }))}
      />

      {ignoredSets.length > 0 && (
        <button
          type="button"
          className={clsx('dup-ignored-link', showingIgnored && 'active')}
          onClick={() => setTypeFilter(showingIgnored ? 'all' : 'ignored')}
        >
          {showingIgnored ? '← Back to sets' : `Ignored (${ignoredSets.length})`}
        </button>
      )}

      <div className="dup-list-header">
        <span className="dup-list-header__count">
          {listSets.length} {showingIgnored ? 'ignored' : 'sets'}
        </span>
        <div className="dup-list-header__actions">
          {!showingIgnored && (
            <Popover open={sortOpen} onOpenChange={setSortOpen}>
              <PopoverTrigger asChild>
                {/* Icon-only to leave room for Re-scan; the active sort is in the tooltip. */}
                <button
                  type="button"
                  className="dup-sort-trigger"
                  title={`Sort: ${activeSortLabel}`}
                  aria-label={`Sort: ${activeSortLabel}`}
                >
                  <IconArrowsSort size={15} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-1">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="dup-keeprule__option"
                    data-selected={sort === option.value}
                    onClick={() => {
                      setSort(option.value);
                      setSortOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {sort === option.value && <IconCheck size={14} className="text-primary" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <RescanControl />
        </div>
      </div>

      <div className="sidebar-scroll-list dup-set-list">
        {listSets.map((set) => (
          <SetListRow
            key={set.id}
            set={set}
            active={!showingIgnored && set.id === activeSetId}
            decisions={decisions}
            onSelect={() => {
              if (showingIgnored) {
                restoreIgnored(setSignature(set));
                setTypeFilter('all');
              }
              setActiveSet(set.id);
            }}
          />
        ))}
        {listSets.length === 0 && (
          <p className="dup-list-empty">
            {showingIgnored ? 'No ignored sets.' : 'No sets match this filter.'}
          </p>
        )}
      </div>

      {!showingIgnored && (
        <Accordion type="single" collapsible className="dup-bulk">
          <AccordionItem value="actions" className="border-b-0">
            <AccordionTrigger className="dup-bulk__trigger py-2 hover:no-underline">
              <span className="dup-bulk__summary">
                Remove <span className="text-destructive-text font-semibold">{totals.toRemoveCount}</span>{' '}
                {scope.noun} · frees{' '}
                <span className="text-success font-semibold">{formatBytes(totals.freesBytes)}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="dup-bulk__content pb-0">
              <Button
                variant="default"
                className="dup-bulk__cta"
                disabled={totals.toRemoveCount === 0}
                onClick={() => void handleReviewAndRemoveAll()}
              >
                Review &amp; remove {scope.cta}
              </Button>
              <KeepRuleControl />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
