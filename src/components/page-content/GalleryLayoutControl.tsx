import { IconChevronDown, IconLayoutCollage, IconLayoutDashboard, IconLayoutGrid } from '@tabler/icons-react';
import { GalleryLayoutMode, useAppStore } from '@/stores/appState';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { JSX } from 'react';

const OPTIONS = [
  { value: 'justified', label: 'Justified rows', icon: <IconLayoutCollage size={16} /> },
  { value: 'masonry', label: 'Masonry', icon: <IconLayoutDashboard size={16} /> },
  { value: 'card', label: 'Cards', icon: <IconLayoutGrid size={16} /> },
] satisfies { value: GalleryLayoutMode; label: string; icon: JSX.Element }[];

/**
 * A set-once preference, so one compact menu button rather than a second
 * segmented control. `disabled` keeps its slot when the current view has no
 * photo grid (a person's Faces), so the sub-header never shifts.
 */
export function GalleryLayoutControl({ disabled = false }: { disabled?: boolean }) {
  const layoutMode = useAppStore((state) => state.layoutMode);
  const setLayoutMode = useAppStore((state) => state.setLayoutMode);
  const active = OPTIONS.find((option) => option.value === layoutMode) ?? OPTIONS[0];
  const title = disabled ? 'Layout applies to the Photos view' : `Layout: ${active.label}`;

  return (
    // The wrapper carries the tooltip: disabled buttons don't receive hover.
    <span title={title}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button type="button" className="gallery-layout-control" aria-label={title}>
            {active.icon}
            <IconChevronDown size={12} className="gallery-layout-control__chevron" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={layoutMode}
            onValueChange={(next) => setLayoutMode(next as GalleryLayoutMode)}
          >
            {OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value} className="gap-2">
                {option.icon}
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
