import { ExposureField } from '@/common/exposureStops';
import { SearchCondition, SearchQueryType } from '@/common/fileSearchFilters';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { getConditions } from '@/common/searchQueryUtils';
import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { FilterChip } from '@/components/page-content/FilterChip';
import { TreeColorDot } from '@/components/tree/TreeColorDot';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { SearchCombobox } from '@/components/ui/search-combobox';
import { Slider } from '@/components/ui/slider';
import { AssetsService } from '@/db/api/services/assets.service';
import { RegionsService } from '@/db/api/services/regions.service';
import { TagsService } from '@/db/api/services/tags.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { PersonRegion } from '@/db/models/PersonInfo';
import { TagInClient } from '@/db/models/TagDTO';
import { useAppStore } from '@/stores/appState';
import {
  IconCalendar,
  IconCalendarPlus,
  IconCamera,
  IconCheck,
  IconDatabase,
  IconFilter,
  IconHeart,
  IconMapPin,
  IconPhoto,
  IconSearch,
  IconStar,
  IconTag,
  IconUsers,
  IconVideo,
  IconX,
} from '@tabler/icons-react';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ExposureSlider, FlashToggle } from './CameraExifFields';
import {
  buildDraftConditions,
  createEmptyDraft,
  FilterDraftState,
  FilterSectionId,
  formatRangeLabel,
  getSectionSummaries,
  hydrateDraftFromFilters,
  MAX_FILESIZE_MB,
  MAX_PERSON_COUNT,
  toDateInput,
} from './filterDraft';
import './libraryFilterDrawer.css';

const DEFAULT_SECTIONS: FilterSectionId[] = ['quick', 'date-taken'];

type LibraryFilterDrawerProps = {
  trigger: ReactNode;
};

const EXPOSURE_SLIDERS: { field: ExposureField; label: string }[] = [
  { field: 'iso', label: 'ISO' },
  { field: 'aperture', label: 'Aperture' },
  { field: 'shutterSpeed', label: 'Shutter speed' },
  { field: 'focalLength', label: 'Focal length' },
];

const COUNT_TABLES = ['assets', 'fileTags', 'tagRegionInfo'] as const;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);
  return debounced;
}

const sameCondition = (a: SearchCondition, b: SearchCondition) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

