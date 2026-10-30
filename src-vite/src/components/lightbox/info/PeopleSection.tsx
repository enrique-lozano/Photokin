import { faceCropViewBox } from '@/components/face-thumbnail/FaceThumbnail';
import { Badge } from '@/components/ui/badge';
import { toastOnError } from '@/components/ui/toast';
import { LightboxImageContext } from '@/context/LightboxContext';
import { RegionsService } from '@/db/api/services/regions.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { AssetInClient } from '@/db/models/AssetInClient';
import { FaceStatus, TagRegionInfoInClient } from '@/db/models/TagRegionInfoDTO';
import { faceReviewStatus } from '@/media/faces/faceReviewStatus';
import { METADATA_SCAN_PENDING_MESSAGE } from '@/media/metadata/metadataScanState';
import { AssignFacePopover } from '@/pages/people/AssignFacePopover';
import { discardFacesWithUndo } from '@/pages/people/discardFaces';
import {
  assignFacesWithUndo,
  createPersonFromFacesWithUndo,
  hideFacesWithUndo,
  restoreHiddenFacesWithUndo,
} from '@/pages/people/faceMutations';
import { useAssignPersonOptions, useFaceAssignmentTags } from '@/pages/people/peopleOptions';
import { personDetailPath, router } from '@/router';
import { pathToImageSrc } from '@/system/diskManager';
import { IconMoodNerd } from '@tabler/icons-react';
import clsx from 'clsx';
import { useContext, useMemo, useRef, useState } from 'react';
import { InfoSection } from './InfoSection';

type PeopleSectionProps = {
  img: AssetInClient;
  faceRegions: TagRegionInfoInClient[];
  isOpen: boolean;
  onToggle: (id: string) => void;
  canEditMetadata: boolean;
  onFaceHover?: (regionId: string | null) => void;
  standalone?: boolean;
};

/**
 * The photo's faces use the same interaction as every face grid: the crop opens
 * its face menu, while a known person's name opens their page.
 */
export function PeopleSection({
  img,
  faceRegions,
  isOpen,
  onToggle,
  canEditMetadata,
  onFaceHover,
  standalone,
}: PeopleSectionProps) {
  const { closeLightbox } = useContext(LightboxImageContext);
  const assigningIdRef = useRef<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const { data: people } = useLiveQuery(
    () => RegionsService.getRegionTags(),
    ['tags', 'tagRegionInfo', 'assets'],
  );
  const existingPeople = useAssignPersonOptions(people);

  // Face regions point at *person* tags, which aren't necessarily keywords on
  // the asset, so their names come from the full tag set (as the face boxes do)
  // rather than from this photo's keywords — otherwise a reassigned face reads
  // "Unknown" until the person also becomes a keyword.
  const existingTags = useFaceAssignmentTags();
  const personNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const tag of existingTags) map.set(tag.id, tag.name);
    return map;
  }, [existingTags]);

  const imageAspectRatio = img.metadata.width / img.metadata.height;

  // The lightbox renders outside the RouterProvider, so routing hooks are not
  // available here; the router instance navigates imperatively instead.
  function openPerson(tagId: string) {
    closeLightbox();
    void router.navigate(personDetailPath(tagId));
  }

  return (
    <InfoSection
      standalone={standalone}
      id="people"
      title="People"
      icon={<IconMoodNerd size={18} />}
      badge={<Badge variant="secondary">{faceRegions.length}</Badge>}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <ul className="persons-box">
        {faceRegions.map((region) => {
          const status = faceReviewStatus(region);
          const isIgnored = status === 'unnamed' && region.faceStatus === FaceStatus.Unknown;
          const personName = region.tagId
            ? (personNameById.get(region.tagId) ?? 'Unknown')
            : isIgnored
              ? 'Ignored'
              : 'Unnamed';
          const displayName = status === 'suggested' ? `${personName}?` : personName;
          const suggestedPerson =
            status === 'suggested' && region.tagId
              ? existingPeople.find((person) => person.id === region.tagId)
              : undefined;

          const crop = (
            <img
              className="persons-box__img"
              style={faceCropViewBox(region.areaInfo, imageAspectRatio)}
              src={pathToImageSrc(img.fullPath)}
              alt=""
            />
          );

          return (
            <li
              className={clsx(
                'persons-box__img-container',
                `persons-box__img-container--${status}`,
                assigningId === region.id && 'is-assigning',
              )}
              key={region.id}
              onMouseEnter={() => onFaceHover?.(region.id)}
              onMouseLeave={() => {
                if (assigningIdRef.current !== region.id) onFaceHover?.(null);
              }}
            >
              <div className="persons-box__thumb">
                <AssignFacePopover
                  title={status === 'unnamed' ? 'Name this face' : 'Change person'}
                  existingPeople={existingPeople}
                  existingTags={existingTags}
                  bestMatch={suggestedPerson}
                  onAssignExisting={(tagId) => toastOnError(assignFacesWithUndo([region.id], tagId))}
                  onCreateNew={(name) => toastOnError(createPersonFromFacesWithUndo([region.id], name))}
                  onHide={!isIgnored ? () => hideFacesWithUndo([region.id]) : undefined}
                  onRestore={isIgnored ? () => restoreHiddenFacesWithUndo([region.id]) : undefined}
                  onDiscard={() => discardFacesWithUndo([region.id])}
                  onOpenChange={(open) => {
                    const next = open ? region.id : null;
                    assigningIdRef.current = next;
                    setAssigningId(next);
                    onFaceHover?.(next);
                  }}
                  side="left"
                  align="start"
                >
                  <button
                    type="button"
                    className="persons-box__crop"
                    disabled={!canEditMetadata}
                    title={!canEditMetadata ? METADATA_SCAN_PENDING_MESSAGE : 'Manage face'}
                  >
                    {crop}
                  </button>
                </AssignFacePopover>
              </div>

              {region.tagId ? (
                <button
                  type="button"
                  className={clsx('person-box__display-name', status === 'suggested' && 'text-warning')}
                  onClick={() => openPerson(region.tagId!)}
                >
                  {displayName}
                </button>
              ) : (
                <span className="person-box__display-name text-muted-foreground">{displayName}</span>
              )}
            </li>
          );
        })}
      </ul>
    </InfoSection>
  );
}
