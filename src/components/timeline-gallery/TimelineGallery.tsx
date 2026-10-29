import { IconCircleCheck, IconCircleCheckFilled, IconMoodEmpty } from '@tabler/icons-react';
import clsx from 'clsx';
import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';
import { SearchQuery } from '../../common/fileSearchFilters';
import { FilterCriteria } from '../../common/query/filters/FilterCriteria';
import { addConditionsToQuery } from '../../common/searchQueryUtils';
import { LightboxImageContext, LightboxNavigationScope, LightboxOrigin } from '../../context/LightboxContext';
import { AssetDateField, AssetsService } from '../../db/api/services/assets.service.ts';
import { useLiveQuery } from '../../db/connection/useLiveQuery.tsx';
import { AssetInClient } from '../../db/models/AssetInClient';
import { isImportWorkActive } from '../../media/import/importActivity';
import { GalleryLayoutMode, useAppStore } from '../../stores/appState.ts';
import { useHiddenItemsStore } from '../../stores/hiddenItemsStore';
import { ProcessKind, useProcessStore } from '../../stores/processStore';
import { TimelineGroupBy, useSettingsStore } from '../../stores/settingsStore.ts';
import { formatDate } from '../../utils/dateFormatter';
import { getScrollParent } from '../../utils/scrollParent';
import { NoResultsIndicator } from '../NoResultsIndicator.tsx';
import { PhotoInGallery } from '../photo-in-gallery/PhotoInGallery.tsx';
import {
  computeSegmentLayout,
  estimateSectionHeight,
  type JustifiedLayoutOptions,
  type JustifiedLayoutResult,
} from './galleryLayout.ts';
import { createGalleryScrollAnchor } from './galleryScrollAnchor';
import './timelineGallery.css';
import { buildTimelineMonthFilters, type TimelineMonthSectionId } from './timelineMonthFilters';
import { ScrubberSection, TimelineScrubber } from './TimelineScrubber.tsx';

const dayLabelHeight = 40;

/**
 * Carries the active gallery scope (search query + asset id filter) down to the
 * tiles so that opening the lightbox can constrain next/previous navigation to
 * the same subset of assets currently displayed (a tag, album, person, etc.)
 * instead of the entire library.
 */
const GalleryScopeContext = createContext<LightboxNavigationScope>(null);

/** Derives the grouping key and heading label for a date under the active {@link TimelineGroupBy}. */
function getSegmentGrouping(date: Date, groupBy: TimelineGroupBy): { key: string; label: string } {
  const iso = date.toISOString();

  switch (groupBy) {
    case 'month':
      return {
        key: iso.slice(0, 7),
        label: formatDate(date, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      };
    case 'year':
      return { key: iso.slice(0, 4), label: formatDate(date, { year: 'numeric', timeZone: 'UTC' }) };
    case 'day':
    default:
      return {
        key: iso.slice(0, 10),
        label: formatDate(date, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          weekday: 'short',
          timeZone: 'UTC',
        }),
      };
  }
}

/**
 * Returns the location name shared by the majority of photos in a group, or
 * `null` when no single non-empty location covers more than half of them.
 * Photos without a location name are ignored when picking a candidate but still
 * count toward the group total, so a mostly un-located group won't surface a
 * misleading place name.
 */
