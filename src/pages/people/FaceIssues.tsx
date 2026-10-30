import { FaceContextTooltip } from '@/components/face-thumbnail/FaceContextTooltip';
import { useCountStatus, usePageChrome } from '@/components/page-content/usePageChrome';
import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { HeroIcon } from '@/components/page-content/HeroIcon';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { FaceIssue, RegionsService } from '@/db/api/services/regions.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { AppRoutes } from '@/router';
import { useAppStore } from '@/stores/appState';
import { useHiddenItemsStore } from '@/stores/hiddenItemsStore';
import { IconAlertTriangle, IconCheck, IconTrash } from '@tabler/icons-react';
import clsx from 'clsx';
import { useEffect, useMemo } from 'react';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent';
import { discardFacesWithUndo } from './discardFaces';
import { usePeopleOutletContext } from './PeopleLayout';

const SKELETON_CARD_COUNT = 6;

/** Every box but the first of each face — the extras the bulk remove keeps. */
export function removableDuplicateIds(issues: FaceIssue[]): string[] {
  return issues.flatMap((issue) => issue.regions.slice(1).map((region) => region.id));
}

/** Faces detected more than once: pick the box to keep, the rest are discarded. */
export function FaceIssues() {
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);
  const showHiddenItems = useHiddenItemsStore((state) => state.showHiddenItems);

  const { data: issues } = useLiveQuery(() => RegionsService.getFaceIssues(), ['tagRegionInfo', 'assets'], {
    extDependencies: [showHiddenItems],
  });
  const { people } = usePeopleOutletContext();
  const nameByTagId = useMemo(
    () => new Map((people ?? []).map((person) => [person.id, person.displayName])),
    [people],
  );

  useEffect(() => {
    setBreadcrumb([{ label: 'People', to: AppRoutes.allFaces }, { label: 'Face issues' }]);
    return () => setBreadcrumb([]);
  }, [setBreadcrumb]);

  usePageChrome('review', useCountStatus(issues?.length, 'face to fix', 'faces to fix'));

  const duplicateIds = removableDuplicateIds(issues ?? []);
  const keep = (issue: FaceIssue, keptId: string) =>
    void discardFacesWithUndo(
      issue.regions.filter((region) => region.id !== keptId).map((region) => region.id),
    );

  const content =
    issues === null ? (
      <div className="overview-body face-issue-list" aria-hidden>
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <Skeleton key={index} className="face-issue-skeleton" />
        ))}
      </div>
    ) : issues.length === 0 ? (
      <EmptyState
        icon={IconAlertTriangle}
        title="No face issues"
        description="Everything looks right. If the same person is ever found twice in one photo, it shows up here to fix."
      />
    ) : (
      <div className="overview-body">
        <section className="overview-section">
          <div className="overview-section__header">
            <div className="overview-section__heading">
              <h3 className="overview-section__title">
                Faces with more than one box
                <span className="overview-section__count">{issues.length.toLocaleString()}</span>
              </h3>
              <span className="text-sm text-muted-foreground">
                Hover a box to see its photo, then keep the right one. The others are discarded.
              </span>
            </div>
            {duplicateIds.length > 0 && (
              <Button size="sm" onClick={() => void discardFacesWithUndo(duplicateIds)}>
                <IconTrash size={14} />
                Remove {duplicateIds.length.toLocaleString()} duplicates
              </Button>
            )}
          </div>

          <div className="face-issue-list">
            {issues.map((issue) => (
              <div key={issue.regions[0].id} className="face-issue">
                {issue.regions.map((region) => (
                  <div key={region.id} className="face-issue__box">
                    <FaceContextTooltip region={region}>
                      <div className="face-issue__crop">
                        <FaceThumbnail region={region} sharp />
                      </div>
                    </FaceContextTooltip>
                    <span
                      className={clsx(
                        'person-face-name',
                        !region.tagId && 'is-unassigned',
                        region.tagId && !region.confirmed && 'is-suggested',
                      )}
                    >
                      {region.tagId ? (nameByTagId.get(region.tagId) ?? 'Unknown') : 'Unnamed'}
                      {region.tagId && !region.confirmed && '?'}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => keep(issue, region.id)}>
                      <IconCheck size={14} />
                      Keep
                    </Button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    );

  return (
    <SecondaryTitleAndScrollableContent
      cover={<HeroIcon icon={<IconAlertTriangle size={28} className="text-warning" />} />}
      title="Face issues"
      subtitle={
        issues === null
          ? 'Checking faces…'
          : `${issues.length.toLocaleString()} ${issues.length === 1 ? 'face' : 'faces'} to fix`
      }
      content={content}
    />
  );
}
