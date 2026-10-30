import { FaceContextTooltip } from '@/components/face-thumbnail/FaceContextTooltip';
import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { SelectionCheck } from '@/components/ui/selection-check';
import { PersonRegion } from '@/db/models/PersonInfo';
import { TagInClient } from '@/db/models/TagDTO';
import { useAppStore } from '@/stores/appState';
import clsx from 'clsx';
import { memo, MouseEvent, useCallback, useRef, useState } from 'react';
import { AssignCardAnchor, AssignFacePopover, AssignPersonOption } from './AssignFacePopover';
import { GRID_ITEM_ATTRIBUTE, useWindowedGrid } from './useWindowedGrid';

/** Same cut-off as the other face grids: below it, windowing costs more than it saves. */
const VIRTUALIZE_THRESHOLD = 120;

type CellProps = {
  region: PersonRegion;
  selected: boolean;
  /** Something is selected, so a click toggles instead of naming. */
  selecting: boolean;
  assigning: boolean;
  onSelectClick: (regionId: string, shift: boolean) => void;
  onAssignAt: (region: PersonRegion, anchor: AssignCardAnchor) => void;
  onOpenPhoto: (region: PersonRegion) => void;
};

/** Cursor position as a zero-size box, for a card opened by right-click. */
function _pointAnchor(x: number, y: number): AssignCardAnchor {
  const rect = DOMRect.fromRect({ x, y, width: 0, height: 0 });
  return { getBoundingClientRect: () => rect };
}

/**
 * An unsorted face. Click names it, the corner circle selects it; once anything
 * is selected a click toggles and Shift+click selects a range. Double-click
 * opens the photo, right-click names it from the cursor.
 */
const UnsortedFaceCell = memo(function UnsortedFaceCell({
  region,
  selected,
  selecting,
  assigning,
  onSelectClick,
  onAssignAt,
  onOpenPhoto,
}: CellProps) {
  const cellRef = useRef<HTMLDivElement>(null);

  function onFaceClick(event: MouseEvent<HTMLButtonElement>) {
    if (selecting || event.shiftKey) {
      onSelectClick(region.id, event.shiftKey);
      return;
    }
    if (cellRef.current) onAssignAt(region, cellRef.current);
  }

  return (
    <li {...{ [GRID_ITEM_ATTRIBUTE]: '' }} className="person-face-item">
      <FaceContextTooltip region={region} suppressed={assigning || selecting}>
        <div
          ref={cellRef}
          className={clsx(
            'person-face-cell unsorted-face-cell',
            selecting && 'is-selection-mode',
            selected && 'is-selected',
            assigning && 'is-assigning',
          )}
        >
          <FaceThumbnail region={region} className="person-face-image" sharp />
          <button
            type="button"
            className="person-face-open"
            aria-label={selecting ? (selected ? 'Deselect face' : 'Select face') : 'Name this face'}
            aria-pressed={selecting ? selected : undefined}
            onClick={onFaceClick}
            onDoubleClick={() => onOpenPhoto(region)}
            onContextMenu={(event) => {
              event.preventDefault();
              onAssignAt(region, _pointAnchor(event.clientX, event.clientY));
            }}
          />
          <button
            type="button"
            className="unsorted-face-select"
            aria-label={selected ? 'Deselect face' : 'Select face'}
            aria-pressed={selected}
            onClick={(event) => onSelectClick(region.id, event.shiftKey)}
          >
            <SelectionCheck selected={selected} />
          </button>
        </div>
      </FaceContextTooltip>
    </li>
  );
});

type UnsortedFacesGridProps = {
  regions: PersonRegion[];
  existingPeople: AssignPersonOption[];
  existingTags: TagInClient[];
  selectedIds: ReadonlySet<string>;
  onSelectClick: (regionId: string, shift: boolean) => void;
  onAssign: (regionId: string, tagId: string) => void | Promise<void>;
  onCreate: (regionId: string, name: string) => void | Promise<void>;
  onHide: (regionId: string) => void | Promise<void>;
  onDiscard: (regionId: string) => void | Promise<void>;
  onOpenPhoto: (region: PersonRegion) => void;
};

/**
 * The Unsorted faces grid. One assignment card is shared by every cell and
 * anchored to whichever face opened it, so a large grid mounts a single popover.
 */
export function UnsortedFacesGrid({
  regions,
  existingPeople,
  existingTags,
  selectedIds,
  onSelectClick,
  onAssign,
  onCreate,
  onHide,
  onDiscard,
  onOpenPhoto,
}: UnsortedFacesGridProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const galleryThumbnailSize = useAppStore((state) => state.galleryThumbnailSize);
  // Kept after closing so the card keeps its content while it animates out.
  const [assigning, setAssigning] = useState<{ region: PersonRegion; anchor: AssignCardAnchor } | null>(null);
  const [cardOpen, setCardOpen] = useState(false);

  const { start, end, topSpacer, bottomSpacer } = useWindowedGrid(
    listRef,
    regions.length,
    regions.length > VIRTUALIZE_THRESHOLD,
    galleryThumbnailSize,
  );

  const assignAt = useCallback((region: PersonRegion, anchor: AssignCardAnchor) => {
    setAssigning({ region, anchor });
    setCardOpen(true);
  }, []);
  const openPhoto = useCallback(
    (region: PersonRegion) => {
      setCardOpen(false);
      onOpenPhoto(region);
    },
    [onOpenPhoto],
  );

  const selecting = selectedIds.size > 0;
  const region = assigning?.region;

  return (
    <>
      <ul className="person-faces-grid" ref={listRef}>
        {topSpacer > 0 && <li aria-hidden style={{ gridColumn: '1 / -1', height: topSpacer }} />}
        {regions.slice(start, end).map((cellRegion) => (
          <UnsortedFaceCell
            key={cellRegion.id}
            region={cellRegion}
            selected={selectedIds.has(cellRegion.id)}
            selecting={selecting}
            assigning={cardOpen && region?.id === cellRegion.id}
            onSelectClick={onSelectClick}
            onAssignAt={assignAt}
            onOpenPhoto={openPhoto}
          />
        ))}
        {bottomSpacer > 0 && <li aria-hidden style={{ gridColumn: '1 / -1', height: bottomSpacer }} />}
      </ul>
      {region && (
        <AssignFacePopover
          open={cardOpen}
          onOpenChange={setCardOpen}
          anchor={assigning.anchor}
          region={region}
          side="right"
          existingPeople={existingPeople}
          existingTags={existingTags}
          onAssignExisting={(tagId) => onAssign(region.id, tagId)}
          onCreateNew={(name) => onCreate(region.id, name)}
          onHide={() => onHide(region.id)}
          onDiscard={() => onDiscard(region.id)}
          onOpenPhoto={() => openPhoto(region)}
        />
      )}
    </>
  );
}