function getDominantLocation(images: AssetInClient[]): string | null {
  const counts = new Map<string, number>();
  for (const image of images) {
    const name = image.metadata.location?.name?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  let topName: string | null = null;
  let topCount = 0;
  for (const [name, count] of counts) {
    if (count > topCount) {
      topName = name;
      topCount = count;
    }
  }

  // Require a strict majority of the whole group to avoid labelling a group by
  // a location only a couple of its photos happen to carry.
  return topCount * 2 > images.length ? topName : null;
}

type TimelineGalleryProps = {
  searchQuery?: SearchQuery;
  assetIdsFilter?: string[];

  /**
   * Timestamp the timeline sorts and groups by. Defaults to the capture `date`;
   * the "Recently added" view passes `dateAdded`.
   */
  dateField?: AssetDateField;

  /** Component to display if there aren't any elements in the current gallery */
  onNoResults?: JSX.Element;
  pendingImport?: 'metadata' | 'places';
};

export function TimelineGallery({
  searchQuery,
  assetIdsFilter,
  dateField = 'date',
  onNoResults,
  pendingImport = 'metadata',
}: TimelineGalleryProps) {
  const galleryThumbnailSize = useAppStore((state) => state.galleryThumbnailSize);
  const groupBy = useSettingsStore((state) => state.timelineGroupBy);
  const layoutMode = useAppStore((state) => state.layoutMode);
  const setDisplayedElementsCount = useAppStore((state) => state.setDisplayedElementsCount);
  const setDisplayedElementsSizeBytes = useAppStore((state) => state.setDisplayedElementsSizeBytes);
  const setGallerySelectionScope = useAppStore((state) => state.setGallerySelectionScope);
  const showHiddenItems = useHiddenItemsStore((state) => state.showHiddenItems);
  const countUnverifiedFaces = useSettingsStore((state) => state.countUnverifiedFaces);
  const importing = useProcessStore((state) =>
    state.processes.some((process) => process.status === 'running' && process.kind === ProcessKind.Import),
  );
  const [timelineConfig, setTimelineConfig] = useState<JustifiedLayoutOptions>({
    containerWidth: 550,
    targetRowHeight: galleryThumbnailSize,
    boxSpacing: 4,
    containerPadding: 0,
  });

  const [intersectingSections, setIntersectingSections] = useState<string[]>([]);

  const intersectionObserver = useRef<IntersectionObserver | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollAnchor = useMemo(() => createGalleryScrollAnchor(), []);
  const captureScrollAnchor = useCallback(() => {
    if (isImportWorkActive()) scrollAnchor.capture(gridRef.current);
    else scrollAnchor.reset();
  }, [scrollAnchor]);
  const restoreScrollAnchor = useCallback(() => {
    if (isImportWorkActive()) scrollAnchor.restore();
    else scrollAnchor.reset();
  }, [scrollAnchor]);

  // Callers (e.g. `mergeSearchQueries`) hand us a fresh `searchQuery`/`assetIdsFilter`
  // array on every render, even when the actual filters are unchanged. Depending on
  // those references directly would re-fire the live query on every parent re-render
  // (notably while a background face scan keeps re-rendering the page), reloading every
  // thumbnail. Derive a stable value-based key so the query only re-runs on real changes.
  const searchQueryKey = useMemo(() => JSON.stringify(searchQuery ?? null), [searchQuery]);
  const assetIdsFilterKey = useMemo(() => assetIdsFilter?.join(',') ?? null, [assetIdsFilter]);

  // Stable scope object handed to the lightbox so it navigates within the same
  // filtered subset shown here. Keyed off the value-based keys above so it only
  // changes when the actual filters change, not on every parent re-render.
  const galleryScope = useMemo<LightboxNavigationScope>(
    () => ({ searchQuery, assetIds: assetIdsFilter, dateField }),
    [searchQueryKey, assetIdsFilterKey, dateField],
  );

  useLayoutEffect(() => scrollAnchor.reset(), [galleryScope, scrollAnchor]);

  // Publish the active gallery scope so selection UI can resolve "selected in this
  // view" while still keeping the global selection state untouched.
  useEffect(() => {
    setGallerySelectionScope(galleryScope);

    return () => {
      setGallerySelectionScope(null);
    };
  }, [galleryScope, setGallerySelectionScope]);

  // Create the observer against the grid's actual scroll container. Using the
  // viewport (root: null) breaks windowing on pages where the gallery scrolls
  // inside a nested container (e.g. `.scrollable-content`) rather than the page.
  useEffect(() => {
    const gridElement = document.getElementById('grid');
    const scrollRoot = getScrollParent(gridElement);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const sectionId = entry.target.id;
          const isIntersecting = entry.isIntersecting;

          setIntersectingSections((prev) => {
            if (isIntersecting && !prev.some((x) => x == sectionId)) {
              return [...prev, sectionId];
            }
            if (!isIntersecting && prev.some((x) => x == sectionId)) {
              return prev.filter((x) => x !== sectionId);
            }

            return prev;
          });
        });
      },
      {
        root: scrollRoot,
        rootMargin: '200px 0px',
      },
    );

    intersectionObserver.current = observer;

    return () => {
      observer.disconnect();
      intersectionObserver.current = null;
    };
  }, []);

  const { data: sections } = useLiveQuery(
    async () => {
      const sectionsUnparsed = await AssetsService.getFileCountByMonth({
        searchQuery,
        assetIds: assetIdsFilter,
        dateField,
      });

      captureScrollAnchor();

      return sectionsUnparsed.map((x, index) => {
        return {
          ...x,
          index,
        };
      });
    },
    ['assets', 'fileTags', 'tagRegionInfo'],
    {
      extDependencies: [searchQueryKey, assetIdsFilterKey, dateField, showHiddenItems, countUnverifiedFaces],
    },
  );

  useLayoutEffect(() => restoreScrollAnchor(), [sections, restoreScrollAnchor]);

  useEffect(() => {
    const totalElements = sections?.reduce((acc, section) => acc + section.totalImages, 0) ?? 0;
    const totalSizeInBytes = sections?.reduce((acc, section) => acc + section.totalSizeInBytes, 0) ?? 0;
    setDisplayedElementsCount(totalElements);
    setDisplayedElementsSizeBytes(totalSizeInBytes);
  }, [sections, setDisplayedElementsCount, setDisplayedElementsSizeBytes]);

  useEffect(() => {
    return () => {
      setDisplayedElementsCount(0);
      setDisplayedElementsSizeBytes(0);
    };
  }, [setDisplayedElementsCount, setDisplayedElementsSizeBytes]);

  useEffect(() => {
    setTimelineConfig((prevConfig) =>
      prevConfig.targetRowHeight === galleryThumbnailSize
        ? prevConfig
        : {
            ...prevConfig,
            targetRowHeight: galleryThumbnailSize,
          },
    );
  }, [galleryThumbnailSize]);

  useEffect(() => {
    const observer = intersectionObserver.current;
    if (!observer) return;

    // Observe each section element
    sections?.forEach((section) => {
      const sectionElement = document.getElementById(section.sectionId);
      if (sectionElement) {
        observer.observe(sectionElement);
      }
    });

    // Cleanup function to disconnect IntersectionObserver when sections change
    return () => {
      sections?.forEach((section) => {
        const sectionElement = document.getElementById(section.sectionId);
        if (sectionElement) {
          observer.unobserve(sectionElement);
        }
      });
    };
  }, [sections]);

  useEffect(() => {
    const updateContainerWidth = () => {
      const gridElement = document.getElementById('grid');
      if (gridElement) {
        const nextWidth = gridElement.offsetWidth;
        setTimelineConfig((prevConfig) =>
          prevConfig.containerWidth === nextWidth
            ? prevConfig
            : {
                ...prevConfig,
                containerWidth: nextWidth,
              },
        );
      }
    };

    const gridElement = document.getElementById('grid');
    const resizeObserver = gridElement ? new ResizeObserver(updateContainerWidth) : null;
    if (gridElement && resizeObserver) {
      resizeObserver.observe(gridElement);
    }

    // Set initial width.
    updateContainerWidth();

    // Also handle viewport-level resizes that don't resize the grid element's box.
    window.addEventListener('resize', updateContainerWidth);

    // Cleanup observers/listeners on unmount.
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateContainerWidth);
    };
  }, []);

  // Sections needed by the scrubber: parse year/month and precompute the same
  // estimated height the grid uses, so the scrubber proportions line up.
  const scrubberSections = useMemo<ScrubberSection[]>(() => {
    return (
      sections?.map((section) => {
        const [year, month] = section.sectionId.split('-').map((x) => Number(x));
        return {
          sectionId: section.sectionId,
          year,
          month,
          estimatedHeight: estimateSectionHeight(layoutMode, section.totalImages, timelineConfig),
        };
      }) ?? []
    );
  }, [sections, timelineConfig, layoutMode]);

  if (sections && sections.length === 0) {
    return (
      onNoResults ?? (
        <NoResultsIndicator
          icon={<IconMoodEmpty size={64} strokeWidth={1} />}
          title="No photos/videos here"
          description="You might have better luck on another page"
          pendingImport={pendingImport}
        />
      )
    );
  }

  return (
    <GalleryScopeContext.Provider value={galleryScope}>
      {/* Rendered before the grid so the sticky scrubber rail pins from the top
          of the scroll content. It is a zero-height anchor, so it doesn't shift
          the grid. */}
      <TimelineScrubber sections={scrubberSections} />
      <div
        ref={gridRef}
        id="grid"
        className={clsx('photo-grid__sections', importing && 'is-importing')}
        style={{ overflowAnchor: importing ? 'none' : undefined }}
      >
        {sections?.map((section) => (
          <div
            key={section.sectionId}
            id={section.sectionId}
            className="section relative"
            style={{
              width: `${timelineConfig.containerWidth}px`,
              height: intersectingSections.includes(section.sectionId)
                ? undefined
                : `${estimateSectionHeight(layoutMode, section.totalImages, timelineConfig)}px`,
            }}
          >
            {intersectingSections.some((x) => x == section.sectionId) && (
              <TimelineSegments
                config={timelineConfig}
                estimatedHeight={estimateSectionHeight(layoutMode, section.totalImages, timelineConfig)}
                sectionId={section.sectionId as TimelineMonthSectionId}
                searchQuery={searchQuery}
                assetIdsFilter={assetIdsFilter}
                dateField={dateField}
                groupBy={groupBy}
                layoutMode={layoutMode}
                captureScrollAnchor={captureScrollAnchor}
                restoreScrollAnchor={restoreScrollAnchor}
              ></TimelineSegments>
            )}
          </div>
        ))}
      </div>
    </GalleryScopeContext.Provider>
  );
}

