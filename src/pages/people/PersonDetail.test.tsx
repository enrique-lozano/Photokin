import { isValidElement, type PropsWithChildren, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineGallery } from '@/components/timeline-gallery/TimelineGallery';
import { PersonDetail } from './PersonDetail';
import { ProfilePhotoDialog } from './ProfilePhotoDialog';

const mocks = vi.hoisted(() => ({
  id: 'person',
  queryIndex: 0,
  content: null as ReactNode,
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: mocks.id }),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/router', () => ({ AppRoutes: { allFaces: '/people/all' } }));
vi.mock('@/stores/appState', () => ({
  useAppStore: (selector: (state: { searchQuery: []; setBreadcrumb: () => void }) => unknown) =>
    selector({ searchQuery: [], setBreadcrumb: vi.fn() }),
}));
vi.mock('@/db/connection/useLiveQuery', () => ({
  useLiveQuery: () => {
    const index = mocks.queryIndex++;
    return {
      data:
        index === 0
          ? [{ id: 'face', assetId: 'photo', tagId: mocks.id, confirmed: true }]
          : index === 1
            ? []
            : null,
    };
  },
}));
vi.mock('@/db/api/services/assets.service', () => ({ AssetsService: {} }));
vi.mock('@/db/api/services/regions.service', () => ({ RegionsService: {} }));
vi.mock('@/db/api/services/tags.service', () => ({ TagsService: {} }));
vi.mock('./PeopleLayout', () => ({
  usePeopleOutletContext: () => ({
    people: [{ id: mocks.id, displayName: 'Person', tag: { id: mocks.id, name: 'Person' } }],
  }),
}));
vi.mock('@/components/page-content/useContentFilterChips', () => ({
  useContentFilterChips: () => ({ chips: [], activeChipIds: [], conditions: [] }),
}));
vi.mock('@/components/page-content/usePageChrome', () => ({
  useCountStatus: vi.fn(),
  usePageChrome: vi.fn(),
}));
vi.mock('@/components/ui/empty-state', () => ({ EmptyState: () => null }));
vi.mock('@/components/page-content/FilterChipRow', () => ({
  FilterChipRow: () => null,
  FilterChipPlaceholders: () => null,
}));
vi.mock('@/components/selection-actions/galleryScope', () => ({
  GalleryScopeProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('../search/SecondaryTitleAndScrollableContent', () => ({
  SecondaryTitleAndScrollableContent: ({ content }: { content: ReactNode }) => {
    mocks.content = content;
    return <main>{content}</main>;
  },
}));
vi.mock('@/components/timeline-gallery/TimelineGallery', () => ({
  TimelineGallery: () => <div id="grid" />,
}));
vi.mock('@/components/face-thumbnail/FaceThumbnail', () => ({ FaceThumbnail: () => null }));
vi.mock('@/components/entity-actions/HeaderActionsBar', () => ({
  HeaderActionsBar: () => null,
  EntityOverflowMenu: () => null,
}));
vi.mock('./DeletePersonDialog', () => ({ DeletePersonDialog: () => null }));
vi.mock('./PersonEditDialog', () => ({ PersonEditDialog: () => null }));
vi.mock('./PersonFacesGrid', () => ({ PersonFacesGrid: () => null }));
vi.mock('./PersonAbout', () => ({ PersonAbout: () => null }));
vi.mock('./ProfilePhotoDialog', () => ({ ProfilePhotoDialog: () => null }));
vi.mock('./SuggestionBanner', () => ({ SuggestionBanner: () => null }));
vi.mock('./SuggestionsReviewModal', () => ({ SuggestionsReviewModal: () => null }));
vi.mock('./profilePhoto', () => ({ changeProfilePhoto: vi.fn() }));
vi.mock('./personActions', () => ({ buildPersonActions: () => [] }));
vi.mock('./discardFaces', () => ({ discardFacesWithUndo: vi.fn() }));
vi.mock('./FaceIssues', () => ({ removableDuplicateIds: () => [] }));
vi.mock('./peopleOptions', () => ({
  useAssignPersonOptions: () => [],
  useFaceAssignmentTags: () => [],
}));
vi.mock('./faceMutations', () => ({
  assignFacesWithUndo: vi.fn(),
  confirmFaces: vi.fn(),
  confirmFacesWithUndo: vi.fn(),
  createPersonFromFacesWithUndo: vi.fn(),
  discardFaces: vi.fn(),
  dismissSuggestions: vi.fn(),
  hideFaces: vi.fn(),
  hideFacesWithUndo: vi.fn(),
}));
vi.mock('./personViewMode', () => ({
  getPersonViewMode: () => 'gallery',
  setPersonViewMode: vi.fn(),
}));

beforeEach(() => {
  mocks.queryIndex = 0;
  mocks.content = null;
});

describe('person detail gallery identity', () => {
  it.each(['first-person', 'second-person'])(
    'does not give the gallery and profile dialog colliding sibling keys for %s',
    (id) => {
      mocks.id = id;
      const markup = renderToStaticMarkup(<PersonDetail />);
      expect(markup.match(/id="grid"/g)).toHaveLength(1);

      if (!isValidElement<{ children: ReactNode[] }>(mocks.content)) {
        throw new Error('Expected the person detail content fragment');
      }
      const siblings = mocks.content.props.children.filter(isValidElement);
      const keys = siblings.map((child) => child.key).filter((key) => key !== null);
      expect(new Set(keys).size).toBe(keys.length);
      expect(siblings.find((child) => child.type === TimelineGallery)?.key).toBeNull();
      expect(siblings.find((child) => child.type === ProfilePhotoDialog)?.key).toBeNull();
    },
  );
});
