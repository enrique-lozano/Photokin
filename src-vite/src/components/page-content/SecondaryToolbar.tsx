import { useEffectiveLens } from '@/components/timeline-gallery/lens';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useAppStore } from '@/stores/appState';
import { useSettingsStore } from '@/stores/settingsStore';
import { IconChevronUp, IconFilter, IconMinus, IconPlus } from '@tabler/icons-react';
import clsx from 'clsx';
import { useLayoutEffect, type ReactNode } from 'react';
import { GalleryLayoutControl } from './GalleryLayoutControl';
import { GroupSortControl } from './GroupSortControl';
import { LensSwitcher } from './LensSwitcher';

interface SecondaryToolbarProps {
  /** The page has quick filters, so the toolbar offers their show/hide chip. */
  hasQuickFilters: boolean;
  /** Page-specific scope toggles (e.g. "Include subtags"), shown after the quick-filters chip. */
  scopeControls?: ReactNode;
  /** The view has no photo grid (a person's Faces): only size and select apply. */
  gridControls: boolean;
}

/**
 * Toolbar under the page header: quick-filters chip, group & sort, layout,
 * thumbnail size and select. It folds into a thin handle (persisted) and sizes
 * its labels from its own width, not the window's.
 */
export function SecondaryToolbar({ hasQuickFilters, scopeControls, gridControls }: SecondaryToolbarProps) {
  const expanded = useSettingsStore((state) => state.showSecondaryToolbar);
  const setExpanded = useSettingsStore((state) => state.setShowSecondaryToolbar);
  const showQuickFilters = useSettingsStore((state) => state.showQuickFilters);
  const setShowQuickFilters = useSettingsStore((state) => state.setShowQuickFilters);
  const activeCount = useAppStore((state) => state.quickFilterActiveCount);
  const size = useAppStore((state) => state.galleryThumbnailSize);
  const setSize = useAppStore((state) => state.setGalleryThumbnailSize);
  const { lens } = useEffectiveLens();
  const setMounted = useAppStore((state) => state.setSecondaryToolbarMounted);

  // The toolbar owns the size slider, even while folded away.
  useLayoutEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, [setMounted]);

  // Both states stay mounted so the fold can animate; the hidden one is inert.
  return (
    <div className={clsx('secondary-toolbar-shell', !expanded && 'is-collapsed')}>
      <button
        type="button"
        className="secondary-toolbar-handle"
        aria-label="Show toolbar"
        title="Show toolbar"
        tabIndex={expanded ? -1 : 0}
        inert={expanded}
        onClick={() => setExpanded(true)}
      />
      <div className="secondary-toolbar" role="toolbar" aria-label="Gallery options" inert={!expanded}>
        {gridControls && <LensSwitcher />}

        {hasQuickFilters && (
          <Button
            variant="outline"
            size="sm"
            className={clsx('secondary-toolbar__chip', showQuickFilters && 'secondary-toolbar__chip--active')}
            aria-pressed={showQuickFilters}
            title={showQuickFilters ? 'Hide quick filters' : 'Show quick filters'}
            onClick={() => setShowQuickFilters(!showQuickFilters)}
          >
            <IconFilter size={16} aria-hidden="true" />
            {activeCount > 0 && <span className="secondary-toolbar__badge">{activeCount}</span>}
          </Button>
        )}

        {scopeControls}

        <span className="flex-1" />

        {gridControls && (lens === 'grid' || lens === 'list') && <GroupSortControl />}
        {gridControls && lens === 'grid' && <GalleryLayoutControl />}

        {(lens === 'grid' || lens === 'faces') && (
          <div className="secondary-toolbar__size">
            <IconMinus size={14} className="text-muted-foreground" aria-hidden="true" />
            <Slider
              min={140}
              max={260}
              step={10}
              value={[size]}
              onValueChange={([next]) => setSize(next)}
              className="secondary-toolbar__slider"
              aria-label="Thumbnail size"
            />
            <IconPlus size={14} className="text-muted-foreground" aria-hidden="true" />
          </div>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Hide toolbar"
          title="Hide toolbar"
          onClick={() => setExpanded(false)}
        >
          <IconChevronUp size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
