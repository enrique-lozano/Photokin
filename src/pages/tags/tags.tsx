import { IconTags } from '@tabler/icons-react';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { SecondaryNavbar } from '../../components/secondary-navbar/SecondaryNavbar';
import { formatSidebarFilterCount } from '../../components/secondary-navbar/sidebarFilterCount';
import { SidebarSearchInput } from '../../components/secondary-navbar/SidebarSearchInput';
import { SidebarSortMenu, SidebarSortOption } from '../../components/secondary-navbar/SidebarSortMenu';
import { countTreeNameMatches } from '../../components/tree/filterTreeItems';
import { Tree } from '../../components/tree/Tree';
import { AppRoutes, tagDetailPath } from '@/router';
import { TagsSort, useSidebarStore } from '../../stores/sidebarStore.ts';
import { mapTagsToTreeItems } from './mapTags';

import { EntityContextMenuContent } from '@/components/entity-actions/EntityActionItems';
import { type GalleryScope, GalleryScopeProvider } from '@/components/selection-actions/galleryScope';
import {
  applyRecursiveFn,
  sortTreeEntries,
  updateSelectedState,
} from '../../components/tree/TreeEntry.utils';
import { getTagMoveError, TagsService } from '../../db/api/services/tags.service.ts';
import { useLiveQuery } from '../../db/connection/useLiveQuery.tsx';
import { TagInClient } from '../../db/models/TagDTO';
import { useTreeSelectorMenu } from '../useTreeSelectorMenu';
import { DeleteTagsDialog } from './DeleteTagsDialog';
import { MergeTagsDialog } from './MergeTagsDialog';
import { MoveTagDialog } from './MoveTagDialog';
import { TagFormDialog } from './TagFormDialog';
import { buildTagActions, toggleTagFavorite } from './tagActions';
import './tags.css';

const TAGS_SORT_OPTIONS: SidebarSortOption<TagsSort>[] = [
  { value: 'name', label: 'Name' },
  { value: 'photos', label: 'Most photos' },
];

/**
 * Shared with the tag detail route through the `Outlet`. The "Include subtags"
 * scope is owned by the layout because it lives in the sidebar tree selection.
 */
export interface TagsOutletContext {
  tags: TagInClient[] | null;
  directCounts: Record<string, number> | null;
  includeSubtags: boolean;
  setIncludeSubtags: (value: boolean) => void;
}

export function useTagsOutletContext(): TagsOutletContext {
  return useOutletContext<TagsOutletContext>();
}

// `/tags` index → last tags sub-route (avoids flashing through All Tags).
export function TagsIndexRedirect() {
  const lastTagsRoute = useSidebarStore((state) => state.lastRoute.tags);
  const target = lastTagsRoute?.startsWith('/tags/') ? lastTagsRoute : AppRoutes.allTags;

  return <Navigate to={target} replace />;
}