interface Segment {
  /** ID of the group of images. Typically a day, a month... */
  segmentId: string;
  /** Heading rendered above the segment. */
  label: string;
  /** Location shared by most photos in the group, or `null` if none dominates. */
  location: string | null;
  images: AssetInClient[];
  layoutInfo: JustifiedLayoutResult;
}

const TimelineSegments = memo(function TimelineSegments(props: {
  sectionId: TimelineMonthSectionId;
  config: JustifiedLayoutOptions;
  estimatedHeight: number;
  searchQuery?: SearchQuery;
  assetIdsFilter?: string[];
  dateField: AssetDateField;
  groupBy: TimelineGroupBy;
  layoutMode: GalleryLayoutMode;
  captureScrollAnchor: () => void;
  restoreScrollAnchor: () => void;
}) {
  const showGroupCount = useSettingsStore((state) => state.showTimelineGroupCount);
  const showGroupLocation = useSettingsStore((state) => state.showTimelineGroupLocation);
  const showHiddenItems = useHiddenItemsStore((state) => state.showHiddenItems);
  const countUnverifiedFaces = useSettingsStore((state) => state.countUnverifiedFaces);
  // Value-based keys so an equivalent (but newly allocated) query/filter array
  // reference doesn't re-fetch this section's files.
  const searchQueryKey = useMemo(() => JSON.stringify(props.searchQuery ?? null), [props.searchQuery]);
  const assetIdsFilterKey = useMemo(() => props.assetIdsFilter?.join(',') ?? null, [props.assetIdsFilter]);

  // Filter the month window on the same column the section was bucketed by, so
  // the "Recently added" view selects files by when they were added.
  const dateCriteria = props.dateField === 'dateAdded' ? FilterCriteria.dateAdded : FilterCriteria.date;
  const monthFilters = buildTimelineMonthFilters(props.sectionId, dateCriteria);

  const { data: files } = useLiveQuery(
    async () => {
      const result = await AssetsService.getFiles({
        assetIds: props.assetIdsFilter,
        dateField: props.dateField,
        searchQuery: addConditionsToQuery(props.searchQuery ?? [], monthFilters),
      });
      props.captureScrollAnchor();
      return result;
    },
    ['assets', 'fileTags', 'tagRegionInfo'],
    {
      extDependencies: [
        searchQueryKey,
        assetIdsFilterKey,
        props.dateField,
        showHiddenItems,
        countUnverifiedFaces,
      ],
    },
  );

  const segments = useMemo<Segment[]>(() => {
    if (!files) return [];

    const groupedFiles: { [key: string]: { label: string; images: AssetInClient[] } } = {};
    files.forEach((file) => {
      const groupingDate = props.dateField === 'dateAdded' ? file.dateAdded : file.metadata.date;
      const { key, label } = getSegmentGrouping(groupingDate, props.groupBy);
      if (!groupedFiles[key]) groupedFiles[key] = { label, images: [] };
      groupedFiles[key].images.push(file);
    });

    return Object.entries(groupedFiles).map(([key, { label, images }]) => {
      const sizes = images.map((image) => ({
        height: image.metadata.height,
        width: image.metadata.width,
      }));

      return {
        segmentId: `${props.sectionId}__${key}`,
        label,
        location: getDominantLocation(images),
        images,
        layoutInfo: computeSegmentLayout(props.layoutMode, sizes, props.config),
      };
    });
  }, [files, props.config, props.groupBy, props.sectionId, props.layoutMode, props.dateField]);

  useLayoutEffect(() => {
    props.restoreScrollAnchor();
  }, [segments, props.restoreScrollAnchor]);

  if (!files) return <div style={{ height: props.estimatedHeight }} />;

  return (
    <>
      {segments.map((segment) => (
        <TimelineSegment
          key={segment.segmentId}
          segment={segment}
          layoutMode={props.layoutMode}
          containerWidth={props.config.containerWidth ?? 0}
          showGroupCount={showGroupCount}
          showGroupLocation={showGroupLocation}
        />
      ))}
    </>
  );
});

