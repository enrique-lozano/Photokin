import { NoResultsIndicator } from '@/components/NoResultsIndicator';
import { usePageChrome } from '@/components/page-content/usePageChrome';
import { FilterChipPlaceholders, FilterChipRow } from '@/components/page-content/FilterChipRow';
import { HeroIcon } from '@/components/page-content/HeroIcon';
import { HeroToggle } from '@/components/page-content/HeroToggle';
import { useContentFilterChips } from '@/components/page-content/useContentFilterChips';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent';
import { TimelineGallery } from '@/components/timeline-gallery/TimelineGallery';
import { Button } from '@/components/ui/button';
import { EntityOverflowMenu, HeaderActionsBar } from '@/components/entity-actions/HeaderActionsBar';
import { AssetsService } from '@/db/api/services/assets.service';
import { TagsService } from '@/db/api/services/tags.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { IconArrowLeft, IconHash, IconHierarchy, IconMoodEmpty } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppRoutes, tagDetailPath } from '@/router';
import { mergeSearchQueries } from '../../common/searchQueryUtils';
import { colorFromId } from '../../utils/colorFromId';
import { formatDate } from '../../utils/dateFormatter';
import { useAppStore } from '../../stores/appState';
import { DeleteTagsDialog } from './DeleteTagsDialog';
import { MergeTagsDialog } from './MergeTagsDialog';
import { TagFormDialog } from './TagFormDialog';
import { buildTagActions, toggleTagFavorite } from './tagActions';
import { useTagsOutletContext } from './tags';

