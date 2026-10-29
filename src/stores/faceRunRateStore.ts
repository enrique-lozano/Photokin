import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * How fast face runs actually went on *this* computer, so the confirmation
 * dialog can estimate from measurements instead of a hardcoded guess: the same
 * library takes minutes on a laptop CPU and seconds on a fast desktop, and no
 * constant baked into the UI can know which one it is running on.
 *
 * Rates are marginal — the one-off sidecar spawn and model load are modelled
 * separately by {@link FACE_RUN_STARTUP_SECONDS} — so a 250-photo test run
 * measures the same per-photo cost a whole-library run would.
 */
export type FaceRunRates = {
  /**
   * Seconds per photo for a find run at the default face size, or `null` until
   * one has been measured. Runs at other sizes are normalized by their relative
   * cost before being blended in, so one rate serves every size.
   */
  secondsPerPhoto: number | null;
  /** Seconds per face for a match run, or `null` until one has been measured. */
  secondsPerFace: number | null;
};

/** Sidecar spawn + model load, paid once per run whatever its size. */
export const FACE_RUN_STARTUP_SECONDS = 5;

/**
 * First-run fallbacks, deliberately on the slow side: an estimate that turns
 * out short is the one that makes people close the app mid-run. They are only
 * used until the first real measurement replaces them.
 */
const DEFAULT_SECONDS_PER_PHOTO = 0.5;
const DEFAULT_SECONDS_PER_FACE = 0.02;

/** Runs below these sizes are mostly startup cost, so they measure nothing useful. */
const MIN_PHOTOS_TO_MEASURE = 20;
const MIN_FACES_TO_MEASURE = 50;

/** Weight of the newest sample, favouring recent runs without chasing one outlier. */
const SAMPLE_WEIGHT = 0.6;

type FaceRunRateStore = FaceRunRates & {
  recordFindRun: (photos: number, elapsedSeconds: number, relativeCost: number) => void;
  recordMatchRun: (faces: number, elapsedSeconds: number) => void;
};

function _blend(previous: number | null, sample: number): number {
  if (previous === null) return sample;
  return previous * (1 - SAMPLE_WEIGHT) + sample * SAMPLE_WEIGHT;
}

/** Per-unit cost with the fixed startup removed, or `null` for a run too small to learn from. */
function _marginalRate(units: number, elapsedSeconds: number, minUnits: number): number | null {
  if (units < minUnits || elapsedSeconds <= 0) return null;
  return Math.max(elapsedSeconds - FACE_RUN_STARTUP_SECONDS, 0.1) / units;
}

export const useFaceRunRateStore = create<FaceRunRateStore>()(
  persist(
    (set) => ({
      secondsPerPhoto: null,
      secondsPerFace: null,
      recordFindRun: (photos, elapsedSeconds, relativeCost) => {
        const sample = _marginalRate(photos, elapsedSeconds, MIN_PHOTOS_TO_MEASURE);
        if (sample === null) return;
        set((state) => ({ secondsPerPhoto: _blend(state.secondsPerPhoto, sample / relativeCost) }));
      },
      recordMatchRun: (faces, elapsedSeconds) => {
        const sample = _marginalRate(faces, elapsedSeconds, MIN_FACES_TO_MEASURE);
        if (sample === null) return;
        set((state) => ({ secondsPerFace: _blend(state.secondsPerFace, sample) }));
      },
    }),
    { name: 'photokin-face-run-rates' },
  ),
);

export type FaceRunEstimate = {
  seconds: number;
  /** False while the estimate still rests on the defaults above. */
  measured: boolean;
};

export function estimateFindSeconds(
  photos: number,
  rates: FaceRunRates,
  relativeCost: number,
): FaceRunEstimate {
  const rate = (rates.secondsPerPhoto ?? DEFAULT_SECONDS_PER_PHOTO) * relativeCost;

  return {
    seconds: FACE_RUN_STARTUP_SECONDS + photos * rate,
    measured: rates.secondsPerPhoto !== null,
  };
}

/**
 * Matching is linear in the faces it re-checks, but the grouping pass that
 * follows compares every remaining unknown face with every other one. A rate
 * measured at roughly today's face count carries that cost; an estimate for a
 * library that just grew by thousands of faces will read short until the next
 * run re-measures it.
 */
export function estimateMatchSeconds(faces: number, rates: FaceRunRates): FaceRunEstimate {
  const rate = rates.secondsPerFace ?? DEFAULT_SECONDS_PER_FACE;
  return {
    seconds: FACE_RUN_STARTUP_SECONDS + faces * rate,
    measured: rates.secondsPerFace !== null,
  };
}
