import { EntityOverflowMenu } from '@/components/entity-actions/HeaderActionsBar';
import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { NoResultsIndicator } from '@/components/NoResultsIndicator';
import { HeroIcon } from '@/components/page-content/HeroIcon';
import { useCountStatus, usePageChrome } from '@/components/page-content/usePageChrome';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirmationDialogStore';
import { Skeleton } from '@/components/ui/skeleton';
import { RegionsService } from '@/db/api/services/regions.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { PersonInfo, PersonRegion } from '@/db/models/PersonInfo';
import { faceRecognitionOptionsFrom } from '@/media/faces/faceRecognition';
import { AppRoutes, personDetailPath } from '@/router';
import { useAppStore } from '@/stores/appState';
import { estimateMatchSeconds, FaceRunEstimate, useFaceRunRateStore } from '@/stores/faceRunRateStore';
import { useFaceScanSettingsStore } from '@/stores/faceScanSettingsStore';
import { useHiddenItemsStore } from '@/stores/hiddenItemsStore';
import { ProcessKind, useProcessStore } from '@/stores/processStore';
import { IconArrowBackUp, IconCheck, IconRefresh, IconSparkles, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent';
import {
  confirmFaces,
  confirmFacesWithUndo,
  discardFaces,
  dismissSuggestions,
  dismissSuggestionsWithUndo,
  hideFaces,
} from './faceMutations';
import { SuggestionBanner } from './SuggestionBanner';
import { usePeopleOutletContext } from './PeopleLayout';
import { SuggestionsReviewModal } from './SuggestionsReviewModal';
import { useFaceScanActions } from './useFaceScanActions';

/** Enough placeholder rows to fill the first viewport. */
const SKELETON_ROW_COUNT = 4;

/** Names up to three people, then counts the rest: "Ana, Ben, Carla and 2 more". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 3).join(', ')} and ${(names.length - 3).toLocaleString()} more`;
}

/** A single rounded figure: a menu row has no room for the range the scan dialog shows. */
function formatShortEstimate({ seconds }: FaceRunEstimate): string {
  return seconds < 90 ? `~${Math.max(1, Math.round(seconds))} s` : `~${Math.round(seconds / 60)} min`;
}

type PersonSuggestions = {
  person: PersonInfo;
  regions: PersonRegion[];
};

/**
 * Every face the matcher linked to a named person that still waits for an OK,
 * one row per person — the quick yes/no queue, kept apart from the unknown
 * faces that still need a name.
 */
export function SuggestedFaces() {
  const navigate = useNavigate();
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);
  const showHiddenItems = useHiddenItemsStore((state) => state.showHiddenItems);
  // Name kept alongside the id: confirming a person's last suggestion drops
  // their row while the modal is still showing the result.
  const [reviewed, setReviewed] = useState<{ personId: string; name: string } | null>(null);
  const { recognizeFaces } = useFaceScanActions();
  const faceRunRunning = useProcessStore((state) =>
    state.processes.some(
      (process) =>
        process.status === 'running' &&
        (process.kind === ProcessKind.FaceDetect || process.kind === ProcessKind.FaceRecognize),
    ),
  );
  const secondsPerPhoto = useFaceRunRateStore((state) => state.secondsPerPhoto);
  const secondsPerFace = useFaceRunRateStore((state) => state.secondsPerFace);

  const { data: regions } = useLiveQuery(
    () => RegionsService.getSuggestedRegions(),
    ['tagRegionInfo', 'tags', 'assets'],
    { extDependencies: [showHiddenItems] },
  );
  const { people } = usePeopleOutletContext();
  const { data: facesToMatch } = useLiveQuery(
    () => RegionsService.getUnconfirmedRegionCount(),
    ['tagRegionInfo'],
  );
  const loading = regions === null || people === null;

  useEffect(() => {
    setBreadcrumb([{ label: 'People', to: AppRoutes.allFaces }, { label: 'Suggested faces' }]);
    return () => setBreadcrumb([]);
  }, [setBreadcrumb]);

  usePageChrome('review', useCountStatus(regions?.length, 'face to review', 'faces to review'));

  const groups = useMemo<PersonSuggestions[]>(() => {
    const peopleById = new Map((people ?? []).map((person) => [person.id, person]));
    const byPerson = new Map<string, PersonRegion[]>();
    for (const region of regions ?? []) {
      if (!region.tagId) continue;
      const list = byPerson.get(region.tagId) ?? [];
      list.push(region);
      byPerson.set(region.tagId, list);
    }

    return [...byPerson.entries()]
      .flatMap(([personId, personRegions]) => {
        const person = peopleById.get(personId);
        if (!person || (!showHiddenItems && person.tag?.isHidden === 1)) return [];
        return [{ person, regions: personRegions }];
      })
      .sort(
        (a, b) =>
          b.regions.length - a.regions.length || a.person.displayName.localeCompare(b.person.displayName),
      );
  }, [regions, people, showHiddenItems]);

  const totalFaces = groups.reduce((sum, group) => sum + group.regions.length, 0);
  const visibleRegionIds = groups.flatMap((group) => group.regions.map((region) => region.id));
  const unmatchedFaces = facesToMatch ?? 0;
  const reviewedRegions = groups.find((group) => group.person.id === reviewed?.personId)?.regions ?? [];

  /**
   * Empties the queue in one go, for when the suggestions came out of settings
   * worth changing: matching is cheap to run again, reviewing 400 faces is not.
   */
  async function dismissAll() {
    const regionIds = visibleRegionIds;
    if (regionIds.length === 0) return;

    const faces = `${totalFaces.toLocaleString()} ${totalFaces === 1 ? 'suggestion' : 'suggestions'}`;
    const proceed = await confirm({
      icon: <IconArrowBackUp size={24} />,
      title: `Dismiss all ${faces}?`,
      description:
        'Every suggested face returns to unverified faces, with no name attached. Nothing is deleted and your photos are unchanged — run Recognize faces again to get a fresh set of suggestions.',
      confirmLabel: `Dismiss ${faces}`,
      tone: 'destructive',
    });

    if (proceed) await dismissSuggestionsWithUndo(regionIds);
  }

  async function acceptAll() {
    const regionIds = visibleRegionIds;
    if (regionIds.length === 0) return;

    const faces = `${totalFaces.toLocaleString()} ${totalFaces === 1 ? 'face' : 'faces'}`;
    const proceed = await confirm({
      icon: <IconCheck size={24} />,
      title: `Accept all ${faces}?`,
      description: `Each face is named as suggested: ${listNames(groups.map((group) => group.person.displayName))}. You can undo this right after.`,
      confirmLabel: `Accept ${faces}`,
      fileMetadataImpact: 'automatic',
    });

    if (proceed) await confirmFacesWithUndo(regionIds);
  }

  async function recognizeNow() {
    await recognizeFaces(faceRecognitionOptionsFrom(useFaceScanSettingsStore.getState())).catch(() => {});
  }

  const content = loading ? (
    <div className="overview-body">
      <div className="suggested-list" aria-hidden>
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
          <Skeleton key={index} className="suggested-row-skeleton" />
        ))}
      </div>
    </div>
  ) : groups.length === 0 ? (
    <NoResultsIndicator
      icon={<IconSparkles size={56} strokeWidth={1.4} />}
      title="No suggestions to review"
      description="When face matching links a face to someone you've named, it waits here for your OK."
    />
  ) : (
    <div className="overview-body">
      <div className="suggested-list">
        {groups.map(({ person, regions: personRegions }) => (
          <SuggestionBanner
            key={person.id}
            icon={<FaceThumbnail region={person.representativeRegion} className="suggested-person-avatar" />}
            personName={
              <button
                type="button"
                className="suggested-person-link"
                onClick={() => navigate(personDetailPath(person.id))}
              >
                {person.displayName}
              </button>
            }
            regions={personRegions}
            onAcceptAll={() => confirmFacesWithUndo(personRegions.map((region) => region.id))}
            onReview={() => setReviewed({ personId: person.id, name: person.displayName })}
          />
        ))}
      </div>
    </div>
  );

  return (
    <SecondaryTitleAndScrollableContent
      cover={<HeroIcon icon={<IconSparkles size={28} />} />}
      title="Suggestions"
      subtitle={
        loading ? (
          'Loading suggestions…'
        ) : (
          <>
            <b className="font-semibold text-foreground">
              {totalFaces.toLocaleString()} {totalFaces === 1 ? 'face' : 'faces'}
            </b>{' '}
            may belong to {groups.length.toLocaleString()} {groups.length === 1 ? 'person' : 'people'} you
            have already named
          </>
        )
      }
      actions={
        !loading &&
        totalFaces > 0 && (
          <>
            <Button onClick={() => void acceptAll()}>
              <IconCheck size={16} />
              Accept all {totalFaces.toLocaleString()}…
            </Button>
            <EntityOverflowMenu
              menuLabel="Suggestion actions"
              actions={[
                {
                  id: 'recognize',
                  label: 'Recognize faces',
                  icon: <IconRefresh size={16} />,
                  trailing:
                    unmatchedFaces > 0 && !faceRunRunning
                      ? formatShortEstimate(
                          estimateMatchSeconds(unmatchedFaces, { secondsPerPhoto, secondsPerFace }),
                        )
                      : undefined,
                  disabled: faceRunRunning || unmatchedFaces === 0,
                  onSelect: () => void recognizeNow(),
                },
                {
                  id: 'dismiss-all',
                  label: 'Dismiss all suggestions',
                  icon: <IconX size={16} />,
                  destructive: true,
                  onSelect: () => void dismissAll(),
                },
              ]}
            />
          </>
        )
      }
      content={
        <>
          {content}
          <SuggestionsReviewModal
            open={reviewed !== null}
            onOpenChange={(open) => !open && setReviewed(null)}
            personName={reviewed?.name ?? 'this person'}
            regions={reviewedRegions}
            onConfirm={confirmFaces}
            onDismiss={dismissSuggestions}
            onDeleteAll={discardFaces}
            onHide={hideFaces}
          />
        </>
      }
    />
  );
}
