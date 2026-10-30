import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleChevron,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogBody,
  DialogCancel,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { InfoHint } from '@/components/ui/infoHint';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { SplitButton, SplitButtonMain, SplitButtonMenu } from '@/components/ui/split-button';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlbumsService } from '@/db/api/services/albums.service';
import { AssetsService } from '@/db/api/services/assets.service';
import { RegionsService } from '@/db/api/services/regions.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { clearReferenceFaceEmbeddings } from '@/media/faces/faceEmbeddingStore';
import {
  FACE_DETECTION_SIZES,
  FaceDetectionSize,
  FaceRecognitionOptions,
  faceRecognitionOptionsFrom,
  isFaceDetectionSize,
} from '@/media/faces/faceRecognition';
import {
  estimateFindSeconds,
  estimateMatchSeconds,
  FaceRunEstimate,
  useFaceRunRateStore,
} from '@/stores/faceRunRateStore';
import { DEFAULT_FACE_SCAN_SETTINGS, useFaceScanSettingsStore } from '@/stores/faceScanSettingsStore';
import { ProcessKind, useProcessStore } from '@/stores/processStore';
import { IconAlertTriangle, IconCopy, IconRefresh, IconScan, IconSettings } from '@tabler/icons-react';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { AlbumScopePicker } from './AlbumScopePicker';
import { buildFaceScanSearchQuery, useFaceScanActions } from './useFaceScanActions';

const TEST_SCAN_SIZE = 250;
const TEST_SCAN_THRESHOLD = 1000;

/** Lets empty states open the Find faces dialog that lives in the page header. */
const useFindFacesDialogStore = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

function _useFaceRunRunning() {
  return useProcessStore((state) =>
    state.processes.some(
      (process) =>
        process.status === 'running' &&
        (process.kind === ProcessKind.FaceDetect || process.kind === ProcessKind.FaceRecognize),
    ),
  );
}

/** A "Find faces" button for empty states; it opens the header's dialog. */
export function FindFacesButton() {
  const running = _useFaceRunRunning();
  const setOpen = useFindFacesDialogStore((state) => state.setOpen);

  return (
    <Button variant="outline" disabled={running} onClick={() => setOpen(true)}>
      <IconScan size={16} />
      {running ? 'Finding faces…' : 'Find faces'}
    </Button>
  );
}

type RunMode = 'full' | 'test' | 'recognize';

const FACE_SIZE_OPTIONS: { value: FaceDetectionSize; label: string }[] = [
  { value: FaceDetectionSize.Tiny, label: 'Tiny · slowest' },
  { value: FaceDetectionSize.Small, label: 'Small · default' },
  { value: FaceDetectionSize.Medium, label: 'Medium · ~2× faster' },
  { value: FaceDetectionSize.Large, label: 'Large · ~3× faster' },
];

/**
 * How far a measured / unmeasured estimate is spread before being shown. Kept
 * narrow on purpose: the point is to set expectations, and a range so wide that
 * it covers every outcome tells the reader nothing.
 */
const MEASURED_SPREAD = { low: 0.85, high: 1.15 };
const UNMEASURED_SPREAD = { low: 0.75, high: 1.25 };

/** Rounds to a step that suits the magnitude, so bounds read as estimates rather than measurements. */
function roundToStep(value: number): number {
  const step = value < 10 ? 1 : value < 100 ? 5 : 10;
  return Math.max(step, Math.round(value / step) * step);
}

/**
 * Estimates are shown as a range: a single number reads as a promise, and the
 * cost of a run swings with photo size, faces per photo and what else the
 * machine is doing. The range narrows once a real run has been measured.
 */
function formatEstimate({ seconds, measured }: FaceRunEstimate): string {
  const spread = measured ? MEASURED_SPREAD : UNMEASURED_SPREAD;
  const high = seconds * spread.high;

  const unit = high < 90 ? 's' : 'min';
  const scale = unit === 's' ? 1 : 60;
  const lowValue = roundToStep((seconds * spread.low) / scale);
  const highValue = Math.max(lowValue, roundToStep(high / scale));

  return lowValue === highValue ? `~${lowValue} ${unit}` : `${lowValue}–${highValue} ${unit}`;
}

