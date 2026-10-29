import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import { EntityOverflowMenu, HeaderActionsBar } from '@/components/entity-actions/HeaderActionsBar';
import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { NoResultsIndicator } from '@/components/NoResultsIndicator';
import { FilterChipPlaceholders, FilterChipRow } from '@/components/page-content/FilterChipRow';
import { useContentFilterChips } from '@/components/page-content/useContentFilterChips';
import { useCountStatus, usePageChrome } from '@/components/page-content/usePageChrome';
import { Segmented } from '@/components/segmented/Segmented';
import { type GalleryScope, GalleryScopeProvider } from '@/components/selection-actions/galleryScope';
import { TimelineGallery } from '@/components/timeline-gallery/TimelineGallery';
import { Button } from '@/components/ui/button';
import { toastOnError } from '@/components/ui/toast';
import { AssetsService } from '@/db/api/services/assets.service';
import { RegionsService } from '@/db/api/services/regions.service';
import { TagsService } from '@/db/api/services/tags.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { AppRoutes } from '@/router';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCamera,
  IconMoodSad,
  IconPhoto,
  IconUser,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { mergeSearchQueries } from '../../common/searchQueryUtils';
import { useAppStore } from '../../stores/appState';
import { formatDate } from '../../utils/dateFormatter';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent';
import { DeletePersonDialog } from './DeletePersonDialog';
import { discardFacesWithUndo } from './discardFaces';
import { removableDuplicateIds } from './FaceIssues';
import {
  assignFacesWithUndo,
  confirmFaces,
  confirmFacesWithUndo,
  createPersonFromFacesWithUndo,
  discardFaces,
  dismissSuggestions,
  hideFaces,
  hideFacesWithUndo,
} from './faceMutations';
import { useAssignPersonOptions, useFaceAssignmentTags } from './peopleOptions';
import { PersonAbout } from './PersonAbout';
import { buildPersonActions } from './personActions';
import { PersonEditDialog } from './PersonEditDialog';
import { PersonFacesGrid } from './PersonFacesGrid';
import { usePeopleOutletContext } from './PeopleLayout';
import { getPersonViewMode, PersonViewMode, setPersonViewMode } from './personViewMode';
import { SuggestionBanner } from './SuggestionBanner';
import { SuggestionsReviewModal } from './SuggestionsReviewModal';
import { ProfilePhotoDialog } from './ProfilePhotoDialog';
import { changeProfilePhoto } from './profilePhoto';

const NO_ASSETS: string[] = [];