export function LibraryFilterDrawer({ trigger }: LibraryFilterDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<FilterDraftState>(createEmptyDraft);
  const [expandedSections, setExpandedSections] = useState<string[]>(DEFAULT_SECTIONS);

  const searchQuery = useAppStore((state) => state.searchQuery);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);
  const galleryScope = useAppStore((state) => state.gallerySelectionScope);

  const { data: allTags } = useLiveQuery(() => TagsService.getAll(), ['tags']);
  const { data: regionTags } = useLiveQuery(() => RegionsService.getRegionTags(), ['tags', 'tagRegionInfo']);
  const { data: locationRows } = useLiveQuery(() => AssetsService.getFileCountByLocation({}), ['assets']);
  const { data: cameraRows } = useLiveQuery(
    async () => (isOpen ? AssetsService.getTopCameraBodies({ limit: 500 }) : null),
    ['assets'],
    { extDependencies: [isOpen] },
  );

  const camerasKey = draft.cameras.join('\u0000');
  // Lenses and exposure histograms follow the picked cameras.
  const cameraScope = useMemo<SearchCondition[]>(
    () =>
      draft.cameras.length > 0
        ? [
            {
              type: SearchQueryType.OR,
              filters: draft.cameras.map((camera) => ({
                filterCriteria: FilterCriteria.camera,
                operator: 'equals' as const,
                value: camera,
              })),
            },
          ]
        : [],
    [camerasKey],
  );
  const { data: lensRows } = useLiveQuery(
    async () => (isOpen ? AssetsService.getTopLenses({ searchQuery: cameraScope, limit: 500 }) : null),
    ['assets'],
    { extDependencies: [isOpen, cameraScope] },
  );
  const { data: histograms } = useLiveQuery(
    async () => (isOpen ? AssetsService.getExposureHistograms({ searchQuery: cameraScope }) : null),
    ['assets'],
    { extDependencies: [isOpen, cameraScope] },
  );

  const peopleOptions = useMemo(() => {
    const map = new Map<string, TagInClient>();
    regionTags?.forEach((entry) => {
      if (entry.tag) {
        map.set(entry.tag.id, entry.tag);
      }
    });
    return Array.from(map.values());
  }, [regionTags]);

  const faceRegionByTagId = useMemo(() => {
    const map = new Map<string, PersonRegion>();
    regionTags?.forEach((entry) => {
      if (entry.tag && entry.representativeRegion && !map.has(entry.tag.id)) {
        map.set(entry.tag.id, entry.representativeRegion);
      }
    });
    return map;
  }, [regionTags]);

  const locationOptions = useMemo(
    () =>
      (locationRows ?? [])
        .map((row) => row.locationName)
        .filter((name): name is string => Boolean(name && name.trim().length > 0)),
    [locationRows],
  );
  const cameraOptions = useMemo(
    () => (cameraRows ?? []).map((row) => ({ value: row.label, hint: row.count.toLocaleString() })),
    [cameraRows],
  );
  const lensOptions = useMemo(
    () => (lensRows ?? []).map((row) => ({ value: row.label, hint: row.count.toLocaleString() })),
    [lensRows],
  );

  const globalConditions = useMemo(() => getConditions(searchQuery), [searchQuery]);
  const currentFilters = useMemo(
    () => globalConditions.flatMap((condition) => condition.filters),
    [globalConditions],
  );

  useEffect(() => {
    if (!isOpen) return;
    const hydratedDraft = hydrateDraftFromFilters(currentFilters);
    const anyActive = Object.values(getSectionSummaries(hydratedDraft, { people: [], tags: [] })).some(
      Boolean,
    );
    setDraft(hydratedDraft);
    // Collapsed sections show what is set at a glance.
    setExpandedSections(anyActive ? [] : DEFAULT_SECTIONS);
  }, [isOpen, currentFilters]);

  const selectedPeople = useMemo(() => {
    if (!peopleOptions) return [];
    return peopleOptions.filter((entry) => draft.peopleIds.includes(entry.id));
  }, [peopleOptions, draft.peopleIds]);

  const selectedTags = useMemo(() => {
    if (!allTags) return [];
    return allTags.filter((entry) => draft.tagIds.includes(entry.id));
  }, [allTags, draft.tagIds]);

  const summaries = useMemo(
    () =>
      getSectionSummaries(draft, {
        people: selectedPeople.map((person) => person.name),
        tags: selectedTags.map((tag) => tag.name),
      }),
    [draft, selectedPeople, selectedTags],
  );

  const personOptions = useMemo(
    () =>
      peopleOptions.map((person) => ({
        value: person.id,
        label: person.name,
        leading: (
          <FaceThumbnail
            region={faceRegionByTagId.get(person.id)}
            className="library-filter-drawer__option-face"
          />
        ),
      })),
    [peopleOptions, faceRegionByTagId],
  );
  const tagOptions = useMemo(
    () =>
      (allTags ?? []).map((tag) => ({
        value: tag.id,
        label: tag.fullPath,
        leading: <TreeColorDot seed={tag.rootId} color={tag.color} />,
      })),
    [allTags],
  );

  const draftConditions = useMemo(
    () => buildDraftConditions(draft, currentFilters, { people: selectedPeople, tags: selectedTags }),
    [currentFilters, draft, selectedPeople, selectedTags],
  );

  // The gallery on screen publishes "global filters + its own scope"; what is
  // left once the global conditions are taken out is the page's scope.
  const pageScope = useMemo(() => {
    if (!galleryScope) return null;
    const conditions = getConditions(galleryScope.searchQuery).filter(
      (condition) => !globalConditions.some((global) => sameCondition(global, condition)),
    );
    if (conditions.length === 0 && galleryScope.assetIds === undefined) return null;
    return { conditions, assetIds: galleryScope.assetIds };
  }, [galleryScope, globalConditions]);

  const countedConditions = useDebouncedValue(draftConditions, 200);
  const { data: counts, loading: isCounting } = useLiveQuery(
    async () => {
      if (!isOpen) return null;
      const library = await AssetsService.getCount({ searchQuery: countedConditions });
      const here = pageScope
        ? await AssetsService.getCount({
            searchQuery: [...pageScope.conditions, ...countedConditions],
            assetIds: pageScope.assetIds,
          })
        : null;
      return { library, here };
    },
    [...COUNT_TABLES],
    { extDependencies: [isOpen, countedConditions, pageScope] },
  );

  const showFlash = (histograms?.flashCount ?? 0) > 0 || draft.flash !== 'any';
  const lensPlaceholder =
    lensRows && draft.cameras.length > 0
      ? `Any · ${lensRows.length} for ${draft.cameras.length === 1 ? draft.cameras[0] : `${draft.cameras.length} cameras`}`
      : 'Any lens';

  const setExposure = (field: ExposureField, range: [number | null, number | null]) =>
    setDraft((previous) => ({ ...previous, exposure: { ...previous.exposure, [field]: range } }));

  const applyPresetDateTaken = (kind: '6months' | 'thisYear' | 'lastYear' | '30days') => {
    const now = new Date();
    if (kind === '6months') {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      setDraft((previous) => ({ ...previous, dateTakenAfter: toDateInput(start), dateTakenBefore: '' }));
      return;
    }

    if (kind === 'thisYear') {
      setDraft((previous) => ({
        ...previous,
        dateTakenAfter: `${now.getFullYear()}-01-01`,
        dateTakenBefore: `${now.getFullYear()}-12-31`,
      }));
      return;
    }

    if (kind === 'lastYear') {
      const year = now.getFullYear() - 1;
      setDraft((previous) => ({
        ...previous,
        dateTakenAfter: `${year}-01-01`,
        dateTakenBefore: `${year}-12-31`,
      }));
      return;
    }

    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    setDraft((previous) => ({ ...previous, dateTakenAfter: toDateInput(start), dateTakenBefore: '' }));
  };

  const section = (id: FilterSectionId, icon: ReactNode, title: string, children: ReactNode) => (
    <FilterSection
      id={id}
      icon={icon}
      title={title}
      summary={summaries[id]}
      isOpen={expandedSections.includes(id)}
    >
      {children}
    </FilterSection>
  );

  const formatCount = (count: number) => `${count.toLocaleString()} ${count === 1 ? 'photo' : 'photos'}`;

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="library-filter-drawer text-foreground w-[min(380px,96vw)]">
        <DrawerHeader>
          <div className="library-filter-drawer__title-wrap">
            <DrawerTitle className="library-filter-drawer__title">
              <IconFilter size={18} />
              Filters
            </DrawerTitle>
            <DrawerDescription className="text-sm">applies to every page</DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close filters drawer">
              <IconX size={16} />
            </Button>
          </DrawerClose>
        </DrawerHeader>

        <DrawerBody>
          <Accordion
            type="multiple"
            value={expandedSections}
            onValueChange={setExpandedSections}
            className="library-filter-drawer__sections"
          >
            {section(
              'quick',
              <IconStar />,
              'Quick filters',
              <div className="library-filter-drawer__quick-toggles">
                <FilterChip
                  label="Favorites"
                  leading={<IconHeart size={13} />}
                  active={draft.favoritesOnly}
                  onClick={() =>
                    setDraft((previous) => ({ ...previous, favoritesOnly: !previous.favoritesOnly }))
                  }
                />
                <FilterChip
                  label="Photos"
                  leading={<IconPhoto size={13} />}
                  active={draft.mediaType === 'photo'}
                  onClick={() =>
                    setDraft((previous) => ({
                      ...previous,
                      mediaType: previous.mediaType === 'photo' ? 'all' : 'photo',
                    }))
                  }
                />
                <FilterChip
                  label="Videos"
                  leading={<IconVideo size={13} />}
                  active={draft.mediaType === 'video'}
                  onClick={() =>
                    setDraft((previous) => ({
                      ...previous,
                      mediaType: previous.mediaType === 'video' ? 'all' : 'video',
                    }))
                  }
                />
              </div>,
            )}

            {section(
              'date-taken',
              <IconCalendar />,
              'Date taken',
              <>
                <div className="library-filter-drawer__date-grid">
                  <label className="library-filter-drawer__date-field">
                    <span className="library-filter-drawer__field-label">From</span>
                    <Input
                      type="date"
                      value={draft.dateTakenAfter}
                      className="min-w-0 w-full"
                      onChange={(event) =>
                        setDraft((previous) => ({ ...previous, dateTakenAfter: event.target.value }))
                      }
                    />
                  </label>
                  <label className="library-filter-drawer__date-field">
                    <span className="library-filter-drawer__field-label">To</span>
                    <Input
                      type="date"
                      value={draft.dateTakenBefore}
                      className="min-w-0 w-full"
                      onChange={(event) =>
                        setDraft((previous) => ({ ...previous, dateTakenBefore: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="library-filter-drawer__chips-row library-filter-drawer__chips-row--presets">
                  <FilterChip label="Last 30 days" onClick={() => applyPresetDateTaken('30days')} />
                  <FilterChip label="Last 6 months" onClick={() => applyPresetDateTaken('6months')} />
                  <FilterChip label="This year" onClick={() => applyPresetDateTaken('thisYear')} />
                  <FilterChip label="Last year" onClick={() => applyPresetDateTaken('lastYear')} />
                </div>
              </>,
            )}

            {section(
              'date-added',
              <IconCalendarPlus />,
              'Date added',
              <div className="library-filter-drawer__date-grid">
                <label className="library-filter-drawer__date-field">
                  <span className="library-filter-drawer__field-label">From</span>
                  <Input
                    type="date"
                    value={draft.dateAddedAfter}
                    className="min-w-0 w-full"
                    onChange={(event) =>
                      setDraft((previous) => ({ ...previous, dateAddedAfter: event.target.value }))
                    }
                  />
                </label>
                <label className="library-filter-drawer__date-field">
                  <span className="library-filter-drawer__field-label">To</span>
                  <Input
                    type="date"
                    value={draft.dateAddedBefore}
                    className="min-w-0 w-full"
                    onChange={(event) =>
                      setDraft((previous) => ({ ...previous, dateAddedBefore: event.target.value }))
                    }
                  />
                </label>
              </div>,
            )}

            {section(
              'rating',
              <IconStar />,
              'Rating',
              <div className="library-filter-drawer__rating-line">
                <div className="library-filter-drawer__operator-toggle">
                  <button
                    type="button"
                    className={draft.ratingMode === '>=' ? 'active' : ''}
                    aria-pressed={draft.ratingMode === '>='}
                    onClick={() => setDraft((previous) => ({ ...previous, ratingMode: '>=' }))}
                  >
                    at least
                  </button>
                  <button
                    type="button"
                    className={draft.ratingMode === '=' ? 'active' : ''}
                    aria-pressed={draft.ratingMode === '='}
                    onClick={() => setDraft((previous) => ({ ...previous, ratingMode: '=' }))}
                  >
                    exactly
                  </button>
                </div>
                <div className="library-filter-drawer__stars">
                  {Array.from({ length: 5 }).map((_, index) => {
                    const starValue = index + 1;
                    return (
                      <button
                        key={starValue}
                        type="button"
                        className={starValue <= draft.ratingValue ? 'active' : ''}
                        aria-label={`${starValue} ${starValue === 1 ? 'star' : 'stars'}`}
                        aria-pressed={starValue <= draft.ratingValue}
                        onClick={() =>
                          setDraft((previous) => ({
                            ...previous,
                            ratingValue: previous.ratingValue === starValue ? 0 : starValue,
                          }))
                        }
                      >
                        ★
                      </button>
                    );
                  })}
                </div>
              </div>,
            )}

            {section(
              'people',
              <IconUsers />,
              'People',
              <>
                <SearchCombobox
                  multiple
                  value={draft.peopleIds}
                  onValueChange={(peopleIds) => setDraft((previous) => ({ ...previous, peopleIds }))}
                  options={personOptions}
                  placeholder="Search people…"
                  emptyText={peopleOptions.length ? 'No people match your search' : 'No named people yet'}
                />

                <div className="library-filter-drawer__slider-block">
                  <div className="library-filter-drawer__slider-header">
                    <span className="library-filter-drawer__slider-label-text">People in photo</span>
                    <span className="library-filter-drawer__count-value">
                      {formatRangeLabel(
                        draft.personCountRange[0],
                        draft.personCountRange[1],
                        MAX_PERSON_COUNT,
                      )}
                    </span>
                  </div>
                  <Slider
                    aria-label="People in photo"
                    min={0}
                    max={MAX_PERSON_COUNT}
                    step={1}
                    value={draft.personCountRange}
                    onValueChange={(value) => {
                      const [min = 0, max = MAX_PERSON_COUNT] = value;
                      setDraft((previous) => ({
                        ...previous,
                        personCountRange: [Math.min(min, max), Math.max(min, max)],
                      }));
                    }}
                  />
                </div>
              </>,
            )}

            {section(
              'tags',
              <IconTag />,
              'Tags',
              <>
                <SearchCombobox
                  multiple
                  value={draft.tagIds}
                  onValueChange={(tagIds) => setDraft((previous) => ({ ...previous, tagIds }))}
                  options={tagOptions}
                  placeholder="Search tags…"
                  emptyText={allTags?.length ? 'No tags match your search' : 'No tags yet'}
                />
              </>,
            )}

            {section(
              'location',
              <IconMapPin />,
              'Places',
              <SearchCombobox
                value={draft.location}
                onValueChange={(location) => setDraft((previous) => ({ ...previous, location }))}
                options={locationOptions}
                placeholder="City, country, or place…"
                emptyText="No matching places"
                allowCustomValue
              />,
            )}

            {section(
              'camera',
              <IconCamera />,
              'Camera & EXIF',
              <>
                <div className="library-filter-drawer__group">
                  <span className="library-filter-drawer__field-label">Camera</span>
                  <SearchCombobox
                    multiple
                    value={draft.cameras}
                    onValueChange={(cameras) => setDraft((previous) => ({ ...previous, cameras, lens: '' }))}
                    options={cameraOptions}
                    placeholder="Search cameras…"
                    emptyText={
                      cameraRows?.length
                        ? 'No cameras match your search'
                        : 'No camera info in your photos yet'
                    }
                  />
                </div>
                <div className="library-filter-drawer__group">
                  <span className="library-filter-drawer__field-label">Lens</span>
                  <SearchCombobox
                    value={draft.lens}
                    onValueChange={(lens) => setDraft((previous) => ({ ...previous, lens }))}
                    options={lensOptions}
                    placeholder={lensPlaceholder}
                    emptyText="No matching lenses"
                    allowCustomValue
                  />
                </div>
                <div className="library-filter-drawer__group">
                  <span className="library-filter-drawer__field-label">Exposure</span>
                  {EXPOSURE_SLIDERS.map(({ field, label }) => (
                    <ExposureSlider
                      key={field}
                      field={field}
                      label={label}
                      histogram={histograms?.[field]}
                      value={draft.exposure[field]}
                      onValueChange={(range) => setExposure(field, range)}
                    />
                  ))}
                </div>
                {showFlash && (
                  <FlashToggle
                    value={draft.flash}
                    onValueChange={(flash) => setDraft((previous) => ({ ...previous, flash }))}
                  />
                )}
              </>,
            )}

            {section(
              'size',
              <IconDatabase />,
              'File size',
              <div className="library-filter-drawer__slider-block">
                <div className="library-filter-drawer__slider-header">
                  <span className="library-filter-drawer__slider-label-text">Range</span>
                  <span className="library-filter-drawer__count-value">
                    {formatRangeLabel(draft.sizeRange[0], draft.sizeRange[1], MAX_FILESIZE_MB, 'MB')}
                  </span>
                </div>
                <Slider
                  aria-label="File size in MB"
                  min={0}
                  max={MAX_FILESIZE_MB}
                  step={1}
                  value={draft.sizeRange}
                  onValueChange={(value) => {
                    const [min = 0, max = MAX_FILESIZE_MB] = value;
                    setDraft((previous) => ({
                      ...previous,
                      sizeRange: [Math.min(min, max), Math.max(min, max)],
                    }));
                  }}
                />
              </div>,
            )}

            {section(
              'text',
              <IconSearch />,
              'Text search',
              <>
                <div className="library-filter-drawer__date-field">
                  <span className="library-filter-drawer__field-label">Filename</span>
                  <Input
                    value={draft.filenameContains}
                    onChange={(event) =>
                      setDraft((previous) => ({ ...previous, filenameContains: event.target.value }))
                    }
                    placeholder="Contains…"
                  />
                </div>
                <div className="library-filter-drawer__date-field">
                  <span className="library-filter-drawer__field-label">Description</span>
                  <Input
                    value={draft.descriptionContains}
                    onChange={(event) =>
                      setDraft((previous) => ({ ...previous, descriptionContains: event.target.value }))
                    }
                    placeholder="Contains…"
                  />
                </div>
              </>,
            )}
          </Accordion>
        </DrawerBody>

        <DrawerFooter className="library-filter-drawer__footer">
          <button
            type="button"
            className="library-filter-drawer__reset hover:text-foreground"
            onClick={() => setDraft(createEmptyDraft())}
          >
            Reset all
          </button>
          <div className="library-filter-drawer__footer-right">
            <div className="library-filter-drawer__matches" aria-live="polite">
              {isCounting || !counts ? (
                <span className="text-foreground text-sm font-semibold">Counting…</span>
              ) : counts.here !== null ? (
                <>
                  <span className="text-foreground text-sm font-semibold">
                    {formatCount(counts.here)} here
                  </span>
                  <span>{counts.library.toLocaleString()} in the library</span>
                </>
              ) : (
                <>
                  <span className="text-foreground text-sm font-semibold">{formatCount(counts.library)}</span>
                  <span>in the library</span>
                </>
              )}
            </div>
            <Button
              onClick={() => {
                setSearchQuery(draftConditions);
                setIsOpen(false);
              }}
            >
              <IconCheck size={16} />
              Apply
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function FilterSection({
  id,
  icon,
  title,
  summary,
  isOpen,
  children,
}: {
  id: FilterSectionId;
  icon: ReactNode;
  title: string;
  summary: string | null;
  isOpen: boolean;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={id} data-active={summary ? 'true' : undefined}>
      <AccordionTrigger className="library-filter-drawer__section-trigger">
        <span className="library-filter-drawer__section-label">
          {icon}
          {title}
        </span>
        {summary && !isOpen && (
          <span className="library-filter-drawer__section-pill" title={summary}>
            {summary}
          </span>
        )}
      </AccordionTrigger>
      <AccordionContent className="library-filter-drawer__section-content">{children}</AccordionContent>
    </AccordionItem>
  );
}