function estimateHint({ measured }: FaceRunEstimate): string {
  return measured
    ? 'Estimated from how long your last run took on this computer.'
    : 'Rough first guess — the estimate gets accurate once you have run this once.';
}

function SliderSetting({
  label,
  info,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  info: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="scan-options-slider">
      <div className="scan-options-slider-header">
        <span className="scan-options-slider-label">
          {label}
          <InfoHint>{info}</InfoHint>
        </span>
        <span className="scan-options-slider-value">{display}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
        aria-label={label}
        className="grow"
      />
    </div>
  );
}

function FaceSizeSetting() {
  const { faceDetectionSize, setFaceDetectionSize } = useFaceScanSettingsStore();

  return (
    <div className="scan-options-slider">
      <div className="scan-options-slider-header">
        <span className="scan-options-slider-label">
          Smallest face
          <InfoHint>
            How small a face can be and still be found. Tiny also finds faces far in the background and in
            large group photos, but is the slowest. Medium and Large are much faster and skip only small
            background faces, which rarely make good matches anyway. Close-ups and portraits are found at
            every size.
          </InfoHint>
        </span>
        <Select
          value={faceDetectionSize}
          onValueChange={(value) => {
            if (isFaceDetectionSize(value)) setFaceDetectionSize(value);
          }}
        >
          <SelectTrigger
            size="sm"
            optionLabels={FACE_SIZE_OPTIONS.map((option) => option.label)}
            aria-label="Smallest face"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FACE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** Slider bounds, as percent. Min + max must stay 100 so the shown value is the cosine similarity (1 - stored distance). */
const MATCH_SIMILARITY_MIN = 20;
const MATCH_SIMILARITY_MAX = 80;

function matchSimilarityPercent(matchMaxDistance: number): number {
  return MATCH_SIMILARITY_MIN + MATCH_SIMILARITY_MAX - Math.round(matchMaxDistance * 100);
}

function matchMaxDistanceFromSimilarity(similarity: number): number {
  return (MATCH_SIMILARITY_MIN + MATCH_SIMILARITY_MAX - similarity) / 100;
}

function CommonFaceSettings({ showDetection }: { showDetection: boolean }) {
  const { matchMaxDistance, knownEmbeddingsPerTag, setMatchMaxDistance, setKnownEmbeddingsPerTag } =
    useFaceScanSettingsStore();
  const { minFaceConfidence, setMinFaceConfidence } = useFaceScanSettingsStore();

  return (
    <>
      {showDetection && (
        <>
          <p className="scan-options-group-label">Detection</p>
          <FaceSizeSetting />
          <SliderSetting
            label="Face sensitivity"
            info="Minimum confidence the detector needs before it accepts a region as a face. Higher values reject blurry or ambiguous detections."
            value={Math.round(minFaceConfidence * 100)}
            min={50}
            max={99}
            step={1}
            display={`${Math.round(minFaceConfidence * 100)}%`}
            onChange={(value) => setMinFaceConfidence(value / 100)}
          />
        </>
      )}
      <p className="scan-options-group-label">Matching</p>
      <SliderSetting
        label="Required similarity"
        info="How similar a face must be to a named person before it is suggested. Higher values reduce incorrect suggestions but may miss some correct matches. Used whenever faces are recognized."
        value={matchSimilarityPercent(matchMaxDistance)}
        min={MATCH_SIMILARITY_MIN}
        max={MATCH_SIMILARITY_MAX}
        step={1}
        display={`${matchSimilarityPercent(matchMaxDistance)}%`}
        onChange={(value) => setMatchMaxDistance(matchMaxDistanceFromSimilarity(value))}
      />
      <SliderSetting
        label="Reference faces per person"
        info="Each named person is matched using up to this many confirmed faces as reference examples. More references can improve accuracy but make matching slower."
        value={knownEmbeddingsPerTag}
        min={4}
        max={25}
        step={1}
        display={`${knownEmbeddingsPerTag}`}
        onChange={setKnownEmbeddingsPerTag}
      />
    </>
  );
}

/**
 * Hero action for the People pages: one "Find faces" button that always
 * confirms, plus the secondary face actions behind its chevron. Every page
 * gets the same set — which run modes are offered depends on the library
 * (how many photos are in scope, how many faces are waiting), never on which
 * page the button happens to sit in.
 */
export function FaceActionsBar() {
  const { findFaces, recognizeFaces } = useFaceScanActions();
  const [runningAction, setRunningAction] = useState<RunMode | null>(null);
  const dialogOpen = useFindFacesDialogStore((state) => state.open);
  const setDialogOpen = useFindFacesDialogStore((state) => state.setOpen);
  const [mode, setMode] = useState<RunMode>('full');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const faceRunRunning = _useFaceRunRunning();
  const recognizeRunning = useProcessStore((state) =>
    state.processes.some(
      (process) => process.status === 'running' && process.kind === ProcessKind.FaceRecognize,
    ),
  );

  const {
    faceDetectionSize,
    minFaceConfidence,
    knownEmbeddingsPerTag,
    matchMaxDistance,
    scanAlbumIds,
    scanIncludeSubAlbums,
    setScanAlbumIds,
    setScanIncludeSubAlbums,
    resetRecognitionSettings,
  } = useFaceScanSettingsStore();

  const { data: albums } = useLiveQuery(
    () => (dialogOpen ? AlbumsService.getAll() : Promise.resolve(null)),
    ['albums'],
    { extDependencies: [dialogOpen] },
  );

  // The persisted scope can outlive its albums (deleted, or library re-imported).
  useEffect(() => {
    if (!albums) return;
    const existing = new Set(albums.map((album) => album.id));
    const valid = scanAlbumIds.filter((id) => existing.has(id));
    if (valid.length !== scanAlbumIds.length) setScanAlbumIds(valid);
  }, [albums, scanAlbumIds, setScanAlbumIds]);

  const { data: facesToMatch } = useLiveQuery(
    () => RegionsService.getUnconfirmedRegionCount(),
    ['tagRegionInfo'],
  );
  const scopeDependency = scanAlbumIds.join(',');
  const { data: photoCount, loading: photoCountLoading } = useLiveQuery(
    async () => {
      if (!dialogOpen) return null;
      const searchQuery = await buildFaceScanSearchQuery({
        albumIds: scanAlbumIds,
        includeSubAlbums: scanIncludeSubAlbums,
      });
      return AssetsService.getCount({ searchQuery });
    },
    ['assets', 'albums'],
    { extDependencies: [dialogOpen, scopeDependency, scanIncludeSubAlbums] },
  );

  const options = useMemo<FaceRecognitionOptions>(
    () =>
      faceRecognitionOptionsFrom({
        faceDetectionSize,
        minFaceConfidence,
        knownEmbeddingsPerTag,
        matchMaxDistance,
      }),
    [faceDetectionSize, knownEmbeddingsPerTag, minFaceConfidence, matchMaxDistance],
  );

  const isBusy = runningAction !== null || faceRunRunning;
  const count = photoCount ?? 0;
  const unmatchedFaces = facesToMatch ?? 0;
  const canMatch = unmatchedFaces > 0;
  const showTest = count > TEST_SCAN_THRESHOLD;
  const scopeAlbumCount = scanAlbumIds.length || (albums?.length ?? 0);

  // Selected field by field: a selector returning a fresh object would give
  // `useSyncExternalStore` a new snapshot on every render.
  const secondsPerPhoto = useFaceRunRateStore((state) => state.secondsPerPhoto);
  const secondsPerFace = useFaceRunRateStore((state) => state.secondsPerFace);
  const rates = { secondsPerPhoto, secondsPerFace };
  const findCost = FACE_DETECTION_SIZES[faceDetectionSize].relativeCost;
  const fullEstimate = estimateFindSeconds(count, rates, findCost);
  const testEstimate = estimateFindSeconds(Math.min(TEST_SCAN_SIZE, count), rates, findCost);
  const matchEstimate = estimateMatchSeconds(unmatchedFaces, rates);

  // A mode the library no longer offers must not stay selected behind the
  // scenes, or Start would run something the dialog stopped showing.
  useEffect(() => {
    if (mode === 'test' && !photoCountLoading && !showTest) setMode('full');
    if (mode === 'recognize' && !canMatch) setMode('full');
  }, [canMatch, mode, photoCountLoading, showTest]);

  async function run(action: RunMode) {
    setRunningAction(action);
    try {
      if (action === 'full' || action === 'test') {
        await findFaces(options, {
          albumIds: scanAlbumIds,
          includeSubAlbums: scanIncludeSubAlbums,
          sampleSize: action === 'test' ? TEST_SCAN_SIZE : undefined,
        });
      } else {
        await recognizeFaces(options);
      }
    } finally {
      setRunningAction(null);
    }
  }

  // Every opening starts on the default mode, whoever opened it.
  useEffect(() => {
    if (dialogOpen) setMode('full');
  }, [dialogOpen]);

  // An open request must not outlive the page, or the next one would pop it up.
  useEffect(() => () => setDialogOpen(false), [setDialogOpen]);

  function openDialog() {
    setDialogOpen(true);
  }

  function startSelectedMode() {
    setDialogOpen(false);
    void run(mode);
  }

  async function resetFaceReferences() {
    try {
      await clearReferenceFaceEmbeddings();
      toast.success('Face references reset', {
        description: 'They will be rebuilt the next time faces are matched.',
      });
    } catch (error) {
      toast.error(`Could not reset face references: ${String(error)}`);
    }
  }

  const runningLabel =
    runningAction === 'recognize' || recognizeRunning
      ? 'Recognizing faces…'
      : runningAction || faceRunRunning
        ? 'Finding faces…'
        : 'Find faces';

  const matchItem = (
    <DropdownMenuItem disabled={!canMatch} onSelect={() => void run('recognize')}>
      <IconRefresh size={16} />
      <span className="flex-1">Recognize faces</span>
      {canMatch && <span className="text-xs text-muted-foreground">{formatEstimate(matchEstimate)}</span>}
    </DropdownMenuItem>
  );

  // The disabled item itself ignores pointer events, so the tooltip hangs off a
  // wrapper — otherwise the one state that needs an explanation cannot show one.
  const matchMenuItem = canMatch ? (
    matchItem
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block">{matchItem}</span>
      </TooltipTrigger>
      <TooltipContent side="left">
        No faces are waiting to be recognized. Find faces first, then recognize them against your named
        people.
      </TooltipContent>
    </Tooltip>
  );

  return (
    <div className="face-actions-bar">
      <SplitButton disabled={isBusy}>
        <SplitButtonMain
          onClick={openDialog}
          tooltip="Detect new faces, suggest who they are, and group the rest"
        >
          <IconScan size={16} />
          {runningLabel}
        </SplitButtonMain>
        <SplitButtonMenu
          tooltip="More face actions"
          ariaLabel="More face actions"
          contentClassName="w-[240px]"
        >
          {matchMenuItem}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void resetFaceReferences()}>
            <IconRefresh size={16} />
            Reset face references
          </DropdownMenuItem>
        </SplitButtonMenu>
      </SplitButton>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="face-scan-dialog w-[min(92vw,33rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <IconScan size={18} className="text-muted-foreground" />
              Find faces
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="face-scan-dialog__body">
            <section className="face-scan-section">
              <p className="face-scan-section__label">What to run</p>
              <div className="face-scan-modes">
                <button
                  type="button"
                  className={clsx('face-scan-mode', mode === 'full' && 'selected')}
                  onClick={() => setMode('full')}
                >
                  <span className="face-scan-mode__icon">
                    <IconScan size={16} />
                  </span>
                  <span className="face-scan-mode__copy">
                    <strong>Detect &amp; recognize</strong>
                    <small>
                      new faces, then suggest people · {count.toLocaleString()} photos in {scopeAlbumCount}{' '}
                      albums
                    </small>
                  </span>
                  <span className="face-scan-mode__time" title={estimateHint(fullEstimate)}>
                    {photoCountLoading ? '…' : formatEstimate(fullEstimate)}
                  </span>
                </button>

                {showTest && (
                  <button
                    type="button"
                    className={clsx('face-scan-mode', mode === 'test' && 'selected')}
                    onClick={() => setMode('test')}
                  >
                    <span className="face-scan-mode__icon">
                      <IconCopy size={16} />
                    </span>
                    <span className="face-scan-mode__copy">
                      <strong>Test run</strong>
                      <small>same settings on {TEST_SCAN_SIZE} random photos</small>
                    </span>
                    <span className="face-scan-mode__time" title={estimateHint(testEstimate)}>
                      {formatEstimate(testEstimate)}
                    </span>
                  </button>
                )}

                {canMatch && (
                  <button
                    type="button"
                    className={clsx('face-scan-mode', mode === 'recognize' && 'selected')}
                    onClick={() => setMode('recognize')}
                  >
                    <span className="face-scan-mode__icon">
                      <IconRefresh size={16} />
                    </span>
                    <span className="face-scan-mode__copy">
                      <strong>Recognize only</strong>
                      <small>no new detection · re-check {unmatchedFaces.toLocaleString()} faces</small>
                    </span>
                    <span className="face-scan-mode__time" title={estimateHint(matchEstimate)}>
                      {formatEstimate(matchEstimate)}
                    </span>
                  </button>
                )}
              </div>
            </section>

            {mode !== 'recognize' && (
              <section className="face-scan-section">
                <p className="face-scan-section__label">Where to look</p>
                <div className="face-scan-scope">
                  <AlbumScopePicker
                    selectedIds={scanAlbumIds}
                    includeSubAlbums={scanIncludeSubAlbums}
                    photoCount={photoCount ?? undefined}
                    onChangeSelected={setScanAlbumIds}
                    onChangeIncludeSubAlbums={setScanIncludeSubAlbums}
                  />
                </div>
                <p className="face-scan-video-note">
                  Videos are excluded. Face detection currently scans photos only.
                </p>
              </section>
            )}

            <Collapsible
              className={clsx('face-scan-advanced', advancedOpen && 'expanded')}
              open={advancedOpen}
              onOpenChange={setAdvancedOpen}
            >
              <CollapsibleTrigger className="face-scan-advanced__trigger">
                <IconSettings size={16} />
                <span>Advanced</span>
                {/* The summary stands in for the panel while it is closed; once the
                    sliders are on screen it would only repeat them. */}
                {!advancedOpen && (
                  <small>
                    {mode === 'recognize'
                      ? ''
                      : `${faceDetectionSize} faces · sensitivity ${Math.round(minFaceConfidence * 100)}% · `}
                    similarity {matchSimilarityPercent(matchMaxDistance)}% · {knownEmbeddingsPerTag} refs
                  </small>
                )}
                <CollapsibleChevron size={14} className="face-scan-advanced__chevron" />
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <div className="face-scan-advanced__content">
                  <CommonFaceSettings showDetection={mode !== 'recognize'} />
                  <Button
                    type="button"
                    variant="link"
                    className="mt-2 h-auto self-start p-0 text-xs"
                    onClick={resetRecognitionSettings}
                    disabled={
                      faceDetectionSize === DEFAULT_FACE_SCAN_SETTINGS.faceDetectionSize &&
                      minFaceConfidence === DEFAULT_FACE_SCAN_SETTINGS.minFaceConfidence &&
                      matchMaxDistance === DEFAULT_FACE_SCAN_SETTINGS.matchMaxDistance &&
                      knownEmbeddingsPerTag === DEFAULT_FACE_SCAN_SETTINGS.knownEmbeddingsPerTag
                    }
                  >
                    Reset to defaults
                  </Button>
                </div>
              </CollapsiblePanel>
            </Collapsible>

            {mode === 'full' && (
              <div className="face-scan-warning">
                <IconAlertTriangle size={16} />
                <span>
                  <strong>Keep app open</strong> while it runs — if you quit, you will have to start again
                  from zero
                </span>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <DialogCancel onClick={() => setDialogOpen(false)}>Cancel</DialogCancel>
            <Button onClick={startSelectedMode}>
              {mode === 'recognize' ? (
                <IconRefresh size={16} />
              ) : mode === 'test' ? (
                <IconCopy size={16} />
              ) : (
                <IconScan size={16} />
              )}
              {mode === 'recognize'
                ? 'Recognize faces'
                : mode === 'test'
                  ? `Run test on ${TEST_SCAN_SIZE}`
                  : 'Find faces'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