/** Per-person detail page: hero + temporal filters + the person's timeline. */
export function PersonDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const searchQuery = useAppStore((state) => state.searchQuery);
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);

  const [viewMode, setViewModeState] = useState<PersonViewMode>(getPersonViewMode);
  const setViewMode = (mode: PersonViewMode) => {
    setPersonViewMode(mode);
    setViewModeState(mode);
  };
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isProfilePhotoOpen, setIsProfilePhotoOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);

  const { people } = usePeopleOutletContext();
  const person = useMemo(() => (people ?? []).find((item) => item.id === id), [people, id]);
  const tag = person?.tag;
  const isHidden = tag?.isHidden === 1;

  const { data: regions } = useLiveQuery(
    () => (id ? RegionsService.getPersonRegions({ personId: id, kind: 'known' }) : Promise.resolve([])),
    ['tagRegionInfo', 'tags', 'assets'],
    { extDependencies: [id] },
  );

  const { data: faceIssues } = useLiveQuery(
    () => (id ? RegionsService.getFaceIssues(id) : Promise.resolve(null)),
    ['tagRegionInfo', 'assets'],
    { extDependencies: [id] },
  );
  const issueRegions = (faceIssues ?? []).flatMap((issue) => issue.regions);
  const duplicateIds = removableDuplicateIds(faceIssues ?? []);
  const issuePhotoCount = new Set(issueRegions.map((region) => region.assetId)).size;

  const confirmedRegions = useMemo(() => (regions ?? []).filter((region) => region.confirmed), [regions]);
  const reviewRegions = useMemo(() => (regions ?? []).filter((region) => !region.confirmed), [regions]);
  const confirmedAssetIds = useMemo(
    () => [...new Set(confirmedRegions.map((region) => region.assetId))],
    [confirmedRegions],
  );
  const personName = person?.displayName ?? tag?.name ?? 'this person';
  // Lets the photo menus offer "Not <name>" for this person's photos.
  const galleryScope = useMemo<GalleryScope>(() => {
    const regionIdsByAsset = new Map<string, string[]>();
    for (const region of confirmedRegions) {
      regionIdsByAsset.set(region.assetId, [...(regionIdsByAsset.get(region.assetId) ?? []), region.id]);
    }
    return { kind: 'person', personName, regionIdsByAsset };
  }, [confirmedRegions, personName]);

  const existingPeopleOptions = useAssignPersonOptions(people);
  const existingTags = useFaceAssignmentTags();

  const { data: dateRange } = useLiveQuery(
    () => AssetsService.getDateRange({ assetIds: confirmedAssetIds }),
    ['assets'],
    { extDependencies: [confirmedAssetIds] },
  );

  // Scoped by condition rather than `confirmedAssetIds`: the chips then don't
  // wait for the region list, and SQLite isn't handed thousands of bound ids.
  // Photos only, matching the confirmed regions the timeline shows.
  const personScopedQuery = useMemo(
    () =>
      tag
        ? mergeSearchQueries(searchQuery, [
            {
              filters: [
                { filterCriteria: FilterCriteria.person, operator: 'contains', value: [tag] },
                { filterCriteria: FilterCriteria.mediaType, operator: 'equals', value: 'photo' },
              ],
            },
          ])
        : undefined,
    [searchQuery, tag],
  );

  const {
    chips,
    activeChipIds,
    toggleChip,
    conditions,
    isLoading: chipsLoading,
    isRefreshing: chipsRefreshing,
  } = useContentFilterChips({
    searchQuery: personScopedQuery,
    // An empty allow-list keeps the chips empty until the person has loaded.
    assetIds: personScopedQuery ? undefined : NO_ASSETS,
    resetKey: id,
  });

  useEffect(() => {
    setBreadcrumb([{ label: 'People', to: AppRoutes.allFaces }, { label: person?.displayName ?? 'Person' }]);
    return () => setBreadcrumb([]);
  }, [setBreadcrumb, person?.displayName]);

  useEffect(() => {
    setIsEditDialogOpen(false);
    setIsProfilePhotoOpen(false);
  }, [id]);

  // One page, two modes: Faces keeps the photo chrome (zoom applies to crops) but
  // pauses the library filters and counts faces instead of photos.
  const facesStatus = useCountStatus(confirmedRegions.length, 'face', 'faces');
  usePageChrome(
    'photos',
    viewMode === 'faces' ? facesStatus : undefined,
    viewMode === 'faces' ? 'paused' : 'applied',
  );

  if (people && !person) {
    return (
      <div className="page-scroll">
        <NoResultsIndicator
          icon={<IconMoodSad size={56} strokeWidth={1.4} />}
          title="Person not found"
          description="This person may have been removed."
          extraContent={
            <Button variant="outline-primary" onClick={() => navigate(AppRoutes.allFaces)}>
              <IconArrowLeft size={16} /> Back to people
            </Button>
          }
        />
      </div>
    );
  }

  const galleryQuery = mergeSearchQueries(searchQuery, conditions);

  const photoCount = confirmedAssetIds.length;
  const hasReview = reviewRegions.length > 0;
  const dateMeta =
    dateRange &&
    `${formatDate(new Date(dateRange.min), { year: 'numeric', month: 'short' })} – ${formatDate(
      new Date(dateRange.max),
      { year: 'numeric', month: 'short' },
    )}`;
  const photoSummary = [`${photoCount.toLocaleString()} ${photoCount === 1 ? 'photo' : 'photos'}`, dateMeta]
    .filter(Boolean)
    .join(' · ');

  const rejectRegion = (regionId: string) => void discardFacesWithUndo([regionId]);
  const hideRegion = (regionId: string) => void hideFacesWithUndo([regionId]);
  const assignRegion = (regionId: string, assignTagId: string) =>
    toastOnError(assignFacesWithUndo([regionId], assignTagId));
  const createForRegion = (regionId: string, name: string) =>
    toastOnError(createPersonFromFacesWithUndo([regionId], name));

  const personBio = {
    name: person?.displayName ?? tag?.name ?? 'Person',
    sex: tag?.sex ?? null,
    dateBirth: tag?.dateBirth ?? null,
    dateDead: tag?.dateDead ?? null,
    description: tag?.description ?? null,
  };

  // Single source of truth for the person's object verbs, shared with the
  // people sidebar right-click menu. Edit details surfaces as a button; the
  // destructive removal lives in the ⋮ (and the whole set in the compact bar).
  const personActions = tag
    ? buildPersonActions({
        onEditDetails: () => setIsEditDialogOpen(true),
        isHidden,
        onSetHidden: (hidden) => void TagsService.setHidden(id, hidden),
        onRemove: () => setIsDeleteDialogOpen(true),
      })
    : [];

  const hasPersonAbout = Boolean(
    personBio.sex || personBio.dateBirth || personBio.dateDead || personBio.description?.trim(),
  );

  return (
    <GalleryScopeProvider value={galleryScope}>
      <SecondaryTitleAndScrollableContent
        cover={
          <button
            type="button"
            className="profile-photo-trigger"
            aria-label="Change profile photo"
            title="Change profile photo"
            disabled={!tag}
            onClick={() => setIsProfilePhotoOpen(true)}
          >
            <FaceThumbnail region={person?.representativeRegion} />
            <span className="profile-photo-trigger__edit">
              <IconCamera size={20} aria-hidden />
            </span>
          </button>
        }
        roundCover
        title={person?.displayName ?? 'Person'}
        subtitle={photoSummary}
        compactSubtitle={photoSummary}
        heroBelow={tag && hasPersonAbout ? <PersonAbout personId={tag.id} bio={personBio} /> : undefined}
        actions={tag ? <HeaderActionsBar actions={personActions} menuLabel="Person actions" /> : undefined}
        compactActions={
          tag ? <EntityOverflowMenu actions={personActions} menuLabel="Person actions" /> : undefined
        }
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
          /* The Photos/Faces switch is a view control, so it rides in the filter
           row rather than the hero (§2 keeps view toggles out of page headers). */
          <Segmented
            ariaLabel="View mode"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'gallery', label: 'Photos', icon: <IconPhoto size={15} /> },
              { value: 'faces', label: 'Faces', icon: <IconUser size={15} /> },
            ]}
          />
        }
        galleryLayout={viewMode === 'gallery' ? true : 'disabled'}
        content={
          <>
            {issuePhotoCount > 0 && (
              <SuggestionBanner
                icon={<IconAlertTriangle size={16} className="suggestion-banner-spark text-warning" />}
                title={`${issuePhotoCount} ${issuePhotoCount === 1 ? 'photo has' : 'photos have'} clashing faces`}
                personName={person?.displayName ?? 'this person'}
                regions={issueRegions}
                acceptLabel="Remove duplicates"
                onAcceptAll={duplicateIds.length > 0 ? () => discardFacesWithUndo(duplicateIds) : undefined}
                onReview={() => navigate(AppRoutes.peopleIssues)}
              />
            )}

            {hasReview && (
              <SuggestionBanner
                personName={person?.displayName ?? 'this person'}
                regions={reviewRegions}
                onAcceptAll={() => confirmFacesWithUndo(reviewRegions.map((region) => region.id))}
                onReview={() => setIsSuggestionsModalOpen(true)}
              />
            )}

            {regions !== null &&
              (photoCount === 0 ? (
                <NoResultsIndicator
                  icon={<IconMoodSad size={56} strokeWidth={1.4} />}
                  title="No confirmed photos yet"
                  description="Confirm this person's suggested faces to populate their timeline."
                />
              ) : viewMode === 'faces' ? (
                <>
                  <p className="person-faces-label">
                    {confirmedRegions.length} face crops — click a face to change it
                  </p>
                  <PersonFacesGrid
                    regions={confirmedRegions}
                    contextPreview={false}
                    existingPeople={existingPeopleOptions}
                    existingTags={existingTags}
                    onReject={rejectRegion}
                    onHide={hideRegion}
                    onAssign={assignRegion}
                    onCreate={createForRegion}
                    onSetProfilePhoto={(regionId) => changeProfilePhoto(id, regionId)}
                  />
                </>
              ) : (
                <TimelineGallery assetIdsFilter={confirmedAssetIds} searchQuery={galleryQuery} />
              ))}

            <ProfilePhotoDialog
              open={isProfilePhotoOpen}
              onOpenChange={setIsProfilePhotoOpen}
              personId={id}
              personName={personName}
              regions={confirmedRegions}
              profileRegionId={tag?.profileRegionId ?? null}
              representativeRegionId={person?.representativeRegion?.id}
            />

            <PersonEditDialog
              open={isEditDialogOpen}
              onOpenChange={setIsEditDialogOpen}
              person={
                tag
                  ? {
                      id: tag.id,
                      name: person?.displayName ?? tag.name,
                      sex: tag.sex,
                      dateBirth: tag.dateBirth,
                      dateDead: tag.dateDead,
                      description: tag.description,
                    }
                  : null
              }
            />

            <SuggestionsReviewModal
              open={isSuggestionsModalOpen}
              onOpenChange={setIsSuggestionsModalOpen}
              personName={person?.displayName ?? 'this person'}
              regions={reviewRegions}
              onConfirm={confirmFaces}
              onDismiss={dismissSuggestions}
              onDeleteAll={discardFaces}
              onHide={hideFaces}
            />

            <DeletePersonDialog
              open={isDeleteDialogOpen}
              onOpenChange={setIsDeleteDialogOpen}
              person={tag ?? null}
            />
          </>
        }
      />
    </GalleryScopeProvider>
  );
}
