import { EntityOverflowMenu } from '@/components/entity-actions/HeaderActionsBar';
import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { NoResultsIndicator } from '@/components/NoResultsIndicator';
import { HeroIcon } from '@/components/page-content/HeroIcon';
import { useCountStatus, usePageChrome } from '@/components/page-content/usePageChrome';
import { Skeleton } from '@/components/ui/skeleton';
import { PersonInfo } from '@/db/models/PersonInfo';
import { TagInClient } from '@/db/models/TagDTO';
import { personDetailPath } from '@/router';
import { useHiddenItemsStore } from '@/stores/hiddenItemsStore';
import { IconEye, IconEyeOff, IconGitMerge, IconMoodNerd, IconUsers } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../stores/appState';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent';
import { MergeTagsDialog } from '../tags/MergeTagsDialog';
import './allFaces.css';
import { FaceActionsBar } from './FaceActionsBar';
import { usePeopleOutletContext } from './PeopleLayout';

/** Enough placeholder cards to fill the first viewport of the grid. */
const SKELETON_CARD_COUNT = 18;

function PersonCard({ person }: { person: PersonInfo }) {
  const navigate = useNavigate();

  return (
    <button
      className={`face-card${person.tag?.isHidden ? ' face-card--hidden' : ''}`}
      onClick={() => navigate(personDetailPath(person.id))}
    >
      <span className="face-card__avatar">
        <FaceThumbnail region={person.representativeRegion} />
      </span>
      <span className="face-card__name" title={person.displayName}>
        {person.displayName}
      </span>
      <span className="face-card__count">
        {person.totalResults.toLocaleString()} {person.totalResults === 1 ? 'photo' : 'photos'}
      </span>
    </button>
  );
}

function PersonCardSkeleton() {
  return (
    <div className="face-card" aria-hidden>
      <Skeleton className="face-card__avatar" />
      <Skeleton className="face-card__name-skeleton" />
      <Skeleton className="face-card__count-skeleton" />
    </div>
  );
}

/**
 * "All Faces" overview: a grid of every named person. Unknown/unsorted face
 * clusters keep living in the existing People page; this page focuses on quick
 * browsing and jumping into a person's detail view.
 */
export function AllFaces() {
  const showHiddenPeople = useHiddenItemsStore((state) => state.showHiddenItems);
  const setShowHiddenPeople = useHiddenItemsStore((state) => state.setShowHiddenItems);
  const { people, loading } = usePeopleOutletContext();
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);
  const [mergeOpen, setMergeOpen] = useState(false);

  useEffect(() => {
    setBreadcrumb([{ label: 'People' }]);
    return () => setBreadcrumb([]);
  }, [setBreadcrumb]);

  const knownPeople = useMemo(() => (people ?? []).filter((person) => person.kind === 'known'), [people]);

  const visiblePeople = useMemo(
    () => (showHiddenPeople ? knownPeople : knownPeople.filter((person) => person.tag?.isHidden !== 1)),
    [knownPeople, showHiddenPeople],
  );
  const hiddenCount = knownPeople.filter((person) => person.tag?.isHidden === 1).length;

  usePageChrome('entities', useCountStatus(people && visiblePeople.length, 'person', 'people'));
  const personTags = useMemo(
    () => knownPeople.map((person) => person.tag).filter((tag): tag is TagInClient => !!tag),
    [knownPeople],
  );
  const personCountById = useMemo(
    () => Object.fromEntries(knownPeople.map((person) => [person.id, person.totalResults])),
    [knownPeople],
  );
  const pageActions = [
    {
      id: 'merge-people',
      label: 'Merge people…',
      icon: <IconGitMerge size={16} />,
      disabled: personTags.length < 2,
      onSelect: () => setMergeOpen(true),
    },
    {
      id: 'show-hidden',
      label: showHiddenPeople ? 'Hide hidden items' : 'Show hidden items',
      icon: showHiddenPeople ? <IconEyeOff size={16} /> : <IconEye size={16} />,
      onSelect: () => setShowHiddenPeople(!showHiddenPeople),
    },
  ];

  const featuredPeople = useMemo(
    () => visiblePeople.filter((person) => person.tag?.isFavorite === 1),
    [visiblePeople],
  );

  return (
    <SecondaryTitleAndScrollableContent
      cover={<HeroIcon icon={<IconUsers size={28} />} />}
      title="People"
      subtitle={
        loading
          ? 'Loading people…'
          : `${visiblePeople.length.toLocaleString()} named people${
              hiddenCount > 0 ? ` · ${hiddenCount.toLocaleString()} hidden` : ''
            }`
      }
      actions={
        <>
          <FaceActionsBar />
          <EntityOverflowMenu actions={pageActions} menuLabel="People actions" />
        </>
      }
      content={
        <>
          {loading ? (
            <div className="overview-body">
              <section className="overview-section">
                <div className="face-grid">
                  {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
                    <PersonCardSkeleton key={index} />
                  ))}
                </div>
              </section>
            </div>
          ) : visiblePeople.length === 0 ? (
            <NoResultsIndicator
              icon={<IconMoodNerd size={56} strokeWidth={1.4} />}
              title={hiddenCount > 0 ? 'All people are hidden' : 'No people yet'}
              description={
                hiddenCount > 0
                  ? 'Use the People actions menu to show hidden people.'
                  : 'Find faces in your photos and name them to see people here.'
              }
            />
          ) : (
            <div className="overview-body">
              {featuredPeople.length > 0 && (
                <section className="overview-section">
                  <div className="overview-section__header">
                    <h3 className="overview-section__title">
                      Featured
                      <span className="overview-section__count">
                        {featuredPeople.length.toLocaleString()}
                      </span>
                    </h3>
                  </div>
                  <div className="face-grid">
                    {featuredPeople.map((person) => (
                      <PersonCard key={person.id} person={person} />
                    ))}
                  </div>
                </section>
              )}

              <section className="overview-section">
                {/* With no Featured strip above it there is only one group, and
                    the hero already states the count — a header here would just
                    repeat it. */}
                {featuredPeople.length > 0 && (
                  <div className="overview-section__header">
                    <h3 className="overview-section__title">
                      All people
                      <span className="overview-section__count">{visiblePeople.length.toLocaleString()}</span>
                    </h3>
                  </div>
                )}
                <div className="face-grid">
                  {visiblePeople.map((person) => (
                    <PersonCard key={person.id} person={person} />
                  ))}
                </div>
              </section>
            </div>
          )}
          <MergeTagsDialog
            open={mergeOpen}
            onOpenChange={setMergeOpen}
            tags={personTags}
            countById={personCountById}
            mode="people"
          />
        </>
      }
    />
  );
}
