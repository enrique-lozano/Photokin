import { TagsService } from '@/db/api/services/tags.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { TagInClient } from '@/db/models/TagDTO';
import { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllTags } from './AllTags';
import { TagDetail } from './TagDetail';
import { TagsLayout, useTagsOutletContext } from './tags';

const state = vi.hoisted(() => ({
  tags: null as TagInClient[] | null,
  counts: null as Record<string, number> | null,
}));

vi.mock('@/db/api/services/tags.service', () => ({
  TagsService: {
    getAll: vi.fn(async () => state.tags),
    getDirectAssetCounts: vi.fn(async () => state.counts),
    getTagCovers: vi.fn(async () => ({})),
    getUnusedTagIds: vi.fn(async () => []),
    getAssetCount: vi.fn(async () => 42),
  },
  getTagMoveError: vi.fn(),
}));
vi.mock('@/db/api/services/assets.service', () => ({
  AssetsService: { getDateRange: vi.fn(async () => null) },
}));
vi.mock('@/db/connection/useLiveQuery', () => ({
  useLiveQuery: vi.fn((query: () => Promise<unknown>, tables: string[]) => {
    void query();
    const data =
      tables.length === 1
        ? state.tags
        : tables.length === 2
          ? state.counts
          : tables.includes('albums')
            ? {}
            : tables.includes('tags')
              ? []
              : null;
    return { data, loading: data === null };
  }),
}));
vi.mock('@/stores/appState', () => ({
  useAppStore: (selector: (store: unknown) => unknown) =>
    selector({ searchQuery: {}, setBreadcrumb: vi.fn() }),
}));
vi.mock('@/stores/sidebarStore', () => ({
  useSidebarStore: (selector: (store: unknown) => unknown) =>
    selector({
      tagTree: null,
      sort: { tags: 'name' },
      setTagTree: vi.fn(),
      setSort: vi.fn(),
      setLastRoute: vi.fn(),
    }),
}));
vi.mock('@/router', () => ({
  AppRoutes: { allTags: '/tags/all', tags: '/tags' },
  tagDetailPath: (id: string) => `/tags/view/${id}`,
}));
vi.mock('@/components/secondary-navbar/SecondaryNavbar', () => ({
  SecondaryNavbar: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
}));
vi.mock('@/components/page-content/usePageChrome', () => ({
  usePageChrome: vi.fn(),
  useCountStatus: vi.fn(),
}));
vi.mock('@/components/page-content/useContentFilterChips', () => ({
  useContentFilterChips: () => ({
    chips: [],
    activeChipIds: [],
    toggleChip: vi.fn(),
    conditions: [],
    isLoading: false,
  }),
}));
vi.mock('@/components/page-content/ImportStatus', () => ({ useImportStatus: () => null }));
vi.mock('@/components/timeline-gallery/TimelineGallery', () => ({ TimelineGallery: () => null }));
vi.mock('../search/SecondaryTitleAndScrollableContent', () => ({
  SecondaryTitleAndScrollableContent: ({ content }: { content: ReactNode }) => <main>{content}</main>,
}));
vi.mock('@/components/face-thumbnail/FaceThumbnail', () => ({ faceCropViewBox: vi.fn() }));
vi.mock('@/media/thumbnails/thumbnail', () => ({ resolveThumbnailPath: vi.fn() }));
vi.mock('@/system/diskManager', () => ({ pathToImageSrc: (path: string) => path }));
vi.mock('./TagFormDialog', () => ({ TagFormDialog: () => null }));
vi.mock('./DeleteTagsDialog', () => ({ DeleteTagsDialog: () => null }));
vi.mock('./MergeTagsDialog', () => ({ MergeTagsDialog: () => null }));
vi.mock('./MoveTagDialog', () => ({ MoveTagDialog: () => null }));
vi.mock('./tagActions', () => ({ buildTagActions: () => [], toggleTagFavorite: vi.fn() }));

function _ScopeProbe() {
  const { includeSubtags, tags, directCounts } = useTagsOutletContext();
  return <output>{`${includeSubtags}:${tags?.length}:${directCounts?.['tag-0']}`}</output>;
}

function _renderTags(path = '/tags/all') {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tags" element={<TagsLayout />}>
          <Route path="all" element={<AllTags />} />
          <Route path="view/:id" element={<TagDetail />} />
          <Route path="scope" element={<_ScopeProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Shared Tags catalog loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.tags = Array.from({ length: 148 }, (_, index) =>
      TagInClient.fromDB({
        id: `tag-${index}`,
        name: `Tag ${index}`,
        parentId: null,
        fullPath: `Tag ${index}`,
        depth: 0,
        rootId: `tag-${index}`,
      }),
    );
    state.counts = Object.fromEntries(state.tags.map((tag) => [tag.id, 42]));
  });

  it.each(['/tags/all', '/tags/view/tag-0'])('shares the catalog and counts at %s', (path) => {
    const markup = _renderTags(path);

    expect(TagsService.getAll).toHaveBeenCalledOnce();
    expect(TagsService.getDirectAssetCounts).toHaveBeenCalledOnce();
    if (path === '/tags/all') {
      expect(markup.match(/class="tag-card"/g)).toHaveLength(148);
      expect(markup).toContain('Tag 147');
      expect(markup).toContain('42');
    }
  });

  it('preserves the include-subtags scope alongside the shared query results', () => {
    expect(_renderTags('/tags/scope')).toContain('true:148:42');
  });

  it('does not show a completed empty state while the catalog is loading', () => {
    state.tags = null;
    state.counts = null;

    expect(_renderTags()).not.toContain('No tags yet');
    expect(TagsService.getAll).toHaveBeenCalledOnce();
    expect(TagsService.getDirectAssetCounts).toHaveBeenCalledOnce();
  });

  it('refreshes tag covers when a portrait, album path or visibility changes', () => {
    _renderTags();

    expect(useLiveQuery).toHaveBeenCalledWith(
      expect.any(Function),
      ['tags', 'fileTags', 'tagRegionInfo', 'assets', 'albums', 'rootAlbums'],
      { extDependencies: [false] },
    );
  });
});
