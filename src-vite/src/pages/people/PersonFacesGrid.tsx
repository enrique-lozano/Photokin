import { FaceContextTooltip } from '@/components/face-thumbnail/FaceContextTooltip';
import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { PersonRegion } from '@/db/models/PersonInfo';
import { TagInClient } from '@/db/models/TagDTO';
import { useAppStore } from '@/stores/appState';
import clsx from 'clsx';
import { memo, useRef, useState } from 'react';
import { AssignFacePopover, AssignPersonOption } from './AssignFacePopover';
import { GRID_ITEM_ATTRIBUTE, useWindowedGrid } from './useWindowedGrid';

/**
 * Below this many faces the whole grid is cheaper to render than to window, and
 * the small surfaces (a photo's faces in the lightbox) stay untouched.
 */
const VIRTUALIZE_THRESHOLD = 120;

type FaceGridItemProps = {
  region: PersonRegion;
  existingPeople: AssignPersonOption[];
  existingTags: TagInClient[];
  onReject: (regionId: string) => void;
  onHide?: (regionId: string) => void;
  onRestore?: (regionId: string) => void;
  onAssign: (regionId: string, tagId: string) => void;
  onCreate: (regionId: string, name: string) => void;
  onSetProfilePhoto?: (regionId: string) => Promise<void>;
  contextPreview: boolean;
};

/** A single face crop. The crop opens the assignment card. */
const FaceGridItem = memo(function FaceGridItem({
  region,
  existingPeople,
  existingTags,
  onReject,
  onHide,
  onRestore,
  onAssign,
  onCreate,
  onSetProfilePhoto,
  contextPreview,
}: FaceGridItemProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const actionLabel = region.confirmed ? 'Change person' : 'Name this face';

  const cell = (
    <div className={clsx('person-face-cell', pickerOpen && 'is-assigning')}>
      <FaceThumbnail region={region} className="person-face-image" sharp />
      <AssignFacePopover
        title={actionLabel}
        existingPeople={existingPeople}
        existingTags={existingTags}
        onAssignExisting={(tagId) => onAssign(region.id, tagId)}
        onCreateNew={(newName) => onCreate(region.id, newName)}
        onDiscard={() => onReject(region.id)}
        onHide={onHide ? () => onHide(region.id) : undefined}
        onRestore={onRestore ? () => onRestore(region.id) : undefined}
        onSetProfilePhoto={onSetProfilePhoto ? () => onSetProfilePhoto(region.id) : undefined}
        onOpenChange={setPickerOpen}
        side="right"
      >
        <button type="button" className="person-face-open" aria-label={actionLabel} />
      </AssignFacePopover>
    </div>
  );

  return (
    <li {...{ [GRID_ITEM_ATTRIBUTE]: '' }} className="person-face-item">
      {contextPreview ? (
        <FaceContextTooltip region={region} suppressed={pickerOpen}>
          {cell}
        </FaceContextTooltip>
      ) : (
        cell
      )}
    </li>
  );
});

type PersonFacesGridProps = {
  regions: PersonRegion[];
  existingPeople: AssignPersonOption[];
  existingTags: TagInClient[];
  onReject: (regionId: string) => void;
  onHide?: (regionId: string) => void;
  onRestore?: (regionId: string) => void;
  onAssign: (regionId: string, tagId: string) => void;
  onCreate: (regionId: string, name: string) => void;
  onSetProfilePhoto?: (regionId: string) => Promise<void>;
  /**
   * Whether hovering a face reveals its full photo for context. On by default;
   * turned off where the whole photo is already visible (e.g. the lightbox).
   */
  contextPreview?: boolean;
};

/**
 * Grid of face crops shared by every face surface (a person's faces, the photo
 * drawer, unknown faces). The crop opens the assignment card.
 *
 * Large grids (the unverified review page can hold tens of thousands of faces)
 * only mount the rows around the viewport; see {@link useWindowedGrid}.
 */
export function PersonFacesGrid({
  regions,
  existingPeople,
  existingTags,
  onReject,
  onHide,
  onRestore,
  onAssign,
  onCreate,
  onSetProfilePhoto,
  contextPreview = true,
}: PersonFacesGridProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const galleryThumbnailSize = useAppStore((state) => state.galleryThumbnailSize);

  const { start, end, topSpacer, bottomSpacer } = useWindowedGrid(
    listRef,
    regions.length,
    regions.length > VIRTUALIZE_THRESHOLD,
    galleryThumbnailSize,
  );

  return (
    <ul className="person-faces-grid" ref={listRef}>
      {topSpacer > 0 && <li aria-hidden style={{ gridColumn: '1 / -1', height: topSpacer }} />}
      {regions.slice(start, end).map((region) => (
        <FaceGridItem
          key={region.id}
          region={region}
          existingPeople={existingPeople}
          existingTags={existingTags}
          onReject={onReject}
          onHide={onHide}
          onRestore={onRestore}
          onAssign={onAssign}
          onCreate={onCreate}
          onSetProfilePhoto={onSetProfilePhoto}
          contextPreview={contextPreview}
        />
      ))}
      {bottomSpacer > 0 && <li aria-hidden style={{ gridColumn: '1 / -1', height: bottomSpacer }} />}
    </ul>
  );
}
