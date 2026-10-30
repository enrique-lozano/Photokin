import { useHasActiveLibraryFilters } from '@/components/app-shell/ClearLibraryFilters';
import { ChipFiltersEmptyState } from '@/components/page-content/ChipFiltersEmptyState';
import { FilterChipPlaceholders, FilterChipRow } from '@/components/page-content/FilterChipRow';
import { HeroIcon } from '@/components/page-content/HeroIcon';
import { HeroToggle } from '@/components/page-content/HeroToggle';
import { useContentFilterChips } from '@/components/page-content/useContentFilterChips';
import { usePageChrome } from '@/components/page-content/usePageChrome';
import { Button } from '@/components/ui/button.tsx';
import { EmptyState } from '@/components/ui/empty-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AssetsService } from '@/db/api/services/assets.service';
import { ProcessKind } from '@/stores/processStore';
import {
  IconClock,
  IconDots,
  IconEye,
  IconEyeOff,
  IconFolder,
  IconFolderBolt,
  IconFolderFilled,
  IconHeart,
  IconHierarchy,
  IconPhoto,
  IconPlus,
  IconRestore,
  IconStar,
  IconTrash,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchQueryType } from '../../common/fileSearchFilters';
import { FilterCriteria } from '../../common/query/filters/FilterCriteria';
import { RatingMode } from '../../common/ratingModeOptions';
import { mergeSearchQueries } from '../../common/searchQueryUtils';
import { TRASHED_ONLY_CONDITION } from '../../common/trashQuery';
import { SecondaryNavbar } from '../../components/secondary-navbar/SecondaryNavbar';
import { formatSidebarFilterCount } from '../../components/secondary-navbar/sidebarFilterCount';
import { SidebarNoMatches } from '../../components/secondary-navbar/SidebarNoMatches';
import { SidebarSearchInput } from '../../components/secondary-navbar/SidebarSearchInput';
import { SidebarSortMenu, SidebarSortOption } from '../../components/secondary-navbar/SidebarSortMenu';
import { TimelineGallery } from '../../components/timeline-gallery/TimelineGallery';
import { useTrashDialog } from '../../components/trash/trashDialogStore';
import { countTreeNameMatches } from '../../components/tree/filterTreeItems';
import { Tree } from '../../components/tree/Tree';
import {
  applyRecursiveFn,
  findSelectedRootEntry,
  sortTreeEntries,
  updateSelectedState,
} from '../../components/tree/TreeEntry.utils';
import { AlbumsService, getAlbumMoveError } from '../../db/api/services/albums.service.ts';
import { AppDataService } from '../../db/api/services/appData.service.ts';
import { syncFilesAndDirsOf } from '../../db/api/services/assetIndexer.service.ts';
import { useLiveQuery } from '../../db/connection/useLiveQuery.tsx';
import { AlbumInClient } from '../../db/models/AlbumDTO';
import { FAVORITE_RATING } from '../../media/metadata/fields/favorite';
import { BreadcrumbItem, useAppStore } from '../../stores/appState.ts';
import { useHiddenItemsStore } from '../../stores/hiddenItemsStore';
import { useSettingsStore } from '../../stores/settingsStore.ts';
import { AlbumsSort, useSidebarStore } from '../../stores/sidebarStore.ts';
import { trackProcess } from '../../system/processTracker.ts';
import { notifySyncResult } from '../../system/syncFeedback.ts';
import { formatDate } from '../../utils/dateFormatter';
import { appTaskQueue } from '../../utils/taskQueue/taskQueue';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent.tsx';
import { useTreeSelectorMenu } from '../useTreeSelectorMenu';
import { AddAlbumsModal } from './AddAlbumsModal.tsx';
import { AlbumHeaderActions } from './albumActions';
import './albums.css';
import {
  albumForFolderEntry,
  folderEntryId,
  isAlbumHidden,
  isFolderEntryId,
  mapAlbumsToTreeItems,
} from './mapAlbums';
import { MoveAlbumDialog } from './MoveAlbumDialog';

type AlbumView = 'allPhotos' | 'favorites' | 'recentlyAdded' | 'trash' | 'selectedAlbums';

// Albums are folders with no stored photo tally, so we sort by name only.
const ALBUMS_SORT_OPTIONS: SidebarSortOption<AlbumsSort>[] = [
  { value: 'az', label: 'Name A–Z' },
  { value: 'za', label: 'Name Z–A' },
];

