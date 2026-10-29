/**
 * The camera settings the filter drawer's exposure sliders snap to. Each list
 * runs from the slider's left end to its right end; the ends mean "no limit",
 * so photos outside them are still matched while a thumb rests there.
 */
export type ExposureField = 'iso' | 'aperture' | 'shutterSpeed' | 'focalLength';

export const EXPOSURE_STOPS: Record<ExposureField, readonly number[]> = {
  // ⅓-stop ISO scale.
  iso: [
    100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400,
    8000, 10000, 12800, 16000, 20000, 25600,
  ],
  // ⅓-stop f-numbers.
  aperture: [
    1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22,
  ],
  // Full-stop exposure times in milliseconds (the persisted unit), 1/8000 s to 30 s.
  shutterSpeed: [
    0.125, 0.25, 0.5, 1, 2, 4, 8, 16.667, 33.333, 66.667, 125, 250, 500, 1000, 2000, 4000, 8000, 15000, 30000,
  ],
  focalLength: [
    10, 12, 14, 16, 18, 20, 24, 28, 35, 40, 50, 60, 70, 85, 100, 135, 150, 200, 300, 400, 500, 600,
  ],
};

/**
 * Upper edge of every histogram bucket but the last: the geometric midpoint
 * between neighbouring stops, since all four scales are logarithmic.
 */
export function stopBucketBounds(stops: readonly number[]): number[] {
  return stops.slice(1).map((stop, index) => Math.sqrt(stop * stops[index]));
}

/** Index of the stop closest (on a log scale) to `value`. */
export function nearestStopIndex(stops: readonly number[], value: number): number {
  const bounds = stopBucketBounds(stops);
  const index = bounds.findIndex((bound) => value <= bound);
  return index === -1 ? stops.length - 1 : index;
}

export function formatExposureValue(field: ExposureField, value: number): string {
  switch (field) {
    case 'iso':
      return Math.round(value).toLocaleString();
    case 'aperture':
      return `f/${Math.round(value * 10) / 10}`;
    case 'shutterSpeed':
      return value < 1000 ? `1/${Math.round(1000 / value)}` : `${Math.round(value / 100) / 10} s`;
    case 'focalLength':
      return `${Math.round(value)} mm`;
  }
}

/** `null` ends mean "no limit"; returns `null` when neither end is set. */
export function formatExposureRange(
  field: ExposureField,
  [min, max]: readonly [number | null, number | null],
): string | null {
  if (min !== null && max !== null) {
    return `${formatExposureValue(field, min)} – ${formatExposureValue(field, max)}`;
  }
  if (min !== null) return `≥ ${formatExposureValue(field, min)}`;
  if (max !== null) return `≤ ${formatExposureValue(field, max)}`;
  return null;
}

/** Slider thumb positions for a range; open ends rest at the slider's ends. */
export function rangeToStopIndices(
  stops: readonly number[],
  [min, max]: readonly [number | null, number | null],
): [number, number] {
  return [
    min === null ? 0 : nearestStopIndex(stops, min),
    max === null ? stops.length - 1 : nearestStopIndex(stops, max),
  ];
}

/**
 * The range after the slider moved to `indices`. Only the thumbs that moved
 * take a stop's value, so an untouched end keeps an exact typed value; a thumb
 * dropped on its own end means "no limit".
 */
export function stopIndicesToRange(
  stops: readonly number[],
  previous: readonly [number | null, number | null],
  [lowIndex, highIndex]: readonly number[],
): [number | null, number | null] {
  const [previousLow, previousHigh] = rangeToStopIndices(stops, previous);
  const min = lowIndex === previousLow ? previous[0] : lowIndex === 0 ? null : stops[lowIndex];
  const max =
    highIndex === previousHigh ? previous[1] : highIndex === stops.length - 1 ? null : stops[highIndex];
  return [min, max];
}
