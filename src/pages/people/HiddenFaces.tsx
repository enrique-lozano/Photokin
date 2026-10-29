import { NoResultsIndicator } from '@/components/NoResultsIndicator';
import { useCountStatus, usePageChrome } from '@/components/page-content/usePageChrome';
import { HeroIcon } from '@/components/page-content/HeroIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { toastOnError } from '@/components/ui/toast';
import { RegionsService } from '@/db/api/services/regions.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { AppRoutes } from '@/router';
import { useAppStore } from '@/stores/appState';
import { useHiddenItemsStore } from '@/stores/hiddenItemsStore';
import { IconEyeOff } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo } from 'react';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent';
import { discardFacesWithUndo } from './discardFaces';
import {
  assignFacesWithUndo,
  createPersonFromFacesWithUndo,
  restoreHiddenFacesWithUndo,
} from './faceMutations';
import { PersonFacesGrid } from './PersonFacesGrid';
import { useAssignPersonOptions, useFaceAssignmentTags } from './peopleOptions';
import { usePeopleOutletContext } from './PeopleLayout';

const SKELETON_FACE_COUNT = 48;

/** Archive of real faces the user intentionally chose not to identify. */
export function HiddenFaces() {
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);
  // This page *is* the ignored archive, so it always lists it. The preference
  // only still decides whether faces from hidden albums are part of the query.
  const showHiddenItems = useHiddenItemsStore((state) => state.showHiddenItems);

  const { data: regions, loading } = useLiveQuery(
    () => RegionsService.getHiddenRegions(),
    ['tagRegionInfo', 'assets'],
    { extDependencies: [showHiddenItems] },
  );
  const { people } = usePeopleOutletContext();

  useEffect(() => {
    setBreadcrumb([{ label: 'People', to: AppRoutes.allFaces }, { label: 'Ignored faces' }]);
    return () => setBreadcrumb([]);
  }, [setBreadcrumb]);

  usePageChrome('faces', useCountStatus(regions?.length, 'ignored face', 'ignored faces'));

  const hiddenRegions = useMemo(() => regions ?? [], [regions]);
  const existingPeople = useAssignPersonOptions(people);
  const existingTags = useFaceAssignmentTags();

  const assignFace = useCallback(
    (regionId: string, tagId: string) => toastOnError(assignFacesWithUndo([regionId], tagId)),
    [],
  );
  const createPerson = useCallback(
    (regionId: string, name: string) => toastOnError(createPersonFromFacesWithUndo([regionId], name)),
    [],
  );
  const discardFace = useCallback((regionId: string) => void discardFacesWithUndo([regionId]), []);
  const restoreFace = useCallback(
    (regionId: string) => void toastOnError(restoreHiddenFacesWithUndo([regionId])),
    [],
  );

  const content = loading ? (
    <div className="overview-body">
      <section className="overview-section">
        <div className="person-faces-grid" aria-hidden>
          {Array.from({ length: SKELETON_FACE_COUNT }, (_, index) => (
            <Skeleton key={index} className="person-face-skeleton" />
          ))}
        </div>
      </section>
    </div>
  ) : hiddenRegions.length === 0 ? (
    <NoResultsIndicator
      icon={<IconEyeOff size={56} strokeWidth={1.4} />}
      title="No ignored faces"
      description="Faces you ignore while reviewing land here, where you can name them or send them back for review."
    />
  ) : (
    <div className="overview-body">
      <section className="overview-section">
        <div className="overview-section__header">
          <div className="overview-section__heading">
            <h3 className="overview-section__title">
              Ignored faces
              <span className="overview-section__count">{hiddenRegions.length.toLocaleString()}</span>
            </h3>
            <span className="text-sm text-muted-foreground">
              Assign a person now or return a face for review
            </span>
          </div>
        </div>
        <PersonFacesGrid
          regions={hiddenRegions}
          existingPeople={existingPeople}
          existingTags={existingTags}
          onAssign={assignFace}
          onCreate={createPerson}
          onReject={discardFace}
          onRestore={restoreFace}
        />
      </section>
    </div>
  );

  return (
    <SecondaryTitleAndScrollableContent
      cover={<HeroIcon icon={<IconEyeOff size={28} />} />}
      title="Ignored faces"
      subtitle={
        loading
          ? 'Loading faces…'
          : `${hiddenRegions.length.toLocaleString()} ignored ${
              hiddenRegions.length === 1 ? 'face' : 'faces'
            }`
      }
      content={content}
    />
  );
}
