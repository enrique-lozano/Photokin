import { EntityContextMenuContent } from '@/components/entity-actions/EntityActionItems';
import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { RegionsService } from '@/db/api/services/regions.service';
import { TagsService } from '@/db/api/services/tags.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { PersonInfo } from '@/db/models/PersonInfo';
import { AppRoutes, personDetailPath } from '@/router';
import { useAppStore } from '@/stores/appState';
import {
  IconAlertTriangle,
  IconEyeOff,
  IconSparkles,
  IconUserQuestion,
  IconUsers,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { SecondaryNavbar } from '../../components/secondary-navbar/SecondaryNavbar';
import { formatSidebarFilterCount } from '../../components/secondary-navbar/sidebarFilterCount';
import { SidebarSearchInput } from '../../components/secondary-navbar/SidebarSearchInput';
import { SidebarSortMenu, SidebarSortOption } from '../../components/secondary-navbar/SidebarSortMenu';
import { useHiddenItemsStore } from '../../stores/hiddenItemsStore';
import { PeopleSort, useSidebarStore } from '../../stores/sidebarStore';
import { DeletePersonDialog } from './DeletePersonDialog';
import './people.css';
import { buildPersonActions } from './personActions';
import { PersonEditDialog } from './PersonEditDialog';
import { resetPersonViewMode } from './personViewMode';

/** Enough placeholder rows to fill a typical sidebar without implying a count. */
const SKELETON_ROW_COUNT = 8;

interface PeopleOutletContext {
  people: PersonInfo[] | null;
  loading: boolean;
}

export function usePeopleOutletContext(): PeopleOutletContext {
  return useOutletContext<PeopleOutletContext>();
}

const PEOPLE_SORT_OPTIONS: SidebarSortOption<PeopleSort>[] = [
  { value: 'name', label: 'Name' },
  { value: 'photos', label: 'Most photos' },
];

// Offered only while pending suggestions exist, so the menu never advertises an
// ordering that would look identical to the default one.
const SUGGESTIONS_SORT_OPTION: SidebarSortOption<PeopleSort> = {
  value: 'suggestions',
  label: 'Most suggestions',
};

/** Applies the footer thumbnail slider to face-crop grids in the page, not the sidebar. */
function ScaledPageContent({ children }: { children: ReactNode }) {
  const galleryThumbnailSize = useAppStore((state) => state.galleryThumbnailSize);

  return (
    <div
      className="page-content"
      // 200 is the footer thumbnail slider's default, so the scale stays 1 until it moves.
      style={{ '--face-layout-scale': galleryThumbnailSize / 200 } as CSSProperties}
    >
      {children}
    </div>
  );
}

// `/people` index → last people sub-route (avoids flashing through All People).
export function PeopleIndexRedirect() {
  const lastPeopleRoute = useSidebarStore((state) => state.lastRoute.people);
  const target = lastPeopleRoute?.startsWith('/people/') ? lastPeopleRoute : AppRoutes.allFaces;

  return <Navigate to={target} replace />;
}

export function PeopleLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const showHiddenPeople = useHiddenItemsStore((state) => state.showHiddenItems);

  useEffect(() => () => resetPersonViewMode(), []);

  // The sidebar and its active page share one catalog query.
  const { data: people, loading } = useLiveQuery(
    () => RegionsService.getRegionTags(),
    ['tags', 'tagRegionInfo', 'assets', 'albums', 'rootAlbums'],
    { extDependencies: [showHiddenPeople] },
  );
  // Ignored faces are an archive the user filled on purpose, not a hidden item:
  // the row stays reachable whatever the hidden-items preference says, so a
  // face someone ignores always has a visible place to come back from.
  const { data: hiddenFaceCount } = useLiveQuery(
    () => RegionsService.getHiddenRegionCount(),
    ['tagRegionInfo'],
  );
  const { data: faceIssues } = useLiveQuery(
    () => RegionsService.getFaceIssues(),
    ['tagRegionInfo', 'assets'],
    { extDependencies: [showHiddenPeople] },
  );
  const faceIssueCount = faceIssues?.length ?? 0;
  const [filter, setFilter] = useState('');
  const sort = useSidebarStore((state) => state.sort.people);
  const setSort = useSidebarStore((state) => state.setSort);
  const [editPerson, setEditPerson] = useState<PersonInfo | null>(null);
  const [deletePerson, setDeletePerson] = useState<PersonInfo | null>(null);
  const legacyHiddenMigrated = useRef(false);

  const knownPeople = useMemo(() => (people ?? []).filter((person) => person.kind === 'known'), [people]);
  useEffect(() => {
    if (people === null || legacyHiddenMigrated.current) return;
    legacyHiddenMigrated.current = true;
    const legacy = localStorage.getItem('photokin-hidden-people');
    if (!legacy) return;
    try {
      const ids = JSON.parse(legacy)?.state?.hiddenPersonIds;
      if (Array.isArray(ids)) {
        void Promise.all(
          ids
            .filter((id): id is string => typeof id === 'string')
            .map((id) => TagsService.setHidden(id, true)),
        ).finally(() => localStorage.removeItem('photokin-hidden-people'));
      } else {
        localStorage.removeItem('photokin-hidden-people');
      }
    } catch {
      localStorage.removeItem('photokin-hidden-people');
    }
  }, [people]);
  const displayedKnownPeople = useMemo(
    () => (showHiddenPeople ? knownPeople : knownPeople.filter((person) => person.tag?.isHidden !== 1)),
    [knownPeople, showHiddenPeople],
  );

  const unidentifiedFaceCount = useMemo(
    () =>
      (people ?? []).filter((person) => person.kind !== 'known').reduce((acc, p) => acc + p.totalResults, 0),
    [people],
  );

  const suggestedFaceCount = useMemo(
    () => displayedKnownPeople.reduce((acc, person) => acc + person.unconfirmedResults, 0),
    [displayedKnownPeople],
  );
  const hasSuggestions = suggestedFaceCount > 0;

  // Whether suggestions exist is unknown until the query answers, so a load must
  // not retire the option: that would flash Name over the user's actual choice.
  const suggestionsSortAvailable = hasSuggestions || (people === null && sort === 'suggestions');

  const sortOptions = useMemo(
    () =>
      suggestionsSortAvailable ? [...PEOPLE_SORT_OPTIONS, SUGGESTIONS_SORT_OPTION] : PEOPLE_SORT_OPTIONS,
    [suggestionsSortAvailable],
  );

  // Confirming the last suggestions retires the option, so fall back rather than
  // leaving the menu pointing at a choice it no longer lists.
  const activeSort: PeopleSort = sort === 'suggestions' && !suggestionsSortAvailable ? 'name' : sort;

  const visiblePeople = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    const matched = normalized
      ? displayedKnownPeople.filter((person) => person.displayName.toLowerCase().includes(normalized))
      : displayedKnownPeople;

    const byName = (a: PersonInfo, b: PersonInfo) => a.displayName.localeCompare(b.displayName);

    return [...matched].sort((a, b) => {
      if (activeSort === 'name') return byName(a, b);
      if (activeSort === 'suggestions') {
        return b.unconfirmedResults - a.unconfirmedResults || byName(a, b);
      }
      return b.totalResults - a.totalResults || byName(a, b);
    });
  }, [displayedKnownPeople, filter, activeSort]);

  const favoritePeople = useMemo(
    () => visiblePeople.filter((person) => person.tag?.isFavorite === 1),
    [visiblePeople],
  );

  const selectedId = pathname.match(/^\/people\/view\/(.+)$/)?.[1] ?? null;
  const isAllActive = pathname === AppRoutes.allFaces || pathname === AppRoutes.people;
  const isSuggestedActive = pathname === AppRoutes.peopleSuggested;
  const isUnidentifiedActive = pathname === AppRoutes.peopleUnidentified;
  const isHiddenActive = pathname === AppRoutes.peopleHidden;
  const isIssuesActive = pathname === AppRoutes.peopleIssues;

  const setLastRoute = useSidebarStore((state) => state.setLastRoute);
  useEffect(() => {
    if (pathname === '/people') return;
    const isGone = selectedId !== null && people !== null && !people.some((p) => p.id === selectedId);
    setLastRoute('people', isGone ? AppRoutes.allFaces : pathname);
  }, [pathname, selectedId, people, setLastRoute]);

  // Counts are meaningless until the first query resolves; a bare "0" reads as
  // "you have no people" rather than "still loading".
  function renderCount(value: number) {
    return loading ? <Skeleton className="sidebar-count-skeleton" /> : value;
  }

  function renderPersonRow(person: PersonInfo) {
    // The trailing number counts confirmed faces only; pending suggestions live
    // in their own badge so the two are never conflated.
    const confirmedCount = person.totalResults - person.unconfirmedResults;
    const row = (
      <button
        className={clsx(
          'person-list-row',
          selectedId === person.id && 'selected',
          person.tag?.isHidden === 1 && 'person-list-row--hidden',
        )}
        onClick={() => navigate(personDetailPath(person.id))}
      >
        <FaceThumbnail region={person.representativeRegion} />
        <span className="person-name">{person.displayName}</span>
        <span className="person-meta">
          {person.unconfirmedResults > 0 && (
            <span
              className="person-suggestions"
              title={`${person.unconfirmedResults} ${
                person.unconfirmedResults === 1 ? 'suggestion' : 'suggestions'
              }`}
            >
              <IconSparkles size={12} />
              {person.unconfirmedResults}
            </span>
          )}
          <span className="person-total" title={`${confirmedCount} confirmed`}>
            {confirmedCount}
          </span>
        </span>
      </button>
    );

    // Right-click exposes the same object verbs as the person detail header.
    if (!person.tag) {
      return <div key={person.id}>{row}</div>;
    }

    return (
      <ContextMenu key={person.id}>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          <EntityContextMenuContent
            label={person.displayName}
            actions={buildPersonActions({
              onEditDetails: () => setEditPerson(person),
              isHidden: person.tag.isHidden === 1,
              onSetHidden: (hidden) => void TagsService.setHidden(person.id, hidden),
              onRemove: () => setDeletePerson(person),
            })}
          />
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <div className="people-page">
      <div>
        <SecondaryNavbar title="People">
          {/* Index row + smart rows (saved queries), always read as one group.
              No scan/create verbs here — those live in the page header. */}
          <nav className="sidebar-nav">
            <button
              className={clsx('sidebar-nav-item', isAllActive && 'selected')}
              onClick={() => navigate(AppRoutes.allFaces)}
            >
              <span className="sidebar-nav-item__icon">
                <IconUsers size={18} />
              </span>
              <span className="sidebar-nav-item__label">All People</span>
              <span className="sidebar-nav-item__count">{renderCount(displayedKnownPeople.length)}</span>
            </button>
            <button
              className={clsx('sidebar-nav-item', isSuggestedActive && 'selected')}
              onClick={() => navigate(AppRoutes.peopleSuggested)}
            >
              <span className="sidebar-nav-item__icon">
                <IconSparkles size={18} />
              </span>
              <span className="sidebar-nav-item__label">Suggested faces</span>
              <span className="sidebar-nav-item__count">{renderCount(suggestedFaceCount)}</span>
            </button>
            <button
              className={clsx('sidebar-nav-item', isUnidentifiedActive && 'selected')}
              onClick={() => navigate(AppRoutes.peopleUnidentified)}
            >
              <span className="sidebar-nav-item__icon">
                <IconUserQuestion size={18} />
              </span>
              <span className="sidebar-nav-item__label">Unknown faces</span>
              <span className="sidebar-nav-item__count">{renderCount(unidentifiedFaceCount)}</span>
            </button>
            <button
              className={clsx('sidebar-nav-item', isHiddenActive && 'selected')}
              onClick={() => navigate(AppRoutes.peopleHidden)}
            >
              <span className="sidebar-nav-item__icon">
                <IconEyeOff size={18} />
              </span>
              <span className="sidebar-nav-item__label">Ignored faces</span>
              <span className="sidebar-nav-item__count">
                {hiddenFaceCount === null ? <Skeleton className="sidebar-count-skeleton" /> : hiddenFaceCount}
              </span>
            </button>
            {/* Only while something needs fixing, but kept while open so fixing the last one doesn't yank the row. */}
            {(faceIssueCount > 0 || isIssuesActive) && (
              <button
                className={clsx('sidebar-nav-item', isIssuesActive && 'selected')}
                onClick={() => navigate(AppRoutes.peopleIssues)}
              >
                <span className="sidebar-nav-item__icon">
                  <IconAlertTriangle size={18} className="text-warning" />
                </span>
                <span className="sidebar-nav-item__label">Face issues</span>
                <span className="sidebar-nav-item__count">{faceIssueCount}</span>
              </button>
            )}
          </nav>

          <div className="sidebar-zone-divider" />

          {/* Real items: the filter opens the zone, then the title with the total
              count on the left and the sort on the right. While filtering, the
              count is the matches over that same total. */}
          <SidebarSearchInput placeholder="Filter people" value={filter} onValueChange={setFilter} />
          <div className="sidebar-section-label">
            <span
              className={clsx(
                'sidebar-section-label__count',
                filter.trim() && 'sidebar-section-label__count--filtered',
              )}
            >
              {loading ? (
                <Skeleton className="sidebar-count-skeleton" />
              ) : (
                formatSidebarFilterCount(knownPeople.length, filter.trim() ? visiblePeople.length : null)
              )}
            </span>
            <span>People</span>
            <SidebarSortMenu
              value={activeSort}
              options={sortOptions}
              onChange={(value) => setSort('people', value)}
              ariaLabel="Sort people"
            />
          </div>

          <section className="sidebar-scroll-list people-list-container">
            {loading ? (
              Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                <div key={index} className="person-list-row person-list-row--skeleton" aria-hidden>
                  <Skeleton className="person-skeleton-avatar" />
                  <Skeleton className="person-skeleton-name" />
                </div>
              ))
            ) : (
              <>
                {favoritePeople.length > 0 && (
                  <>
                    <p className="sidebar-section-label">Favorites</p>
                    {favoritePeople.map(renderPersonRow)}
                  </>
                )}
                {visiblePeople.map(renderPersonRow)}
              </>
            )}
          </section>
        </SecondaryNavbar>

        <ScaledPageContent>
          <Outlet context={{ people, loading } satisfies PeopleOutletContext} />
        </ScaledPageContent>
      </div>

      <PersonEditDialog
        open={editPerson !== null}
        onOpenChange={(open) => !open && setEditPerson(null)}
        person={
          editPerson?.tag
            ? {
                id: editPerson.tag.id,
                name: editPerson.displayName,
                sex: editPerson.tag.sex,
                dateBirth: editPerson.tag.dateBirth,
                dateDead: editPerson.tag.dateDead,
                description: editPerson.tag.description,
              }
            : null
        }
      />

      <DeletePersonDialog
        open={deletePerson !== null}
        onOpenChange={(open) => !open && setDeletePerson(null)}
        person={deletePerson?.tag ?? null}
      />
    </div>
  );
}
