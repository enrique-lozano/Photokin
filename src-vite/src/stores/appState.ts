import { create } from 'zustand';
import { SearchQuery } from '../common/fileSearchFilters';
import { LightboxNavigationScope } from '../context/LightboxContext';
import { AssetInClient } from '../db/models/AssetInClient';

/**
 * Controls how face boxes are shown over the lightbox image.
 * - `never`: never show the boxes.
 * - `hover`: only show a box while the cursor is inside that face.
 * - `auto`: show all boxes while the cursor moves over the photo.
 */
export type FaceBoxMode = 'never' | 'hover' | 'auto';

/**
 * Gallery layout style selected from the toolbar "Layout" popover.
 * - `justified`: equal-height rows that fill the container width (default).
 * - `masonry`: equal-width columns with a ragged bottom edge (aspect preserved).
 * - `card`: uniform square cards that crop to fill.
 */
export type GalleryLayoutMode = 'justified' | 'masonry' | 'card';

/**
 * What the current page shows. The shell derives its page-dependent chrome from
 * it, so a control only appears where it has an effect:
 * - `photos`: a photo gallery — thumbnail zoom, live photo count, library filters.
 * - `faces`: a grid of face crops — thumbnail zoom, page-provided count.
 * - `entities`: a list of people/tags — page-provided count only.
 * - `review`: a structured review queue — page-provided footer only.
 * - `stats`: library charts — library filters, page-provided count.
 */
export type PageContentKind = 'photos' | 'faces' | 'entities' | 'review' | 'stats';

/**
 * Whether the library filters affect the page: `applied`, `paused` (the page
 * uses them but its current mode doesn't, e.g. a person's Faces view) or `none`.
 */
export type GlobalFiltersState = 'applied' | 'paused' | 'none';

/** Footer readout a page publishes. Kept generic so the footer stays feature-agnostic. */
export interface PageFooterStatus {
  /** Left summary, e.g. "Compared 38,291 photos · 248 sets". */
  summary?: string;
  /** Center "X to remove · frees Y" (X red, Y green). */
  pending?: { count: number; freesBytes: number };
  /** Right total size on disk, in bytes. */
  totalBytes?: number;
  /**
   * Optional slider rendered in the footer right region. The page owns the
   * value and the change handler, keeping the footer feature-agnostic.
   */
  slider?: {
    value: number;
    min: number;
    max: number;
    step: number;
    ariaLabel: string;
    onChange: (value: number) => void;
  };
}

/** Declared by every page through `usePageChrome`; `null` means no page-dependent chrome. */
export interface PageChrome {
  kind: PageContentKind;
  /** Replaces the default readout (photos pages fall back to the gallery's live count). */
  status?: PageFooterStatus;
  /** Defaults to `applied` for `photos`/`stats` and `none` otherwise. */
  globalFilters?: GlobalFiltersState;
}

/** A single segment of the page trail (e.g. `People / Sofia`), shown above the hero title. */
export interface BreadcrumbItem {
  label: string;
  /** Optional route to navigate to when the segment is clicked. */
  to?: string;
  /**
   * Optional click handler, used when the segment doesn't map to a route
   * (e.g. selecting an album in the tree). Takes precedence over `to`.
   */
  onClick?: () => void;
}