/** Per-tag detail page: hero + temporal filters + the tag's timeline. */
export function TagDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const searchQuery = useAppStore((state) => state.searchQuery);
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);
  // Owned by the tags layout (sidebar tree selection), so it survives navigation.
  const { tags, directCounts, includeSubtags, setIncludeSubtags } = useTagsOutletContext();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const tag = useMemo(() => (tags ?? []).find((item) => item.id === id), [tags, id]);

  // All descendant tags of the current tag, resolved from the flat tag list.
  const descendantTags = useMemo(() => {
    if (!tag || !tags) return [];

    const childrenByParent = new Map<string, typeof tags>();
    for (const item of tags) {
      if (!item.parentId) continue;
      const siblings = childrenByParent.get(item.parentId) ?? [];
      siblings.push(item);
      childrenByParent.set(item.parentId, siblings);
    }

    const descendants: typeof tags = [];
    const stack = [...(childrenByParent.get(tag.id) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop()!;
      descendants.push(current);
      const children = childrenByParent.get(current.id);
      if (children) stack.push(...children);
    }

    return descendants;
  }, [tag, tags]);

  const tagScopedQuery = useMemo(
    () =>
      tag
        ? mergeSearchQueries(searchQuery, [
            {
              filters: [
                {
                  filterCriteria: FilterCriteria.tag,
                  operator: 'contains',
                  value: includeSubtags ? [tag, ...descendantTags] : [tag],
                },
              ],
            },
          ])
        : searchQuery,
    [searchQuery, tag, includeSubtags, descendantTags],
  );

  const { data: dateRange } = useLiveQuery(
    () => (tag ? AssetsService.getDateRange({ searchQuery: tagScopedQuery }) : Promise.resolve(null)),
    ['assets', 'fileTags', 'tagRegionInfo'],
    { extDependencies: [tagScopedQuery] },
  );

  const { data: assetCount } = useLiveQuery(
    () => (id ? TagsService.getAssetCount(id) : Promise.resolve(0)),
    ['fileTags', 'tagRegionInfo', 'tags'],
    { extDependencies: [id] },
  );

  const {
    chips,
    activeChipIds,
    toggleChip,
    conditions,
    isLoading: chipsLoading,
    isRefreshing: chipsRefreshing,
  } = useContentFilterChips({
    searchQuery: tagScopedQuery,
    resetKey: id,
  });

  // Walk up the `parentId` chain so the breadcrumb reflects the full nesting
  // (e.g. `Tags > Travel > Mexico`) rather than just the leaf tag.
  const ancestorChain = useMemo(() => {
    if (!tag || !tags) return [];

    const byId = new Map(tags.map((item) => [item.id, item]));
    const chain: typeof tags = [];
    let current: (typeof tags)[number] | undefined = tag;
    while (current) {
      chain.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return chain;
  }, [tag, tags]);

  useEffect(() => {
    if (ancestorChain.length === 0) {
      setBreadcrumb([{ label: 'Tags', to: AppRoutes.allTags }, { label: tag?.name ?? 'Tag' }]);
    } else {
      setBreadcrumb([
        { label: 'Tags', to: AppRoutes.allTags },
        ...ancestorChain.map((item) => ({ label: item.name, to: tagDetailPath(item.id) })),
      ]);
    }
    return () => setBreadcrumb([]);
  }, [setBreadcrumb, tag?.name, ancestorChain]);

  usePageChrome('photos');

  // A different tag is a fresh page — never carry an open dialog across.
  useEffect(() => {
    setIsEditOpen(false);
    setIsMergeOpen(false);
    setIsDeleteOpen(false);
  }, [id]);

  if (tags && !tag) {
    return (
      <div className="page-scroll">
        <NoResultsIndicator
          icon={<IconMoodEmpty size={56} strokeWidth={1.4} />}
          title="Tag not found"
          description="This tag may have been removed."
          extraContent={
            <Button variant="outline-primary" onClick={() => navigate(AppRoutes.allTags)}>
              <IconArrowLeft size={16} /> Back to tags
            </Button>
          }
        />
      </div>
    );
  }

  const galleryQuery = mergeSearchQueries(tagScopedQuery, conditions);

  const color = tag?.color ?? colorFromId(tag?.rootId ?? id);
  const count = assetCount ?? 0;
  const dateMeta =
    dateRange &&
    `${formatDate(new Date(dateRange.min), { year: 'numeric', month: 'short' })} – ${formatDate(
      new Date(dateRange.max),
      { year: 'numeric', month: 'short' },
    )}`;

  // Single source of truth for the tag's object verbs, shared with the sidebar
  // right-click menu (§2). Rename/Merge surface as buttons; favorite + delete
  // live in the ⋮, and the compact header collapses everything into the ⋮.
  const tagActions = tag
    ? buildTagActions(tag, {
        onRename: () => setIsEditOpen(true),
        onMerge: () => setIsMergeOpen(true),
        onToggleFavorite: toggleTagFavorite,
        onDelete: () => setIsDeleteOpen(true),
      })
    : [];

  const headerActions = tag ? <HeaderActionsBar actions={tagActions} menuLabel="Tag actions" /> : undefined;
  const compactActions = tag ? (
    <EntityOverflowMenu actions={tagActions} menuLabel="Tag actions" />
  ) : undefined;

  return (
    <SecondaryTitleAndScrollableContent
      cover={<HeroIcon icon={<IconHash size={28} />} color={color} />}
      title={tag?.name ?? 'Tag'}
      subtitle={[`${count.toLocaleString()} ${count === 1 ? 'photo' : 'photos'}`, dateMeta]
        .filter(Boolean)
        .join(' · ')}
      actions={headerActions}
      compactActions={compactActions}
      filters={
        chips.length > 0 ? (
          <FilterChipRow
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
        descendantTags.length > 0 ? (
          <HeroToggle
            label="Include subtags"
            checked={includeSubtags}
            onCheckedChange={setIncludeSubtags}
            icon={<IconHierarchy size={15} />}
          />
        ) : undefined
      }
      galleryLayout
      content={
        <>
          <TimelineGallery key={id} searchQuery={galleryQuery} />

          <TagFormDialog open={isEditOpen} onOpenChange={setIsEditOpen} tag={tag ?? null} />
          <MergeTagsDialog
            open={isMergeOpen}
            onOpenChange={setIsMergeOpen}
            tags={tags ?? []}
            countById={directCounts ?? {}}
            lockedTagId={tag?.id}
          />
          <DeleteTagsDialog
            open={isDeleteOpen}
            onOpenChange={setIsDeleteOpen}
            mode="single"
            tag={tag ?? null}
          />
        </>
      }
    />
  );
}
