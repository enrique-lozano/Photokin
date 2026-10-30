import { FaceContextTooltip } from '@/components/face-thumbnail/FaceContextTooltip';
import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { Button } from '@/components/ui/button';
import { SelectionCheck } from '@/components/ui/selection-check';
import { PersonRegion } from '@/db/models/PersonInfo';
import { IconChecks, IconX } from '@tabler/icons-react';
import clsx from 'clsx';
import { ReactNode } from 'react';

type FaceSelectionGridProps = {
  regions: PersonRegion[];
  selectedIds: string[];
  onSelectedIdsChange: (regionIds: string[]) => void;
  /** Freezes the selection, for while the action on it is running. */
  readOnly?: boolean;
  /** Marks each unselected face with what will happen to it. */
  unselectedBadge?: ReactNode;
};

/**
 * Selectable grid of face crops shared by the review modals: click a face to
 * keep or drop it, hover one to see the whole photo it was detected in.
 */
export function FaceSelectionGrid({
  regions,
  selectedIds,
  onSelectedIdsChange,
  readOnly = false,
  unselectedBadge,
}: FaceSelectionGridProps) {
  const allSelected = regions.length > 0 && selectedIds.length === regions.length;

  function toggle(regionId: string) {
    onSelectedIdsChange(
      selectedIds.includes(regionId)
        ? selectedIds.filter((id) => id !== regionId)
        : [...selectedIds, regionId],
    );
  }

  function toggleSelectAll() {
    onSelectedIdsChange(allSelected ? [] : regions.map((region) => region.id));
  }

  return (
    <>
      <div className="suggestions-modal-toolbar">
        <span className="text-sm text-muted-foreground">
          {selectedIds.length} of {regions.length} selected
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={toggleSelectAll}
          disabled={readOnly || regions.length === 0}
        >
          {allSelected ? <IconX size={16} /> : <IconChecks size={16} />}
          {allSelected ? 'Deselect all' : 'Select all'}
        </Button>
      </div>

      <ul className="suggestions-modal-grid">
        {regions.map((region) => {
          const selected = selectedIds.includes(region.id);
          return (
            <li key={region.id}>
              <FaceContextTooltip region={region}>
                <button
                  type="button"
                  className={clsx('suggestions-modal-face', selected && 'selected')}
                  onClick={() => toggle(region.id)}
                  disabled={readOnly}
                >
                  <FaceThumbnail region={region} className="suggestions-modal-face-image" sharp />
                  <span className="suggestions-modal-check">
                    <SelectionCheck selected={selected} />
                  </span>
                  {!selected && unselectedBadge && (
                    <span className="suggestions-modal-fate">{unselectedBadge}</span>
                  )}
                </button>
              </FaceContextTooltip>
            </li>
          );
        })}
      </ul>
    </>
  );
}
