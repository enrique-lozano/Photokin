import { NoResultsIndicator } from '@/components/NoResultsIndicator';
import { faceCropViewBox } from '@/components/face-thumbnail/FaceThumbnail';
import { HeroIcon } from '@/components/page-content/HeroIcon';
import { useCountStatus, usePageChrome } from '@/components/page-content/usePageChrome';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TagCover as TagCoverData, TagsService } from '@/db/api/services/tags.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { TagInClient } from '@/db/models/TagDTO';
import { resolveThumbnailPath } from '@/media/thumbnails/thumbnail';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import { tagDetailPath } from '@/router';
import { pathToImageSrc } from '@/system/diskManager';
import {
  IconArrowsSort,
  IconChevronDown,
  IconDots,
  IconEdit,
  IconGitMerge,
  IconHash,
  IconHeart,
  IconHeartFilled,
  IconPhoto,
  IconPlus,
  IconStar,
  IconTags,
  IconTrash,
  IconTrashX,
} from '@tabler/icons-react';
import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../stores/appState';
import { useHiddenItemsStore } from '@/stores/hiddenItemsStore';
import { colorFromId } from '../../utils/colorFromId';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent';
import { DeleteTagsDialog } from './DeleteTagsDialog';
import { MergeTagsDialog } from './MergeTagsDialog';
import { TagFormDialog } from './TagFormDialog';
import './allTags.css';
import { toggleTagFavorite } from './tagActions';
import { useTagsOutletContext } from './tags';

type TagSort = 'name' | 'count';

const TAG_SORT_LABELS: Record<TagSort, string> = {
  name: 'Alphabetical',
  count: 'Number of items',
};

/** Top-right pill that toggles between alphabetical and item-count ordering. */
function TagSortChip({ value, onChange }: { value: TagSort; onChange: (value: TagSort) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" title="Sort tags" aria-label="Sort tags">
          <IconArrowsSort size={16} />
          <span>{TAG_SORT_LABELS[value]}</span>
          <IconChevronDown size={16} className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as TagSort)}>
          <DropdownMenuRadioItem value="name">Alphabetical</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="count">Number of items</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A format-agnostic gradient used as a default cover for every tag card. */
function thumbStyle(color: string): CSSProperties {
  return {
    background: `linear-gradient(150deg, rgba(255, 255, 255, 0.16), rgba(0, 0, 0, 0.34)), ${color}`,
  };
}

interface TagCardActions {
  onEdit: (tag: TagInClient) => void;
  onDelete: (tag: TagInClient) => void;
  onToggleFavorite: (tag: TagInClient) => void;
}

/** Resolves (generating if needed) the thumbnail for a tag's representative asset. */
function TagCoverImage({ cover }: { cover: TagCoverData }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveSource() {
      const thumbnailPath = await resolveThumbnailPath(
        { id: cover.assetId, fullPath: cover.path },
        ThumbnailSize.DEFAULT,
      );
      if (cancelled) return;
      setSrc(pathToImageSrc(thumbnailPath ?? cover.path));
    }

    void resolveSource();

    return () => {
      cancelled = true;
    };
  }, [cover.assetId, cover.path]);

  if (!src) return null;

  return (
    <img
      className="tag-cover__img"
      src={src}
      alt=""
      style={cover.region ? faceCropViewBox(cover.region) : undefined}
    />
  );
}

function TagCover({ color, childCount, cover }: { color: string; childCount: number; cover?: TagCoverData }) {
  return (
    <span className="tag-cover" style={thumbStyle(color)}>
      {cover ? (
        <TagCoverImage cover={cover} />
      ) : (
        <IconPhoto className="tag-cover__placeholder" size={26} strokeWidth={1.5} />
      )}
      {childCount > 0 && <span className="tag-cover__sub-badge">{childCount} sub</span>}
    </span>
  );
}