/**
 * Circle checkbox shown before a date segment's title (Google Photos style). It
 * animates in when the segment is hovered or already has a selection, and clicking
 * it selects/deselects every photo in that segment at once.
 */
const SegmentSelectButton = memo(function SegmentSelectButton({
  images,
  hovered,
}: {
  images: AssetInClient[];
  hovered: boolean;
}) {
  const selectedImages = useAppStore((state) => state.selectedImages);
  const setSelectedImages = useAppStore((state) => state.setSelectedImages);

  const { allSelected, someSelected } = useMemo(() => {
    if (images.length === 0) return { allSelected: false, someSelected: false };
    const selectedIds = new Set(selectedImages.map((x) => x.id));
    let count = 0;
    for (const image of images) {
      if (selectedIds.has(image.id)) count++;
    }
    return { allSelected: count === images.length, someSelected: count > 0 };
  }, [images, selectedImages]);

  const visible = hovered || someSelected;

  function handleToggle(ev: React.MouseEvent<HTMLButtonElement>) {
    ev.stopPropagation();

    if (allSelected) {
      const idsToRemove = new Set(images.map((x) => x.id));
      setSelectedImages(selectedImages.filter((x) => !idsToRemove.has(x.id)));
      return;
    }

    const alreadySelected = new Set(selectedImages.map((x) => x.id));
    const additions = images.filter((x) => !alreadySelected.has(x.id));
    setSelectedImages([...selectedImages, ...additions]);
  }

  return (
    <button
      type="button"
      className={clsx('segment-select-button', { 'is-visible': visible })}
      role="checkbox"
      aria-checked={allSelected}
      aria-label={allSelected ? 'Deselect all photos in this group' : 'Select all photos in this group'}
      onClick={handleToggle}
    >
      {allSelected ? (
        <IconCircleCheckFilled className="segment-select-button__icon is-selected" />
      ) : (
        <IconCircleCheck className="segment-select-button__icon" stroke={2} />
      )}
    </button>
  );
});