export function AlbumsPage() {
  const { data: albums } = useLiveQuery(() => AlbumsService.getAll(), ['albums']);

  const libraryIsEmpty = albums !== null && albums.length === 0;

  const searchQuery = useAppStore((state) => state.searchQuery);
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);
  const setGalleryContext = useAppStore((state) => state.setGalleryContext);
  const albumTree = useSidebarStore((state) => state.albumTree);
  const setAlbumTree = useSidebarStore((state) => state.setAlbumTree);
  const sort = useSidebarStore((state) => state.sort.albums);
  const setSort = useSidebarStore((state) => state.setSort);
  const ratingMode = useSettingsStore((state) => state.ratingMode);
  const hasLibraryFilters = useHasActiveLibraryFilters();
  const showHiddenItems = useHiddenItemsStore((state) => state.showHiddenItems);
  const setShowHiddenItems = useHiddenItemsStore((state) => state.setShowHiddenItems);
  const [albumView, setAlbumView] = useState<AlbumView>('allPhotos');
  const [isAddAlbumsModalOpen, setIsAddAlbumsModalOpen] = useState(false);
  const [moveProposal, setMoveProposal] = useState<{
    sourceId: string;
    targetId: string | null;
  } | null>(null);

  const { preparedTreeData, searchFilter, setSearchFilter, selectChildMode, setSelectChildMode } =
    useTreeSelectorMenu(albumTree, setAlbumTree);

  // Name matches among album rows only. Folders with no album row stay in the
  // tree so a match can be reached, but they are not part of the album total.
  const matchedAlbumCount = useMemo(() => {
    if (!searchFilter || !preparedTreeData) return null;
    return countTreeNameMatches(preparedTreeData, searchFilter, (entry) => !isFolderEntryId(entry.id));
  }, [preparedTreeData, searchFilter]);

  // Rebuild the sidebar tree when album data or sort order changes, without
  // re-running on every expand/select (which would fight user interaction).
  const treePreservationRef = useRef({ opened: [] as string[], selected: [] as string[] });

  useEffect(() => {
    if (!albumTree) return;

    const opened: string[] = [];
    const selected: string[] = [];
    applyRecursiveFn(albumTree, (entry) => {
      if (entry.open) opened.push(entry.id);
      if (entry.selected) selected.push(entry.id);
    });
    treePreservationRef.current = { opened, selected };
  }, [albumTree]);

  useEffect(() => {
    if (!albums) {
      return;
    }

    const treeAlbums = showHiddenItems ? albums : albums.filter((album) => !isAlbumHidden(album, albums));
    const mapped = mapAlbumsToTreeItems(treeAlbums, {
      initiallyOpenedIDs: treePreservationRef.current.opened,
      initiallySelectedIDs: treePreservationRef.current.selected,
    });

    sortTreeEntries(mapped, (a, b) =>
      sort === 'za' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
    );

    setAlbumTree(mapped);
  }, [albums, sort, setAlbumTree, showHiddenItems]);

  const handleRefreshAlbums = () => {
    if (!albums) return;

    trackProcess(
      {
        kind: ProcessKind.Sync,
        title: 'Syncing albums',
        message: 'Waiting in queue…',
        canStop: true,
        // A detailed summary toast is built from the sync result.
        successMessage: false,
        errorMessage: (error) => `Sync failed: ${String(error)}`,
      },
      (reporter) =>
        appTaskQueue.add(
          () =>
            syncFilesAndDirsOf({
              albums,
              resyncMode: useSettingsStore.getState().resyncMode,
              reporter,
            }),
          { signal: reporter.signal },
        ),
    )
      .then((result) => {
        void AppDataService.markLastSynced();
        notifySyncResult(result);
      })
      .catch(() => {
        // The process tracker already surfaced the error toast + state.
      });
  };

  // Only the selected rows backed by an album row, i.e. the ones that can carry
  // photos of their own.
  const selectedAlbums = useMemo(() => {
    if (!albumTree) return [];

    const selected: AlbumInClient[] = [];
    applyRecursiveFn(albumTree, (entry) => {
      const toSelect = albums?.find((x) => x.id === entry.id);
      if (toSelect && entry.selected) selected.push(toSelect);
    });

    return selected;
  }, [albumTree, albums]);

  // The row the user clicked, which roots the selected subtree. Reading it from
  // the tree rather than from `selectedAlbums` is what lets a folder with no
  // album row of its own open: the import records a folder only when it holds
  // files, so such a folder is absent from `albums` while still being a real
  // directory the user can browse.
  const selectedEntry = findSelectedRootEntry(albumTree);
  const selectedEntryId = selectedEntry?.id ?? null;
  const selectedAlbum = useMemo(() => {
    if (!selectedEntryId || !albums) return null;

    return albums.find((x) => x.id === selectedEntryId) ?? albumForFolderEntry(selectedEntryId, albums);
  }, [selectedEntryId, albums]);

  const activeAlbumView: AlbumView = selectedEntryId ? 'selectedAlbums' : albumView;
  const albumForTreeId = (id: string): AlbumInClient | null =>
    albums?.find((album) => album.id === id) ?? (albums ? albumForFolderEntry(id, albums) : null);
  const movedAlbum = moveProposal ? albumForTreeId(moveProposal.sourceId) : null;
  const targetAlbum = moveProposal?.targetId ? albumForTreeId(moveProposal.targetId) : null;
  const albumMoveError =
    moveProposal && movedAlbum && albums
      ? moveProposal.targetId && !targetAlbum
        ? 'The destination album no longer exists.'
        : getAlbumMoveError(albums, movedAlbum, targetAlbum)
      : moveProposal
        ? 'The album no longer exists.'
        : null;

  // Full breadcrumb for the selected album, e.g. `Albums > Travel > Mexico`.
  // Album segments navigate by re-selecting the album in the tree (there's no
  // dedicated route), so they use `onClick` rather than `to`.
  const albumBreadcrumb = useMemo<BreadcrumbItem[]>(() => {
    // Same role as "Tags" on a tag page: leave the current scope for the index.
    const showAllPhotos = () => {
      const tree = useSidebarStore.getState().albumTree ?? [];
      setAlbumTree(
        applyRecursiveFn(tree, (entry) => {
          entry.selected = false;
        }),
      );
      setAlbumView('allPhotos');
    };
    const albumsCrumb: BreadcrumbItem = { label: 'Albums', onClick: showAllPhotos };

    if (activeAlbumView === 'favorites') return [albumsCrumb, { label: 'Favorites' }];
    if (activeAlbumView === 'recentlyAdded') return [albumsCrumb, { label: 'Recently Added' }];
    if (activeAlbumView === 'trash') return [albumsCrumb, { label: 'Trash' }];
    if (activeAlbumView !== 'selectedAlbums' || !selectedAlbum || !albums) return [];

    const album = selectedAlbum;
    const trimSlashes = (value: string) => value.replace(/^[/\\]+|[/\\]+$/g, '');
    const selectAlbum = (id: string) => {
      const tree = useSidebarStore.getState().albumTree ?? [];
      setAlbumTree(updateSelectedState(tree, id, { isRecursive: selectChildMode }));
    };

    const items: BreadcrumbItem[] = [albumsCrumb];

    const rootAlbum = albums.find(
      (entry) => entry.rootAlbumId === album.rootAlbumId && entry.isAtTheRootLevel,
    );
    if (rootAlbum) {
      items.push({ label: rootAlbum.name, onClick: () => selectAlbum(rootAlbum.id) });
    }

    let accumulated = '';
    for (const part of trimSlashes(album.relativePath).split('/').filter(Boolean)) {
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      const match = albums.find(
        (entry) => entry.rootAlbumId === album.rootAlbumId && trimSlashes(entry.relativePath) === accumulated,
      );
      const segmentId = match ? match.id : folderEntryId(album.rootAlbumId, accumulated);
      items.push({ label: part, onClick: () => selectAlbum(segmentId) });
    }

    return items;
  }, [activeAlbumView, selectedAlbum, albums, selectChildMode, setAlbumTree, setAlbumView]);

  useEffect(() => {
    setBreadcrumb(albumBreadcrumb);
    return () => setBreadcrumb([]);
  }, [setBreadcrumb, albumBreadcrumb]);

  const clearAlbumSelection = () => {
    if (!albumTree) return;
    setAlbumTree(
      applyRecursiveFn(albumTree, (entry) => {
        entry.selected = false;
      }),
    );
  };

  // A folder with no album row contributes the album rebuilt for it, whose id
  // matches no asset. That keeps the gallery empty — which is the truth for a
  // folder holding only sub-folders — instead of falling back to the whole
  // library, until the sub-albums toggle pulls the folders beneath it in.
  const queryAlbums = useMemo(
    () => (selectedAlbums.length > 0 ? selectedAlbums : selectedAlbum ? [selectedAlbum] : []),
    [selectedAlbums, selectedAlbum],
  );

  const selectedAlbumsSearchQuery = useMemo(() => {
    if (queryAlbums.length === 0) return searchQuery;

    return mergeSearchQueries(searchQuery, {
      type: SearchQueryType.OR,
      filters: queryAlbums.map((x) => {
        return {
          filterCriteria: FilterCriteria.path,
          operator: 'contains',
          value: [x],
        };
      }),
    });
  }, [searchQuery, queryAlbums]);

  const favoritesSearchQuery = useMemo(
    () =>
      mergeSearchQueries(searchQuery, {
        filters: [
          { filterCriteria: FilterCriteria.rating, operator: 'greaterThanOrEquals', value: FAVORITE_RATING },
        ],
      }),
    [searchQuery],
  );

  const trashSearchQuery = useMemo(
    () => mergeSearchQueries(searchQuery, TRASHED_ONLY_CONDITION),
    [searchQuery],
  );

  const baseQuery =
    activeAlbumView === 'selectedAlbums'
      ? selectedAlbumsSearchQuery
      : activeAlbumView === 'favorites'
        ? favoritesSearchQuery
        : activeAlbumView === 'trash'
          ? trashSearchQuery
          : searchQuery;

  const viewKey = `${activeAlbumView}-${selectedEntryId ?? ''}-${selectedAlbums.map((album) => album.id).join(',')}`;

  const { data: dateRange } = useLiveQuery(
    () => AssetsService.getDateRange({ searchQuery: baseQuery }),
    ['assets'],
    { extDependencies: [baseQuery] },
  );
  const { data: yearCounts } = useLiveQuery(
    () => AssetsService.getFileCountByYear({ searchQuery: baseQuery }),
    ['assets'],
    { extDependencies: [baseQuery] },
  );
  const totalCount = (yearCounts ?? []).reduce((acc, year) => acc + year.totalImages, 0);

  const {
    chips,
    activeChipIds,
    toggleChip,
    clear: clearChips,
    conditions,
    isLoading: chipsLoading,
    isRefreshing: chipsRefreshing,
  } = useContentFilterChips({
    searchQuery: baseQuery,
    resetKey: viewKey,
  });
  const galleryQuery = mergeSearchQueries(baseQuery, conditions);

  const heroTitle =
    activeAlbumView === 'selectedAlbums'
      ? (selectedAlbum?.name ?? 'Album')
      : activeAlbumView === 'favorites'
        ? 'Favorites'
        : activeAlbumView === 'recentlyAdded'
          ? 'Recently Added'
          : activeAlbumView === 'trash'
            ? 'Trash'
            : 'All Photos';

  // The hero badge carries the same glyph as the view's sidebar row, so the two
  // always read as the same place. Favorites follows the rating mode exactly
  // like the sidebar does.
  const favoritesHeroIcon =
    ratingMode === RatingMode.Favorites ? (
      <HeroIcon icon={<IconHeart size={28} />} color="hsl(var(--favorite))" />
    ) : (
      <HeroIcon icon={<IconStar size={28} />} color="hsl(var(--warning))" />
    );

  const heroCover =
    activeAlbumView === 'selectedAlbums' ? (
      <HeroIcon icon={<IconFolderFilled size={28} />} color="hsl(var(--warning))" />
    ) : activeAlbumView === 'trash' ? (
      <HeroIcon icon={<IconTrash size={28} />} color="hsl(var(--destructive))" />
    ) : activeAlbumView === 'favorites' ? (
      favoritesHeroIcon
    ) : activeAlbumView === 'recentlyAdded' ? (
      <HeroIcon icon={<IconClock size={28} />} />
    ) : (
      <HeroIcon icon={<IconPhoto size={28} />} />
    );

  // Let the shared selection UI (context menu, selection bar, shortcuts) offer
  // restore / delete-permanently instead of the normal actions while in Trash.
  useEffect(() => {
    setGalleryContext(activeAlbumView === 'trash' ? 'trash' : 'default');
    return () => setGalleryContext('default');
  }, [activeAlbumView, setGalleryContext]);

  const dateMeta = dateRange
    ? `${formatDate(new Date(dateRange.min), { year: 'numeric', month: 'short' })} – ${formatDate(
        new Date(dateRange.max),
        { year: 'numeric', month: 'short' },
      )}`
    : null;

  usePageChrome('photos');

  return (
    <div className="albums-page">
      <SecondaryNavbar title="Albums">
        {/* Index row + smart rows (saved queries), always read as one group.
            Create/scan/sync verbs live in the page header, not here. */}
        <div className="album-auto-links">
          <Button
            className={clsx('album-auto-link', activeAlbumView === 'allPhotos' && 'selected')}
            onClick={() => {
              clearAlbumSelection();
              setAlbumView('allPhotos');
            }}
          >
            <IconPhoto size={15} color="hsl(var(--primary))" />
            All Photos
          </Button>
          <Button
            className={clsx('album-auto-link', activeAlbumView === 'favorites' && 'selected')}
            onClick={() => {
              clearAlbumSelection();
              setAlbumView('favorites');
            }}
          >
            {ratingMode === RatingMode.Favorites ? (
              <IconHeart size={15} className="text-favorite" />
            ) : (
              <IconStar size={15} color="hsl(var(--warning))" />
            )}
            Favorites
          </Button>
          <Button
            className={clsx('album-auto-link', activeAlbumView === 'recentlyAdded' && 'selected')}
            onClick={() => {
              clearAlbumSelection();
              setAlbumView('recentlyAdded');
            }}
          >
            <IconClock size={15} />
            Recently Added
          </Button>
          <Button
            className={clsx('album-auto-link', activeAlbumView === 'trash' && 'selected')}
            onClick={() => {
              clearAlbumSelection();
              setAlbumView('trash');
            }}
          >
            <IconTrash size={15} />
            Trash
          </Button>
        </div>

        <div className="sidebar-zone-divider" />

        {/* Filter opens the items zone; the title below carries the total count
            on the left and the sort on the right. While filtering, the count
            is the matches over that same total. */}
        {libraryIsEmpty ? (
          <EmptyState
            size="sidebar"
            icon={IconFolder}
            title="No albums yet"
            description="Folders you add show up here."
          />
        ) : (
          <>
            <SidebarSearchInput
              placeholder="Filter albums"
              value={searchFilter ?? ''}
              onValueChange={setSearchFilter}
            />
            <p className="sidebar-section-label">
              <span
                className={clsx(
                  'sidebar-section-label__count',
                  albums && matchedAlbumCount !== null && 'sidebar-section-label__count--filtered',
                )}
              >
                {formatSidebarFilterCount(albums?.length ?? 0, albums ? matchedAlbumCount : null)}
              </span>
              <span>Albums</span>
              <SidebarSortMenu
                value={sort}
                options={ALBUMS_SORT_OPTIONS}
                onChange={(value) => setSort('albums', value)}
                ariaLabel="Sort albums"
              />
            </p>
          </>
        )}
        {matchedAlbumCount === 0 && <SidebarNoMatches noun="albums" onClear={() => setSearchFilter('')} />}
        <section className="tree-container">
          {preparedTreeData && (
            <Tree
              filter={searchFilter}
              entries={preparedTreeData}
              dragDrop={{
                canDrag: (entryId) => {
                  const album = albumForTreeId(entryId);
                  return Boolean(album && !album.isAtTheRootLevel);
                },
                canDrop: (sourceId, targetId) => {
                  const source = albumForTreeId(sourceId);
                  const target = targetId ? albumForTreeId(targetId) : null;
                  // Show hierarchy errors in the confirmation modal instead of
                  // rejecting the pointer without an explanation.
                  return Boolean(source && (!targetId || target));
                },
                onDrop: (sourceId, targetId) => setMoveProposal({ sourceId, targetId }),
              }}
            />
          )}
        </section>
      </SecondaryNavbar>

      {libraryIsEmpty ? (
        <div className="page-content">
          <EmptyState
            icon={IconFolderBolt}
            title="Your library is empty"
            description="Choose a folder on your computer that holds photos or videos. Photokin shows them here without moving or changing your files."
            action={
              <Button onClick={() => setIsAddAlbumsModalOpen(true)}>
                <IconPlus size={16} />
                Add Photos
              </Button>
            }
          />
        </div>
      ) : (
        <div className="page-content">
          <SecondaryTitleAndScrollableContent
            cover={heroCover}
            title={heroTitle}
            // Where it lives on disk stays one hover away for experts.
            breadcrumbTitle={activeAlbumView === 'selectedAlbums' ? selectedAlbum?.fullPath : undefined}
            subtitle={[
              `${totalCount.toLocaleString()} ${totalCount === 1 ? 'photo' : 'photos'}`,
              activeAlbumView === 'selectedAlbums' && selectedAlbums.length > 1
                ? `${selectedAlbums.length} albums`
                : null,
              dateMeta,
            ]
              .filter(Boolean)
              .join(' · ')}
            actions={
              activeAlbumView === 'trash' ? (
                <Button
                  variant="outline"
                  className="text-destructive-text"
                  disabled={totalCount === 0}
                  title="Permanently delete everything in Trash"
                  onClick={() => void useTrashDialog.getState().request('empty', [])}
                >
                  <IconTrash size={16} />
                  Empty trash
                </Button>
              ) : activeAlbumView === 'selectedAlbums' ? (
                // Every album verb acts on the clicked album's subtree, which is
                // exactly what a multi-album selection is, so both cases share
                // one album-scoped menu.
                selectedAlbum && <AlbumHeaderActions album={selectedAlbum} />
              ) : (
                // Library views (All Photos / Favorites / Recently Added) are
                // filters over the same library, so they share its actions:
                // importing a root folder, and re-syncing everything.
                <>
                  <Button onClick={() => setIsAddAlbumsModalOpen(true)}>
                    <IconPlus size={16} />
                    Add Photos
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="outline"
                        title="Library actions"
                        aria-label="Library actions"
                      >
                        <IconDots size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setShowHiddenItems(!showHiddenItems)}>
                        {showHiddenItems ? (
                          <IconEyeOff size={16} className="text-muted-foreground" />
                        ) : (
                          <IconEye size={16} className="text-muted-foreground" />
                        )}
                        {showHiddenItems ? 'Hide hidden items' : 'Show hidden items'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={handleRefreshAlbums}>
                        <IconRestore size={16} className="text-muted-foreground" />
                        Sync &amp; re-index
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )
            }
            filters={
              chips.length > 0 ? (
                <FilterChipRow
                  key={viewKey}
                  chips={chips}
                  activeChipIds={activeChipIds}
                  onToggle={toggleChip}
                  disabled={chipsRefreshing}
                />
              ) : chipsLoading ? (
                <FilterChipPlaceholders />
              ) : undefined
            }
            subHeaderActions={
              activeAlbumView === 'selectedAlbums' && selectedEntry && selectedEntry.children.length > 0 ? (
                <HeroToggle
                  label="Include sub-albums"
                  checked={selectChildMode}
                  onCheckedChange={setSelectChildMode}
                  icon={<IconHierarchy size={15} />}
                />
              ) : undefined
            }
            galleryLayout
            content={
              <TimelineGallery
                key={viewKey}
                searchQuery={galleryQuery}
                dateField={activeAlbumView === 'recentlyAdded' ? 'dateAdded' : 'date'}
                onNoResults={
                  activeChipIds.length > 0 ? (
                    <ChipFiltersEmptyState onClear={clearChips} />
                  ) : activeAlbumView === 'trash' ? (
                    <EmptyState
                      icon={IconTrash}
                      title="Trash is empty"
                      description="Photos and videos you delete wait here for 30 days, so you can restore them if you change your mind."
                    />
                  ) : activeAlbumView === 'favorites' && !hasLibraryFilters ? (
                    ratingMode === RatingMode.Favorites ? (
                      <EmptyState
                        icon={IconHeart}
                        title="No favorites yet"
                        description="Select photos and press F, or click the heart, to keep your best shots here."
                      />
                    ) : (
                      <EmptyState
                        icon={IconStar}
                        title="No 5-star photos yet"
                        description="Photos rated 5 stars show up here. Select photos and press F to rate them."
                      />
                    )
                  ) : undefined
                }
              />
            }
          ></SecondaryTitleAndScrollableContent>
        </div>
      )}

      <AddAlbumsModal open={isAddAlbumsModalOpen} onOpenChange={setIsAddAlbumsModalOpen} />
      <MoveAlbumDialog
        open={moveProposal !== null}
        onOpenChange={(open) => {
          if (!open) setMoveProposal(null);
        }}
        source={movedAlbum}
        target={targetAlbum}
        error={albumMoveError}
      />
    </div>
  );
}
