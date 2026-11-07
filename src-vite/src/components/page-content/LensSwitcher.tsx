import { Segmented, type SegmentedOption } from '@/components/segmented/Segmented';
import { useEffectiveLens, type Lens } from '@/components/timeline-gallery/lens';
import { useAppStore } from '@/stores/appState';
import { IconList, IconMap, IconPhoto, IconRowInsertBottom } from '@tabler/icons-react';

/** Grid / Strips / List / Map: how the list is looked at, never which photos it holds. */
export function LensSwitcher() {
  const { lens, setLens } = useEffectiveLens();
  const mapLensAvailable = useAppStore((state) => state.mapLensAvailable);

  const options: SegmentedOption<Lens>[] = [
    { value: 'grid', label: 'Grid', icon: <IconPhoto size={16} />, title: 'Grid: photos in sections' },
    {
      value: 'strips',
      label: 'Strips',
      icon: <IconRowInsertBottom size={16} />,
      title: 'Strips: one scrolling row per group',
    },
    { value: 'list', label: 'List', icon: <IconList size={16} />, title: 'List: photos with details' },
    {
      value: 'map',
      label: 'Map',
      icon: <IconMap size={16} />,
      disabled: mapLensAvailable === false,
      title:
        mapLensAvailable === false
          ? 'Map is unavailable: none of these photos have a location'
          : 'Map: photos by location',
    },
  ];

  return (
    <Segmented
      options={options}
      value={lens}
      onChange={setLens}
      ariaLabel="View as"
      className="secondary-toolbar__lens"
    />
  );
}