export function TagsLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: tags } = useLiveQuery(() => TagsService.getAll(), ['tags']);
  const { data: directCounts } = useLiveQuery(
    () => TagsService.getDirectAssetCounts(),
    ['fileTags', 'tagRegionInfo'],
  );
  const tagTree = useSidebarStore((state) => state.tagTree);
  const setTagTree = useSidebarStore((state) => state.setTagTree);
  const setLastRoute = useSidebarStore((state) => state.setLastRoute);
  const sort = useSidebarStore((state) => state.sort.tags);
  const setSort = useSidebarStore((state) => state.setSort);

  const { preparedTreeData, searchFilter, setSearchFilter, selectChildMode, setSelectChildMode } =
    useTreeSelectorMenu(tagTree, setTagTree, {
      onEntrySelect: (entry) => navigate(tagDetailPath(entry.id)),
      // Tags have always shown subtag photos by default.
      initialSelectChildMode: true,
    });

  const [formOpen, setFormOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagInClient | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<TagInClient | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [tagToMerge, setTagToMerge] = useState<TagInClient | null>(null);
  const [moveProposal, setMoveProposal] = useState<{
    sourceId: string;
    targetId: string | null;
  } | null>(null);

  const openEditDialog = (tag: TagInClient) => {
    setEditingTag(tag);
    setFormOpen(true);
  };

  const openDeleteDialog = (tag: TagInClient) => {
    setTagToDelete(tag);
    setDeleteOpen(true);
  };

  const openMergeDialog = (tag: TagInClient) => {
    setTagToMerge(tag);
    setMergeOpen(true);
  };

  const routeTagId = pathname.match(/^\/tags\/view\/(.+)$/)?.[1] ?? null;
  const isAllActive = pathname === AppRoutes.allTags || pathname === AppRoutes.tags;

  useEffect(() => {
    if (pathname === '/tags') return;
    const isGone = routeTagId !== null && tags !== null && !tags.some((tag) => tag.id === routeTagId);
    setLastRoute('tags', isGone ? AppRoutes.allTags : pathname);
  }, [pathname, routeTagId, tags, setLastRoute]);

  useEffect(() => {
    const initiallyOpenedIDs: string[] = [];
    const initiallySelectedIDs: string[] = [];

    if (tagTree) {
      applyRecursiveFn(tagTree, (entry) => {
        if (entry.open) initiallyOpenedIDs.push(entry.id);
      });
    }

    if (routeTagId) {
      initiallySelectedIDs.push(routeTagId);
    }

    if (!tags) return;

    const mapped = mapTagsToTreeItems(tags, {
      initiallyOpenedIDs,
      initiallySelectedIDs,
      renderPopover: (tag) => {
        const fullTag = tags.find((x) => x.id === tag.id);
        if (!fullTag) return null;

        return (
          <EntityContextMenuContent
            label={fullTag.fullPath}
            actions={buildTagActions(fullTag, {
              onRename: openEditDialog,
              onMerge: openMergeDialog,
              onToggleFavorite: toggleTagFavorite,
              onDelete: openDeleteDialog,
            })}
          />
        );
      },
    });

    const counts = directCounts ?? {};
    sortTreeEntries(mapped, (a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || a.name.localeCompare(b.name),
    );

    // Mirror the route into the tree selection, widened to the whole subtree
    // while subtags are included. The selection is what makes the scope (and so
    // the "Include subtags" toggle) survive leaving the page and coming back.
    setTagTree(
      routeTagId ? updateSelectedState(mapped, routeTagId, { isRecursive: selectChildMode }) : mapped,
    );
  }, [tags, sort, directCounts, routeTagId, selectChildMode, setTagTree]);

  const clearTreeSelection = () => {
    if (!tagTree) return;
    setTagTree(
      applyRecursiveFn(tagTree, (entry) => {
        entry.selected = false;
      }),
    );
  };

  const sidebarScrollWatch = `${routeTagId ?? 'all'}-${preparedTreeData?.length ?? 0}`;
  const matchedTagCount = useMemo(() => {
    if (!searchFilter || !preparedTreeData) return null;
    return countTreeNameMatches(preparedTreeData, searchFilter);
  }, [preparedTreeData, searchFilter]);
  const routeTag = tags?.find((tag) => tag.id === routeTagId);
  // Lets the photo menus on a tag's page offer removing that tag.
  const galleryScope = useMemo<GalleryScope | null>(
    () => (routeTag ? { kind: 'tag', tagId: routeTag.id, tagName: routeTag.name } : null),
    [routeTag],
  );
  const movedTag = tags?.find((tag) => tag.id === moveProposal?.sourceId) ?? null;
  const targetTag = tags?.find((tag) => tag.id === moveProposal?.targetId) ?? null;
  const tagMoveError =
    tags && moveProposal ? getTagMoveError(tags, moveProposal.sourceId, moveProposal.targetId) : null;

  return (
    <div className="tags-page">
      <div>
        <SecondaryNavbar title="Tags" scrollWatch={sidebarScrollWatch} scrollToItemId={routeTagId}>
          {/* Index row. Create/cleanup verbs live in the All Tags page header, not here. */}
          <nav className="sidebar-nav">
            <button
              className={clsx('sidebar-nav-item', isAllActive && 'selected')}
              onClick={() => {
                clearTreeSelection();
                navigate(AppRoutes.allTags);
              }}
            >
              <span className="sidebar-nav-item__icon">
                <IconTags size={18} />
              </span>
              <span className="sidebar-nav-item__label">All Tags</span>
            </button>
          </nav>

          <div className="sidebar-zone-divider" />

          {/* Filter opens the items zone; the title below carries the total count
              on the left and the sort on the right. While filtering, the count
              is the matches over that same total. */}
          <SidebarSearchInput
            placeholder="Filter tags"
            value={searchFilter ?? ''}
            onValueChange={setSearchFilter}
          />
          <p className="sidebar-section-label">
            <span
              className={clsx(
                'sidebar-section-label__count',
                tags && matchedTagCount !== null && 'sidebar-section-label__count--filtered',
              )}
            >
              {formatSidebarFilterCount(tags?.length ?? 0, tags ? matchedTagCount : null)}
            </span>
            <span>Tags</span>
            <SidebarSortMenu
              value={sort}
              options={TAGS_SORT_OPTIONS}
              onChange={(value) => setSort('tags', value)}
              ariaLabel="Sort tags"
            />
          </p>

          <section className="tree-container">
            {preparedTreeData && (
              <Tree
                filter={searchFilter}
                entries={preparedTreeData}
                dragDrop={{
                  canDrag: (entryId) => Boolean(tags?.some((tag) => tag.id === entryId)),
                  // Validation belongs in the confirmation modal so invalid
                  // moves explain themselves instead of showing only a blocked cursor.
                  canDrop: (sourceId, targetId) =>
                    Boolean(
                      tags?.some((tag) => tag.id === sourceId) &&
                      (!targetId || tags?.some((tag) => tag.id === targetId)),
                    ),
                  onDrop: (sourceId, targetId) => setMoveProposal({ sourceId, targetId }),
                }}
              />
            )}
          </section>
        </SecondaryNavbar>

        <div className="page-content">
          <GalleryScopeProvider value={galleryScope}>
            <Outlet
              context={
                {
                  tags,
                  directCounts,
                  includeSubtags: selectChildMode,
                  setIncludeSubtags: setSelectChildMode,
                } satisfies TagsOutletContext
              }
            />
          </GalleryScopeProvider>
        </div>
      </div>

      <TagFormDialog open={formOpen} onOpenChange={setFormOpen} tag={editingTag} />
      <DeleteTagsDialog open={deleteOpen} onOpenChange={setDeleteOpen} mode="single" tag={tagToDelete} />
      <MergeTagsDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        tags={tags ?? []}
        countById={directCounts ?? {}}
        lockedTagId={tagToMerge?.id}
      />
      <MoveTagDialog
        open={moveProposal !== null}
        onOpenChange={(open) => {
          if (!open) setMoveProposal(null);
        }}
        source={movedTag}
        target={targetTag}
        error={tagMoveError}
      />
    </div>
  );
}
