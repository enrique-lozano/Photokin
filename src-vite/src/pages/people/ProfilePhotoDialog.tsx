import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { PersonRegion } from '@/db/models/PersonInfo';
import { FaceStatus } from '@/db/models/TagRegionInfoDTO';
import { IconCheck, IconPhoto, IconRestore } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { changeProfilePhoto } from './profilePhoto';
import { GRID_ITEM_ATTRIBUTE, useWindowedGrid } from './useWindowedGrid';
import './profilePhoto.css';

type ProfilePhotoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  personName: string;
  regions: PersonRegion[];
  profileRegionId: string | null;
  representativeRegionId?: string;
};

export function ProfilePhotoDialog({
  open,
  onOpenChange,
  personId,
  personName,
  regions,
  profileRegionId,
  representativeRegionId,
}: ProfilePhotoDialogProps) {
  const [saving, setSaving] = useState(false);
  const choices = regions.filter(
    (region) =>
      region.tagId === personId &&
      region.confirmed &&
      region.faceStatus === FaceStatus.Confirmed &&
      region.path,
  );

  async function select(regionId: string | null) {
    if (saving) return;
    setSaving(true);
    try {
      await changeProfilePhoto(personId, regionId);
      onOpenChange(false);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Change profile photo</DialogTitle>
          <DialogDescription>
            Choose a confirmed face for {personName}. This only changes their portrait in Photokin, not your
            original photos.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {choices.length > 0 ? (
            <ProfilePhotoGrid
              regions={choices}
              selectedId={representativeRegionId ?? profileRegionId}
              saving={saving}
              onSelect={(regionId) => void select(regionId)}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
              <IconPhoto size={32} aria-hidden />
              <p>Confirm a face to choose a profile photo.</p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={saving || !profileRegionId} onClick={() => void select(null)}>
            <IconRestore size={16} aria-hidden />
            Use automatic photo
          </Button>
          <Button variant="secondary" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProfilePhotoGrid({
  regions,
  selectedId,
  saving,
  onSelect,
}: {
  regions: PersonRegion[];
  selectedId: string | null;
  saving: boolean;
  onSelect: (regionId: string) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const { start, end, topSpacer, bottomSpacer } = useWindowedGrid(
    listRef,
    regions.length,
    regions.length > 120,
  );

  return (
    <ul ref={listRef} className="profile-photo-grid" aria-label="Confirmed faces" aria-busy={saving}>
      {topSpacer > 0 && <li aria-hidden style={{ gridColumn: '1 / -1', height: topSpacer }} />}
      {regions.slice(start, end).map((region, index) => {
        const selected = region.id === selectedId;
        return (
          <li key={region.id} {...{ [GRID_ITEM_ATTRIBUTE]: '' }}>
            <button
              type="button"
              className="profile-photo-option"
              aria-label={`Use face ${start + index + 1} as profile photo`}
              aria-pressed={selected}
              disabled={saving}
              onClick={() => onSelect(region.id)}
            >
              <FaceThumbnail region={region} sharp />
              {selected && (
                <span className="profile-photo-option__check">
                  <IconCheck size={16} aria-hidden />
                </span>
              )}
            </button>
          </li>
        );
      })}
      {bottomSpacer > 0 && <li aria-hidden style={{ gridColumn: '1 / -1', height: bottomSpacer }} />}
    </ul>
  );
}
