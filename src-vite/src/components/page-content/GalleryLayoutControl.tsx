import { Segmented, type SegmentedOption } from '@/components/segmented/Segmented';
import { GalleryLayoutMode, useAppStore } from '@/stores/appState';
import { IconLayoutCollage, IconLayoutDashboard, IconLayoutGrid } from '@tabler/icons-react';

const OPTIONS: SegmentedOption<GalleryLayoutMode>[] = [
  { value: 'justified', label: 'Justified rows', icon: <IconLayoutCollage size={16} /> },
  { value: 'card', label: 'Cards', icon: <IconLayoutGrid size={16} /> },
  { value: 'masonry', label: 'Masonry', icon: <IconLayoutDashboard size={16} /> },
];

/** Icon-only switch between the photo grid layouts (rows / square cards / masonry). */
export function GalleryLayoutControl() {
  const layoutMode = useAppStore((state) => state.layoutMode);
  const setLayoutMode = useAppStore((state) => state.setLayoutMode);

  return (
    <Segmented
      options={OPTIONS}
      value={layoutMode}
      onChange={setLayoutMode}
      ariaLabel="Gallery layout"
      className="secondary-toolbar__layout"
    />
  );
}
