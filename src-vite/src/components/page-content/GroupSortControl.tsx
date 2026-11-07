import { Segmented, type SegmentedOption } from '@/components/segmented/Segmented';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TimelineGroupBy, useSettingsStore } from '@/stores/settingsStore';
import { IconArrowsSort, IconChevronDown } from '@tabler/icons-react';

const GROUP_OPTIONS: SegmentedOption<TimelineGroupBy>[] = [
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

/** Photos are always ordered by date taken, newest first. */
const SORT_LABEL = 'Date taken ↓';

export function getGroupSortLabel(groupBy: TimelineGroupBy): string {
  const group = GROUP_OPTIONS.find((option) => option.value === groupBy)?.label ?? 'Day';
  return `${group} · ${SORT_LABEL}`;
}

/** Chip + popover summarising and editing how the gallery is grouped into sections. */
export function GroupSortControl() {
  const groupBy = useSettingsStore((state) => state.timelineGroupBy);
  const setGroupBy = useSettingsStore((state) => state.setTimelineGroupBy);
  const label = getGroupSortLabel(groupBy);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="secondary-toolbar__chip"
          aria-label={`Group & sort: ${label}`}
        >
          <IconArrowsSort size={16} aria-hidden="true" />
          <span className="secondary-toolbar__chip-label">{label}</span>
          <IconChevronDown size={14} className="opacity-70" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4 text-sm">
        <section className="space-y-2">
          <h5 className="font-semibold">Group into sections</h5>
          <Segmented
            options={GROUP_OPTIONS}
            value={groupBy}
            onChange={setGroupBy}
            ariaLabel="Group into sections"
            fill
          />
        </section>
        <section className="space-y-1">
          <h5 className="font-semibold">Sort photos</h5>
          <p className="text-muted-foreground">Inside each section, by date taken, newest first.</p>
        </section>
        <p className="border-t pt-3 text-muted-foreground">
          Photos are grouped by {groupBy}, newest first, and sorted by date taken.
        </p>
      </PopoverContent>
    </Popover>
  );
}
