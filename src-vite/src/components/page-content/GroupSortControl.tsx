import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  arrangementWarning,
  describeArrangement,
  groupName,
  sectionDirectionLabel,
  sortDirectionLabel,
  sortName,
  summarizeLabel,
} from '@/components/timeline-gallery/groupSort';
import { useAppStore } from '@/stores/appState';
import { TIMELINE_GROUP_BY_VALUES, TIMELINE_SORT_BY_VALUES, useSettingsStore } from '@/stores/settingsStore';
import { IconAlertTriangle, IconArrowsSort, IconCheck, IconChevronDown } from '@tabler/icons-react';
import clsx from 'clsx';
import type { ReactNode } from 'react';

function OptionList({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 flex-1 space-y-1">
      <h5 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        {hint && <span className="ml-1 font-normal normal-case tracking-normal">({hint})</span>}
      </h5>
      <div role="radiogroup" aria-label={title} className="space-y-0.5">
        {children}
      </div>
    </section>
  );
}

function Option({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={clsx(
        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
        selected && 'bg-primary/10 font-semibold text-primary',
      )}
      onClick={onSelect}
    >
      {children}
      {selected && <IconCheck size={16} aria-hidden="true" />}
    </button>
  );
}

function OrderRow({ label, value, onToggle }: { label: string; value: string; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 pt-2 text-sm text-muted-foreground">
      <span>{label}</span>
      <Button
        variant="outline"
        size="sm"
        className="rounded-full"
        onClick={onToggle}
        title="Reverse the order"
      >
        {value}
        <IconArrowsSort size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Chip + popover to choose how photos are grouped into sections and sorted inside them. */
export function GroupSortControl() {
  const groupBy = useSettingsStore((state) => state.timelineGroupBy);
  const sortBy = useSettingsStore((state) => state.timelineSortBy);
  const sortReversed = useSettingsStore((state) => state.timelineSortReversed);
  const sectionReversed = useSettingsStore((state) => state.timelineSectionReversed);
  const setGroupBy = useSettingsStore((state) => state.setTimelineGroupBy);
  const setSortBy = useSettingsStore((state) => state.setTimelineSortBy);
  const setSortReversed = useSettingsStore((state) => state.setTimelineSortReversed);
  const setSectionReversed = useSettingsStore((state) => state.setTimelineSectionReversed);
  const reshuffle = useAppStore((state) => state.reshuffleRandomSort);

  const label = summarizeLabel(groupBy, sortBy, sortReversed);
  const warning = arrangementWarning(groupBy, sortBy);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="secondary-toolbar__chip"
          aria-label={`Group & sort: ${label}`}
          title="Group & sort"
        >
          <IconArrowsSort size={16} aria-hidden="true" />
          <span className="secondary-toolbar__chip-label">{label}</span>
          <IconChevronDown size={14} className="opacity-70" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(36rem,calc(100vw-2rem))] p-3 text-sm">
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <OptionList title="Group into sections">
              {TIMELINE_GROUP_BY_VALUES.map((value) => (
                <Option key={value} selected={groupBy === value} onSelect={() => setGroupBy(value)}>
                  {value === 'none' ? 'None' : groupName(value)}
                </Option>
              ))}
            </OptionList>
            {groupBy !== 'none' && (
              <OrderRow
                label="Section order"
                value={sectionDirectionLabel(groupBy, sectionReversed)}
                onToggle={() => setSectionReversed(!sectionReversed)}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <OptionList
              title="Sort photos"
              hint={groupBy === 'none' ? 'across all photos' : 'inside each section'}
            >
              {TIMELINE_SORT_BY_VALUES.map((value) => (
                <Option
                  key={value}
                  selected={sortBy === value}
                  onSelect={() => {
                    setSortBy(value);
                    if (value === 'random') reshuffle();
                  }}
                >
                  {sortName(value)}
                </Option>
              ))}
            </OptionList>
            {sortBy !== 'random' && (
              <OrderRow
                label="Direction"
                value={sortDirectionLabel(sortBy, sortReversed)}
                onToggle={() => setSortReversed(!sortReversed)}
              />
            )}
          </div>
        </div>
        <p className="mt-3 border-t pt-3 text-muted-foreground">
          {describeArrangement(groupBy, sortBy, sectionReversed, sortReversed)}
        </p>
        {warning && (
          <p className="mt-2 flex items-start gap-2 text-warning-foreground">
            <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {warning}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
