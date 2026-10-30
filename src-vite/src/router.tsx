import { Navigate, createBrowserRouter } from 'react-router-dom';
import { EntityDetailRoute } from './components/page-content/EntityDetailRoute';
import { AlbumsPage } from './pages/albums/Albums';
import { CalendarPage } from './pages/calendar/Calendar';
import { ComponentsPage } from './pages/components/ComponentsPage';
import Dashboard from './pages/Dashboard';
import { DuplicatesPage } from './pages/duplicates/Duplicates';
import { EditorPage } from './pages/editor/EditorPage';
import { Onboarding } from './pages/onboarding/Onboarding';
import { AllFaces } from './pages/people/AllFaces';
import { FaceIssues } from './pages/people/FaceIssues';
import { HiddenFaces } from './pages/people/HiddenFaces';
import { PeopleIndexRedirect, PeopleLayout } from './pages/people/PeopleLayout';
import { PersonDetail } from './pages/people/PersonDetail';
import { SuggestedFaces } from './pages/people/SuggestedFaces';
import { UnidentifiedFaces } from './pages/people/UnidentifiedFaces';
import { PlacesPage } from './pages/places/Places';
import { ReviewSelection } from './pages/review-selection/ReviewSelection';
import { Search } from './pages/search/Search';
import { SettingsPage } from './pages/settings/SettingsPage';
import { SettingsModels } from './pages/settings/SettingsModels';
import { StatsPage } from './pages/stats/Stats';
import { AllTags } from './pages/tags/AllTags';
import { TagDetail } from './pages/tags/TagDetail';
import { TagsIndexRedirect, TagsLayout } from './pages/tags/tags';

export enum AppRoutes {
  home = '/',
  albums = '/albums',
  tags = '/tags',
  people = '/people',
  places = '/places',
  calendar = '/calendar',
  stats = '/stats',
  duplicates = '/duplicates',
  search = '/search',
  reviewSelection = '/review-selection',
  settings = '/settings',
  settingsModels = '/settings/smart-search/models',
  editor = '/editor',
  onboarding = '/onboarding',
  allFaces = '/people/all',
  peopleSuggested = '/people/suggested',
  peopleUnidentified = '/people/unidentified',
  peopleHidden = '/people/hidden',
  peopleIssues = '/people/issues',
  allTags = '/tags/all',
  components = '/components',
}

export function personDetailPath(id: string): string {
  return `${AppRoutes.people}/view/${id}`;
}

export function tagDetailPath(id: string): string {
  return `${AppRoutes.tags}/view/${id}`;
}

export const router = createBrowserRouter([
  { path: AppRoutes.editor, element: <EditorPage /> },
  {
    path: AppRoutes.settings,
    element: <SettingsPage />,
    children: [{ path: 'smart-search/models', element: <SettingsModels /> }],
  },
  ...(import.meta.env.DEV ? [{ path: AppRoutes.components, element: <ComponentsPage /> }] : []),
  {
    path: AppRoutes.onboarding,
    element: <Onboarding />,
  },
  {
    path: '/',
    element: <Dashboard></Dashboard>,
    children: [
      {
        path: AppRoutes.home,
        element: <Navigate to={AppRoutes.albums} replace />,
      },
      {
        path: AppRoutes.albums,
        element: <AlbumsPage />,
      },
      {
        path: AppRoutes.tags,
        element: <TagsLayout />,
        children: [
          { index: true, element: <TagsIndexRedirect /> },
          { path: 'all', element: <AllTags /> },
          {
            path: 'view/:id',
            element: (
              <EntityDetailRoute>
                <TagDetail />
              </EntityDetailRoute>
            ),
          },
        ],
      },
      {
        path: AppRoutes.people,
        element: <PeopleLayout />,
        children: [
          { index: true, element: <PeopleIndexRedirect /> },
          { path: 'all', element: <AllFaces /> },
          { path: 'suggested', element: <SuggestedFaces /> },
          { path: 'unidentified', element: <UnidentifiedFaces /> },
          { path: 'hidden', element: <HiddenFaces /> },
          { path: 'issues', element: <FaceIssues /> },
          {
            path: 'view/:id',
            element: (
              <EntityDetailRoute>
                <PersonDetail />
              </EntityDetailRoute>
            ),
          },
        ],
      },
      {
        path: AppRoutes.places,
        element: <PlacesPage />,
      },
      {
        path: AppRoutes.calendar,
        element: <CalendarPage />,
      },
      {
        path: AppRoutes.stats,
        element: <StatsPage />,
      },
      {
        path: AppRoutes.duplicates,
        element: <DuplicatesPage />,
      },
      {
        path: AppRoutes.search,
        element: <Search />,
      },
      {
        path: AppRoutes.reviewSelection,
        element: <ReviewSelection />,
      },
    ],
  },
]);
