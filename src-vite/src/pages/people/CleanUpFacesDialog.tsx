import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RegionsService } from '@/db/api/services/regions.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { PersonRegion } from '@/db/models/PersonInfo';
import { IconGauge, IconInfoCircle, IconZoomOut } from '@tabler/icons-react';
import { ReactNode, useId, useMemo, useState } from 'react';
import { hideFacesWithUndo } from './faceMutations';
import { matchCleanup } from './faceCleanup';

const DEFAULT_MIN_SIDE_PX = 48;
const DEFAULT_MIN_CONFIDENCE_PERCENT = 60;
const SAMPLE_SIZE = 8;
/** "See all" stops here so a huge match doesn't mount thousands of crops. */
const SEE_ALL_LIMIT = 240;

type CleanUpFacesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The unsorted faces on the page; the clean-up never reaches past them. */
  regions: PersonRegion[];
};

/**
 * Sets aside unsorted faces that are hard to name — too small to recognise, or
 * that the detector wasn't sure about — by moving them to Ignored faces.
 */
export function CleanUpFacesDialog({ open, onOpenChange, regions }: CleanUpFacesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,34rem)]">
        <DialogHeader>
          <DialogTitle>Clean up unsorted faces</DialogTitle>
          <DialogDescription>
            Set aside faces that are hard to name, so the rest are quicker to go through.
          </DialogDescription>
        </DialogHeader>
        {open && <CleanUpBody regions={regions} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CleanUpBody({ regions, onDone }: { regions: PersonRegion[]; onDone: () => void }) {
  const [tooSmall, setTooSmall] = useState(true);
  const [minSidePx, setMinSidePx] = useState(DEFAULT_MIN_SIDE_PX);
  const [unsure, setUnsure] = useState(false);
  const [minConfidencePercent, setMinConfidencePercent] = useState(DEFAULT_MIN_CONFIDENCE_PERCENT);
  const [seeAll, setSeeAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: quality } = useLiveQuery(
    () => RegionsService.getUnsortedFaceQuality(),
    ['tagRegionInfo', 'assets'],
  );
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);
  const faces = useMemo(
    () => (quality ?? []).filter((face) => regionById.has(face.id)),
    [quality, regionById],
  );

  // Only offer a rule the library has data for: faces read from file metadata
  // carry no detector score, and a photo of unknown size has no pixel size.
  const hasSize = faces.some((face) => face.pixelArea !== null);
  const hasScore = faces.some((face) => face.detectionScore !== null);

  const match = useMemo(
    () =>
      matchCleanup(faces, {
        tooSmall: tooSmall && hasSize,
        minSidePx,
        unsure: unsure && hasScore,
        minConfidence: minConfidencePercent / 100,
      }),
    [faces, tooSmall, hasSize, minSidePx, unsure, hasScore, minConfidencePercent],
  );
  const count = match.ids.length;
  const shown = match.ids.slice(0, seeAll ? SEE_ALL_LIMIT : SAMPLE_SIZE);
  const facesLabel = `${count.toLocaleString()} ${count === 1 ? 'face' : 'faces'}`;

  async function ignore() {
    setBusy(true);
    await hideFacesWithUndo(match.ids);
    onDone();
  }

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        {quality === null ? (
          <p className="face-cleanup__note">Checking faces…</p>
        ) : !hasSize && !hasScore ? (
          <p className="face-cleanup__note">
            These faces have no size or detection details to go by. Run Detect faces to measure them.
          </p>
        ) : (
          <>
            <div className="face-cleanup__rules">
              <p className="face-cleanup__label">Ignore faces that are</p>
              {hasSize && (
                <CleanupRule
                  icon={<IconZoomOut size={18} />}
                  name="Too small"
                  checked={tooSmall}
                  onCheckedChange={setTooSmall}
                  count={match.tooSmallCount}
                  title="Side of the face box in the original photo, in pixels"
                >
                  smaller than
                  <NumberField
                    value={minSidePx}
                    min={1}
                    max={2000}
                    onChange={setMinSidePx}
                    label="Smallest face size"
                  />
                  px
                </CleanupRule>
              )}
              {hasScore && (
                <CleanupRule
                  icon={<IconGauge size={18} />}
                  name="Unsure"
                  checked={unsure}
                  onCheckedChange={setUnsure}
                  count={match.unsureCount}
                  title="How sure the face detector was that this is a face. Faces read from file metadata have no score and are never counted."
                >
                  detection confidence under
                  <NumberField
                    value={minConfidencePercent}
                    min={1}
                    max={100}
                    onChange={setMinConfidencePercent}
                    label="Lowest detection confidence"
                  />
                  %
                </CleanupRule>
              )}
            </div>

            <div className="face-cleanup__preview">
              <p className="face-cleanup__summary">
                {count === 0 ? (
                  'No faces match.'
                ) : (
                  <>
                    <strong>{facesLabel}</strong> will be ignored{seeAll ? '' : ' — a sample'}
                  </>
                )}
              </p>
              {count > 0 && (
                <div className={seeAll ? 'face-cleanup__strip is-expanded' : 'face-cleanup__strip'}>
                  {shown.map((id) => (
                    <FaceThumbnail key={id} region={regionById.get(id)} className="face-cleanup__face" />
                  ))}
                  {!seeAll && count > SAMPLE_SIZE && (
                    <Button
                      variant="link"
                      size="sm"
                      className="face-cleanup__see-all"
                      onClick={() => setSeeAll(true)}
                    >
                      See all
                    </Button>
                  )}
                </div>
              )}
              {seeAll && count > SEE_ALL_LIMIT && (
                <p className="face-cleanup__note">
                  Showing the first {SEE_ALL_LIMIT.toLocaleString()} of {count.toLocaleString()}.
                </p>
              )}
            </div>
          </>
        )}

        <p className="face-cleanup__info">
          <IconInfoCircle size={16} aria-hidden />
          Nothing is deleted. They move to Ignored faces (Hidden), and you can bring any of them back from
          there.
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={count === 0} isLoading={busy} onClick={() => void ignore()}>
          Ignore {facesLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

function CleanupRule({
  icon,
  name,
  checked,
  onCheckedChange,
  count,
  title,
  children,
}: {
  icon: ReactNode;
  name: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  count: number;
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={checked ? 'face-cleanup__rule is-checked' : 'face-cleanup__rule'}>
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <span className="face-cleanup__rule-icon" aria-hidden>
        {icon}
      </span>
      <label htmlFor={id} className="face-cleanup__rule-name" title={title}>
        {name}
      </label>
      <span className="face-cleanup__rule-detail">{children}</span>
      <span className="face-cleanup__rule-count" title={`${count.toLocaleString()} faces`}>
        {count.toLocaleString()}
      </span>
    </div>
  );
}

function NumberField({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      className="face-cleanup__value"
      aria-label={label}
      min={min}
      max={max}
      value={value}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
      }}
    />
  );
}
