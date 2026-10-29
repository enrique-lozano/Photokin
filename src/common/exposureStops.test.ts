import { describe, expect, it } from 'vitest';
import {
  EXPOSURE_STOPS,
  formatExposureRange,
  formatExposureValue,
  nearestStopIndex,
  rangeToStopIndices,
  stopBucketBounds,
  stopIndicesToRange,
} from './exposureStops';

describe('exposure stops', () => {
  it('has one bucket bound between each pair of stops', () => {
    const stops = EXPOSURE_STOPS.aperture;
    const bounds = stopBucketBounds(stops);

    expect(bounds).toHaveLength(stops.length - 1);
    bounds.forEach((bound, index) => {
      expect(bound).toBeGreaterThan(stops[index]);
      expect(bound).toBeLessThan(stops[index + 1]);
    });
  });

  it('snaps values to the nearest stop and clamps outside the scale', () => {
    const iso = EXPOSURE_STOPS.iso;

    expect(nearestStopIndex(iso, 2000)).toBe(iso.indexOf(2000));
    expect(nearestStopIndex(iso, 1900)).toBe(iso.indexOf(2000));
    expect(nearestStopIndex(iso, 50)).toBe(0);
    expect(nearestStopIndex(iso, 102400)).toBe(iso.length - 1);
  });

  it('formats values the way photographers read them', () => {
    expect(formatExposureValue('aperture', 2.8)).toBe('f/2.8');
    expect(formatExposureValue('aperture', 2)).toBe('f/2');
    expect(formatExposureValue('shutterSpeed', 0.125)).toBe('1/8000');
    expect(formatExposureValue('shutterSpeed', 16.667)).toBe('1/60');
    expect(formatExposureValue('shutterSpeed', 30000)).toBe('30 s');
    expect(formatExposureValue('focalLength', 35)).toBe('35 mm');
    expect(formatExposureValue('iso', 800)).toBe('800');
  });

  it('describes open-ended ranges', () => {
    expect(formatExposureRange('iso', [null, null])).toBeNull();
    expect(formatExposureRange('iso', [400, null])).toBe('≥ 400');
    expect(formatExposureRange('focalLength', [null, 50])).toBe('≤ 50 mm');
    expect(formatExposureRange('aperture', [1.4, 2.8])).toBe('f/1.4 – f/2.8');
  });

  it('maps ranges to slider positions and back, keeping untouched ends', () => {
    const iso = EXPOSURE_STOPS.iso;
    const last = iso.length - 1;

    expect(rangeToStopIndices(iso, [null, null])).toEqual([0, last]);
    expect(rangeToStopIndices(iso, [2000, null])).toEqual([iso.indexOf(2000), last]);

    expect(stopIndicesToRange(iso, [null, null], [iso.indexOf(400), last])).toEqual([400, null]);
    expect(stopIndicesToRange(iso, [1900, 3200], [iso.indexOf(2000), iso.indexOf(6400)])).toEqual([
      1900, 6400,
    ]);
    expect(stopIndicesToRange(iso, [400, 3200], [0, iso.indexOf(3200)])).toEqual([null, 3200]);
    expect(stopIndicesToRange(iso, [400, 3200], [iso.indexOf(400), last])).toEqual([400, null]);
  });
});