/** Shared "tag actions" dropdown (favorite / edit / delete) used by every card. */
function TagActionsMenu({
  tag,
  actions,
  className,
}: {
  tag: TagInClient;
  actions: TagCardActions;
  className: string;
}) {
  const isFavorite = tag.isFavorite === 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={className} title="Tag actions" aria-label="Tag actions">
          <IconDots size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => actions.onToggleFavorite(tag)}>
          {isFavorite ? (
            <IconHeartFilled size={16} className="text-muted-foreground" />
          ) : (
            <IconHeart size={16} className="text-muted-foreground" />
          )}
          {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onEdit(tag)}>
          <IconEdit size={16} className="text-muted-foreground" />
          Edit tag
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive-text focus:text-destructive-text"
          onSelect={() => actions.onDelete(tag)}
        >
          <IconTrash size={16} />
          Delete tag
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FeaturedTagCard({
  tag,
  count,
  childCount,
  cover,
  actions,
}: {
  tag: TagInClient;
  count: number;
  childCount: number;
  cover?: TagCoverData;
  actions: TagCardActions;
}) {
  const navigate = useNavigate();
  const color = tag.color ?? colorFromId(tag.rootId);

  return (
    <div className="tag-feature-card">
      <button className="tag-feature-card__main" onClick={() => navigate(tagDetailPath(tag.id))}>
        <TagCover color={color} childCount={childCount} cover={cover} />
        <span className="tag-feature-card__name" title={tag.fullPath}>
          <span className="tag-card__dot" style={{ background: color }} />
          {tag.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {count.toLocaleString()} {count === 1 ? 'photo' : 'photos'}
          {childCount > 0 && ` · ${childCount} sub-${childCount === 1 ? 'tag' : 'tags'}`}
        </span>
      </button>

      <TagActionsMenu tag={tag} actions={actions} className="tag-card__menu-trigger" />
    </div>
  );
}

function TagCard({
  tag,
  count,
  childCount,
  parentName,
  cover,
  actions,
}: {
  tag: TagInClient;
  count: number;
  childCount: number;
  parentName: string | null;
  cover?: TagCoverData;
  actions: TagCardActions;
}) {
  const navigate = useNavigate();
  const color = tag.color ?? colorFromId(tag.rootId);

  return (
    <div className="tag-card">
      {/* Name and count live inside the button: the whole card lifts on hover,
          so all of it has to be clickable. */}
      <button className="tag-card__main" onClick={() => navigate(tagDetailPath(tag.id))}>
        <TagCover color={color} childCount={childCount} cover={cover} />

        <span className="tag-card__info">
          <span className="tag-card__name" title={tag.fullPath}>
            <span className="tag-card__dot" style={{ background: color }} />
            {tag.name}
          </span>
          <span className="tag-card__count">
            {count.toLocaleString()}
            {parentName ? ` · in ${parentName}` : ''}
          </span>
        </span>
      </button>

      <TagActionsMenu tag={tag} actions={actions} className="tag-card__menu-trigger" />
    </div>
  );
}

/**
 * "All Tags" overview: favorited tags surface as larger cards at the top, a row
 * of bulk actions (merge / clean up) sits below them, and the full collection
 * is shown as a grid of cards with a per-card actions menu on hover.
 */
export function AllTags() {
  const { tags, directCounts: counts } = useTagsOutletContext();
  const showHiddenItems = useHiddenItemsStore((state) => state.showHiddenItems);
  const { data: covers } = useLiveQuery(
    () => TagsService.getTagCovers(),
    ['tags', 'fileTags', 'tagRegionInfo', 'assets', 'albums', 'rootAlbums'],
    { extDependencies: [showHiddenItems] },
  );
  const { data: unusedTagIds } = useLiveQuery(
    () => TagsService.getUnusedTagIds(),
    ['tags', 'fileTags', 'tagRegionInfo'],
  );
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);
  const [sort, setSort] = useState<TagSort>('name');

  const [formOpen, setFormOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagInClient | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<TagInClient | null>(null);
  const [cleanUnusedOpen, setCleanUnusedOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  useEffect(() => {
    setBreadcrumb([{ label: 'Tags' }]);
    return () => setBreadcrumb([]);
  }, [setBreadcrumb]);

  const countById = counts ?? {};
  const coverById = covers ?? {};

  const allTags = useMemo(() => tags ?? [], [tags]);

  usePageChrome('entities', useCountStatus(tags?.length, 'tag', 'tags'));

  const childCountById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tag of allTags) {
      if (tag.parentId) map[tag.parentId] = (map[tag.parentId] ?? 0) + 1;
    }
    return map;
  }, [allTags]);

  const parentNameById = useMemo(() => {
    const names: Record<string, string> = {};
    for (const tag of allTags) names[tag.id] = tag.name;
    return names;
  }, [allTags]);

  const visibleTags = useMemo(() => {
    return [...allTags].sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : (countById[b.id] ?? 0) - (countById[a.id] ?? 0) || a.name.localeCompare(b.name),
    );
  }, [allTags, sort, countById]);

  const favoriteTags = useMemo(() => visibleTags.filter((tag) => tag.isFavorite === 1), [visibleTags]);

  // Mirror the "delete unused tags" dialog exactly: a tag is unused only when
  // neither it nor any of its descendants are applied to an asset. Using the
  // same source (`getUnusedTagIds`) keeps the banner and the dialog in sync.
  const unusedCount = unusedTagIds?.length ?? 0;

  const openCreateDialog = () => {
    setEditingTag(null);
    setFormOpen(true);
  };

  const cardActions: TagCardActions = {
    onEdit: (tag) => {
      setEditingTag(tag);
      setFormOpen(true);
    },
    onDelete: (tag) => {
      setTagToDelete(tag);
      setDeleteOpen(true);
    },
    onToggleFavorite: toggleTagFavorite,
  };

  // Only once `tags` answered: an empty list while loading isn't "no tags".
  const content =
    tags !== null && visibleTags.length === 0 ? (
      <NoResultsIndicator
        icon={<IconHash size={56} strokeWidth={1.4} />}
        title="No tags yet"
        description="Tags found in your photos' metadata will appear here."
        pendingImport="metadata"
      />
    ) : (
      <div className="overview-body">
        <section className="overview-section">
          <div className="overview-section__header">
            <h3 className="overview-section__title">
              Favorites
              {favoriteTags.length > 0 && (
                <span className="overview-section__count">{favoriteTags.length.toLocaleString()}</span>
              )}
            </h3>
          </div>
          {favoriteTags.length > 0 ? (
            <div className="tag-feature-grid">
              {favoriteTags.map((tag) => (
                <FeaturedTagCard
                  key={tag.id}
                  tag={tag}
                  count={countById[tag.id] ?? 0}
                  childCount={childCountById[tag.id] ?? 0}
                  cover={coverById[tag.id]}
                  actions={cardActions}
                />
              ))}
            </div>
          ) : (
            <div className="tag-favorites-empty">
              <span className="tag-favorites-empty__icon">
                <IconStar size={22} strokeWidth={1.6} />
              </span>
              <div className="tag-favorites-empty__text">
                <p className="text-sm font-semibold text-foreground">No favorite tags yet</p>
                <p className="text-xs text-muted-foreground">
                  Open a tag&apos;s menu and choose “Add to favorites” to pin it here for quick access.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="overview-section">
          <div className="tag-actions-row">
            <button className="tag-action-card" onClick={() => setMergeOpen(true)}>
              <span className="tag-action-card__icon">
                <IconGitMerge size={20} />
              </span>
              <span className="tag-action-card__body">
                <span className="text-sm font-semibold text-foreground">Merge tags</span>
                <span className="text-xs text-muted-foreground">
                  Combine duplicate or similar tags into one.
                </span>
              </span>
            </button>

            <button
              className="tag-action-card"
              onClick={() => setCleanUnusedOpen(true)}
              disabled={unusedCount === 0}
            >
              <span className="tag-action-card__icon">
                <IconTrashX size={20} />
              </span>
              <span className="tag-action-card__body">
                <span className="text-sm font-semibold text-foreground">Remove unused tags</span>
                <span className="text-xs text-muted-foreground">
                  {unusedCount === 0
                    ? 'No unused tags right now.'
                    : `${unusedCount.toLocaleString()} tag${unusedCount === 1 ? '' : 's'} not applied to any photo.`}
                </span>
              </span>
            </button>
          </div>
        </section>

        <section className="overview-section">
          <div className="overview-section__header">
            <h3 className="overview-section__title">
              All tags
              <span className="overview-section__count">{visibleTags.length.toLocaleString()}</span>
            </h3>
            <TagSortChip value={sort} onChange={setSort} />
          </div>
          <div className="tag-grid">
            {visibleTags.map((tag) => (
              <TagCard
                key={tag.id}
                tag={tag}
                count={countById[tag.id] ?? 0}
                childCount={childCountById[tag.id] ?? 0}
                parentName={tag.parentId ? (parentNameById[tag.parentId] ?? null) : null}
                cover={coverById[tag.id]}
                actions={cardActions}
              />
            ))}
          </div>
        </section>
      </div>
    );

  return (
    <>
      <SecondaryTitleAndScrollableContent
        cover={<HeroIcon icon={<IconTags size={28} />} />}
        title="Tags"
        subtitle={`${allTags.length.toLocaleString()} tags · ${unusedCount.toLocaleString()} unused`}
        actions={
          <div className="overview-header__actions">
            <Button onClick={openCreateDialog}>
              <IconPlus size={16} />
              New tag
            </Button>
          </div>
        }
        content={content}
      />

      <TagFormDialog open={formOpen} onOpenChange={setFormOpen} tag={editingTag} />
      <DeleteTagsDialog open={deleteOpen} onOpenChange={setDeleteOpen} mode="single" tag={tagToDelete} />
      <DeleteTagsDialog open={cleanUnusedOpen} onOpenChange={setCleanUnusedOpen} mode="unused" />
      <MergeTagsDialog open={mergeOpen} onOpenChange={setMergeOpen} tags={allTags} countById={countById} />
    </>
  );
}
