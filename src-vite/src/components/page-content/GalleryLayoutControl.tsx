import { Segmented, type SegmentedOption } from '@/components/segmented/Segmented';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GalleryLayoutMode, useAppStore } from '@/stores/appState';
import {
  IconChevronDown,
  IconLayoutCollage,
  IconLayoutDashboard,
  IconLayoutGrid,
  IconRowInsertBottom,
} from '@tabler/icons-react';

const OPTIONS: SegmentedOption<GalleryLayoutMode>[] = [
  { value: 'justified', label: 'Justified rows', icon: <IconLayoutCollage size={16} /> },
  { value: 'card', label: 'Cards', icon: <IconLayoutGrid size={16} /> },
  { value: 'masonry', label: 'Masonry', icon: <IconLayoutDashboard size={16} /> },
  { value: 'strips', label: 'Strips', icon: <IconRowInsertBottom size={16} /> },
];

/**
 * Icon-only switch between the photo grid layouts. In a narrow toolbar the three
 * icons fold into one menu button showing the current layout (CSS container query).
 */
export function GalleryLayoutControl() {
  const layoutMode = useAppStore((state) => state.layoutMode);
  const setLayoutMode = useAppStore((state) => state.setLayoutMode);
  const active = OPTIONS.find((option) => option.value === layoutMode) ?? OPTIONS[0];

  return (
    <>
      <Segmented
        options={OPTIONS}
        value={layoutMode}
        onChange={setLayoutMode}
        ariaLabel="Gallery layout"
        outlined
        className="secondary-toolbar__layout"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="secondary-toolbar__layout-menu gap-0.5 px-2"
            aria-label={`Layout: ${active.label}`}
            title={`Layout: ${active.label}`}
          >
            {active.icon}
            <IconChevronDown size={12} className="opacity-70" aria-hidden="true" />
          </Button>
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
    </>
  );
}