interface AppGlobalState {
  searchQuery: SearchQuery;
  setSearchQuery: (newSearch: SearchQuery) => void;
  /** The page's full trail, itself last; the hero shows its parents. Pages set this on mount. */
  breadcrumb: BreadcrumbItem[];
  setBreadcrumb: (breadcrumb: BreadcrumbItem[]) => void;
  /** What the current page shows; drives the footer and the filter button. */
  pageChrome: PageChrome | null;
  setPageChrome: (chrome: PageChrome | null) => void;
  /** Gallery layout selected from the toolbar "Layout" popover. */
  layoutMode: GalleryLayoutMode;
  setLayoutMode: (layoutMode: GalleryLayoutMode) => void;
  secondaryNavbarWidth: number | null;
  setSecondaryNavbarWidth: (width: number) => void;
  galleryThumbnailSize: number;
  setGalleryThumbnailSize: (size: number) => void;
  displayedElementsCount: number;
  setDisplayedElementsCount: (count: number) => void;
  displayedElementsSizeBytes: number;
  setDisplayedElementsSizeBytes: (sizeInBytes: number) => void;
  selectedImages: AssetInClient[];
  setSelectedImages: (files: AssetInClient[]) => void;
  comparisonPair: [AssetInClient, AssetInClient] | null;
  setComparisonPair: (pair: [AssetInClient, AssetInClient] | null) => void;
  /** Scope of the currently mounted timeline gallery used by selection UI. */
  gallerySelectionScope: LightboxNavigationScope;
  setGallerySelectionScope: (scope: LightboxNavigationScope) => void;
  /**
   * Which kind of gallery is on screen, so shared selection UI (context menu,
   * selection bar, shortcuts) can offer Trash-specific actions (restore / delete
   * permanently) instead of the normal ones when viewing the Trash tab.
   */
  galleryContext: 'default' | 'trash';
  setGalleryContext: (context: 'default' | 'trash') => void;
  faceBoxMode: FaceBoxMode;
  setFaceBoxMode: (mode: FaceBoxMode) => void;
  /**
   * Per-asset counter bumped whenever an asset changes — in the database and/or
   * on disk (metadata edit, write-back, rename, reload…). UI that shows a single
   * asset (e.g. the lightbox DB row or the info panel's live modified date)
   * selects its asset's revision to re-read on demand, without observing the
   * whole table, polling, or triggering a global re-render.
   */
  assetRevisions: Record<string, number>;
  markAssetChanged: (assetId: string | string[]) => void;
}

export const useAppStore = create<AppGlobalState>()((set) => ({
  searchQuery: [],
  setSearchQuery: (newSearch) => set(() => ({ searchQuery: newSearch })),
  breadcrumb: [],
  setBreadcrumb: (breadcrumb) => set({ breadcrumb }),
  pageChrome: null,
  setPageChrome: (pageChrome) => set({ pageChrome }),
  layoutMode: 'justified',
  setLayoutMode: (layoutMode) => set({ layoutMode }),
  secondaryNavbarWidth: null,
  setSecondaryNavbarWidth: (width) =>
    set((state) => {
      if (state.secondaryNavbarWidth === width) {
        return state;
      }

      return { secondaryNavbarWidth: width };
    }),
  galleryThumbnailSize: 200,
  setGalleryThumbnailSize: (size) =>
    set((state) => {
      if (state.galleryThumbnailSize === size) {
        return state;
      }

      return { galleryThumbnailSize: size };
    }),
  displayedElementsCount: 0,
  setDisplayedElementsCount: (count) =>
    set((state) => {
      if (state.displayedElementsCount === count) {
        return state;
      }

      return { displayedElementsCount: count };
    }),
  displayedElementsSizeBytes: 0,
  setDisplayedElementsSizeBytes: (sizeInBytes) =>
    set((state) => {
      if (state.displayedElementsSizeBytes === sizeInBytes) {
        return state;
      }

      return { displayedElementsSizeBytes: sizeInBytes };
    }),
  selectedImages: [],
  setSelectedImages: (newSelectedFiles) => set(() => ({ selectedImages: newSelectedFiles })),
  comparisonPair: null,
  setComparisonPair: (comparisonPair) => set({ comparisonPair }),
  gallerySelectionScope: null,
  setGallerySelectionScope: (gallerySelectionScope) => set({ gallerySelectionScope }),
  galleryContext: 'default',
  setGalleryContext: (galleryContext) => set({ galleryContext }),
  faceBoxMode: 'auto',
  setFaceBoxMode: (faceBoxMode) => set({ faceBoxMode }),
  assetRevisions: {},
  markAssetChanged: (assetId) =>
    set((state) => {
      const ids = typeof assetId === 'string' ? [assetId] : assetId;
      if (ids.length === 0) return state;

      const assetRevisions = { ...state.assetRevisions };
      for (const id of ids) {
        assetRevisions[id] = (assetRevisions[id] ?? 0) + 1;
      }
      return { assetRevisions };
    }),
}));