const TimelineSegment = memo(function TimelineSegment({
  segment,
  layoutMode,
  containerWidth,
  showGroupCount,
  showGroupLocation,
}: {
  segment: Segment;
  layoutMode: GalleryLayoutMode;
  containerWidth: number;
  showGroupCount: boolean;
  showGroupLocation: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  const subLabelParts: string[] = [];
  if (showGroupCount) {
    const count = segment.images.length;
    subLabelParts.push(`${count} ${count === 1 ? 'photo' : 'photos'}`);
  }
  if (showGroupLocation && segment.location) {
    subLabelParts.push(segment.location);
  }
  const subLabel = subLabelParts.join(' • ');

  return (
    <div
      className="segment-group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ height: `${dayLabelHeight}px` }} className="segment-label">
        <SegmentSelectButton images={segment.images} hovered={hovered} />
        <span className="segment-label-date">{segment.label}</span>
        {subLabel && <span className="segment-label-secondary">{subLabel}</span>}
      </div>
      <div
        id={segment.segmentId}
        className="segment"
        style={{
          width: `${containerWidth}px`,
          height: `${segment.layoutInfo.containerHeight}px`,
        }}
      >
        <FileTiles segment={segment} layoutMode={layoutMode} />
      </div>
    </div>
  );
});

/**
 * Only virtualize segments that exceed this tile count. Smaller segments are
 * rendered in full — the overhead of scroll-tracking isn't worth it.
 */
const TILE_VIRTUALIZE_THRESHOLD = 60;

/**
 * Extra pixels to render above and below the visible viewport so that tiles
 * are already mounted when the user scrolls to them.
 */
const TILE_OVERSCAN_PX = 800;

const FileTiles = memo(function FileTiles({
  segment,
  layoutMode,
}: {
  segment: Segment;
  layoutMode: GalleryLayoutMode;
}) {
  const { openLightbox } = useContext(LightboxImageContext);
  const galleryScope = useContext(GalleryScopeContext);
  const shouldVirtualize = segment.images.length > TILE_VIRTUALIZE_THRESHOLD;

  // Open the lightbox scoped to the gallery's current filters so next/previous
  // stay within the displayed subset rather than the whole library.
  const handleImgClick = useCallback(
    (img: AssetInClient, origin?: LightboxOrigin) => openLightbox(img, origin, galleryScope),
    [openLightbox, galleryScope],
  );

  const [visibleRange, setVisibleRange] = useState({
    top: -TILE_OVERSCAN_PX,
    bottom: window.innerHeight + TILE_OVERSCAN_PX,
  });

  // Pair each layout box with its asset to build the renderable tiles.
  const tiles = useMemo(
    () =>
      segment.layoutInfo.boxes.map((box, index) => {
        const file = segment.images[index];
        if (!file) throw new Error(`No file at index ${index} in segment ${segment.segmentId}`);
        return { ...box, file };
      }),
    [segment],
  );

  // Compute which portion of the segment is visible relative to the scroll
  // container, then keep that window updated as the user scrolls/resizes.
  useLayoutEffect(() => {
    if (!shouldVirtualize) return;

    let rafId = 0;
    const container = document.getElementById(segment.segmentId);
    if (!container) return;

    const scrollParent = getScrollParent(container);

    const compute = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const containerRect = container.getBoundingClientRect();
        let vpTop: number;
        let vpBottom: number;

        if (scrollParent) {
          const spRect = scrollParent.getBoundingClientRect();
          vpTop = spRect.top - containerRect.top;
          vpBottom = spRect.bottom - containerRect.top;
        } else {
          vpTop = -containerRect.top;
          vpBottom = window.innerHeight - containerRect.top;
        }

        setVisibleRange({ top: vpTop - TILE_OVERSCAN_PX, bottom: vpBottom + TILE_OVERSCAN_PX });
      });
    };

    compute();

    const scrollEl: EventTarget = scrollParent ?? window;
    scrollEl.addEventListener('scroll', compute, { passive: true } as AddEventListenerOptions);
    window.addEventListener('resize', compute, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      scrollEl.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
  }, [segment.segmentId, shouldVirtualize]);

  const visibleTiles = useMemo(() => {
    if (!shouldVirtualize) return tiles;
    return tiles.filter(
      (tile) => tile.top + tile.height > visibleRange.top && tile.top < visibleRange.bottom,
    );
  }, [tiles, visibleRange, shouldVirtualize]);

  return (
    <>
      {visibleTiles.map((tile) => (
        <div
          key={tile.file.id}
          className={layoutMode === 'card' ? 'tile tile--card' : 'tile'}
          style={{
            width: `${tile.width}px`,
            height: `${tile.height}px`,
            left: `${tile.left}px`,
            top: `${tile.top}px`,
          }}
        >
          <PhotoInGallery img={tile.file} onImgClick={handleImgClick} />
        </div>
      ))}
    </>
  );
});
