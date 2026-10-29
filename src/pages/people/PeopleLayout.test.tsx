import { RegionsService } from '@/db/api/services/regions.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { PersonInfo } from '@/db/models/PersonInfo';
import { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllFaces } from './AllFaces';
import { PeopleLayout } from './PeopleLayout';

const state = vi.hoisted(() => ({
  people: [] as PersonInfo[],
  loading: false,
}));

vi.mock('@/db/api/services/regions.service', () => ({
  RegionsService: {
    getRegionTags: vi.fn(async () => state.people),
    getHiddenRegionCount: vi.fn(async () => 0),
    getFaceIssues: vi.fn(async () => []),
  },
}));
vi.mock('@/db/api/services/tags.service', () => ({ TagsService: {} }));
vi.mock('@/db/connection/useLiveQuery', () => ({
  useLiveQuery: vi.fn((query: () => Promise<unknown>, tables: string[]) => {
    void query();
    return {
      data: tables.includes('tags') ? state.people : tables.includes('assets') ? [] : 0,
      loading: state.loading,
    };
  }),
}));
vi.mock('@/stores/appState', () => ({
  useAppStore: (selector: (store: unknown) => unknown) =>
    selector({ galleryThumbnailSize: 200, setBreadcrumb: vi.fn() }),
}));
vi.mock('@/stores/hiddenItemsStore', () => ({
  useHiddenItemsStore: (selector: (store: unknown) => unknown) =>
    selector({ showHiddenItems: false, setShowHiddenItems: vi.fn() }),
}));
vi.mock('@/stores/sidebarStore', () => ({
  useSidebarStore: (selector: (store: unknown) => unknown) =>
    selector({ sort: { people: 'name' }, lastRoute: {}, setSort: vi.fn(), setLastRoute: vi.fn() }),
}));
vi.mock('@/router', () => ({
  AppRoutes: { allFaces: '/people/all', people: '/people' },
  personDetailPath: (id: string) => `/people/view/${id}`,
}));
vi.mock('@/components/face-thumbnail/FaceThumbnail', () => ({ FaceThumbnail: () => null }));
vi.mock('@/components/secondary-navbar/SecondaryNavbar', () => ({
  SecondaryNavbar: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
}));
vi.mock('@/components/page-content/usePageChrome', () => ({
  usePageChrome: vi.fn(),
  useCountStatus: vi.fn(),
}));
vi.mock('@/components/page-content/ImportStatus', () => ({ useImportStatus: () => null }));
vi.mock('../search/SecondaryTitleAndScrollableContent', () => ({
  SecondaryTitleAndScrollableContent: ({ content }: { content: ReactNode }) => <main>{content}</main>,
}));
vi.mock('./FaceActionsBar', () => ({ FaceActionsBar: () => null }));
vi.mock('./PersonEditDialog', () => ({ PersonEditDialog: () => null }));
vi.mock('./DeletePersonDialog', () => ({ DeletePersonDialog: () => null }));
vi.mock('../tags/MergeTagsDialog', () => ({ MergeTagsDialog: () => null }));
vi.mock('./personActions', () => ({ buildPersonActions: () => [] }));

function _renderPeople() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/people/all']}>
      <Routes>
        <Route path="/people" element={<PeopleLayout />}>
          <Route path="all" element={<AllFaces />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('People catalog loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.loading = false;
    state.people = Array.from({ length: 150 }, (_, index) => ({
      id: `person-${index}`,
      kind: 'known',
      displayName: `Person ${index}`,
      totalResults: index + 1,
      unconfirmedResults: 0,
      tag: undefined,
    }));
  });

  it('loads one catalog for both the sidebar and all 150 overview cards', () => {
    const markup = _renderPeople();

    expect(RegionsService.getRegionTags).toHaveBeenCalledOnce();
    expect(markup.match(/class="face-card"/g)).toHaveLength(150);
    expect(markup.match(/class="person-list-row/g)).toHaveLength(150);
    expect(markup).toContain('Person 149');
  });

  it('keeps both surfaces in their loading state until the shared query completes', () => {
    state.loading = true;
    const markup = _renderPeople();

    expect(RegionsService.getRegionTags).toHaveBeenCalledOnce();
    expect(markup).toContain('person-list-row--skeleton');
    expect(markup).toContain('face-card__name-skeleton');
    expect(markup).not.toContain('Person 149');
  });

  it('refreshes the shared catalog when album paths or visibility change', () => {
    _renderPeople();

    expect(useLiveQuery).toHaveBeenCalledWith(
      expect.any(Function),
      ['tags', 'tagRegionInfo', 'assets', 'albums', 'rootAlbums'],
      { extDependencies: [false] },
    );
  });
});
