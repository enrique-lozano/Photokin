import { describe, expect, it } from 'vitest';
import { AssetOrientation, getOrientationValue, orientedDimensions, rotateOrientation } from './orientation';

const orientations = Object.values(AssetOrientation).filter(
  (value): value is AssetOrientation => typeof value === 'number',
);

describe('getOrientationValue', () => {
  it('accepts every stored orientation', () => {
    for (const orientation of orientations) {
      expect(getOrientationValue(orientation)).toBe(orientation);
    }
  });

  it.each([0, 9, -1, 1.5, NaN, Infinity])('rejects invalid numeric orientation %s', (value) => {
    expect(getOrientationValue(value)).toBeNull();
  });
});

describe('rotateOrientation', () => {
  it('cycles normal orientations through clockwise quarter-turns', () => {
    expect(rotateOrientation(AssetOrientation.Horizontal, 'right')).toBe(AssetOrientation.Rotate90CW);
    expect(rotateOrientation(AssetOrientation.Rotate90CW, 'right')).toBe(AssetOrientation.Rotate180);
    expect(rotateOrientation(AssetOrientation.Rotate180, 'right')).toBe(AssetOrientation.Rotate270CW);
    expect(rotateOrientation(AssetOrientation.Rotate270CW, 'right')).toBe(AssetOrientation.Horizontal);
  });

  it('preserves reflection while rotating mirrored orientations', () => {
    expect(rotateOrientation(AssetOrientation.MirrorHorizontal, 'right')).toBe(
      AssetOrientation.MirrorHorizontalRotate90CW,
    );
    expect(rotateOrientation(AssetOrientation.MirrorHorizontalRotate90CW, 'right')).toBe(
      AssetOrientation.MirrorVertical,
    );
    expect(rotateOrientation(AssetOrientation.MirrorVertical, 'right')).toBe(
      AssetOrientation.MirrorHorizontalRotate270CW,
    );
    expect(rotateOrientation(AssetOrientation.MirrorHorizontalRotate270CW, 'right')).toBe(
      AssetOrientation.MirrorHorizontal,
    );
  });

  it('makes left and right rotations inverse operations', () => {
    for (const orientation of orientations) {
      expect(rotateOrientation(rotateOrientation(orientation, 'right'), 'left')).toBe(orientation);
      expect(rotateOrientation(rotateOrientation(orientation, 'left'), 'right')).toBe(orientation);
    }
  });
});

describe('orientedDimensions', () => {
  it('keeps the stored sides for orientations that do not transpose the frame', () => {
    for (const orientation of orientations.filter((value) => value <= AssetOrientation.MirrorVertical)) {
      expect(orientedDimensions(6000, 4000, orientation)).toEqual({ width: 6000, height: 4000 });
    }
  });

  it('swaps the sides for orientations that transpose the frame', () => {
    // A portrait capture stored as a landscape raster plus a rotation tag: the
    // thumbnail is generated upright, so the asset must measure portrait too.
    for (const orientation of orientations.filter((value) => value > AssetOrientation.MirrorVertical)) {
      expect(orientedDimensions(6000, 4000, orientation)).toEqual({ width: 4000, height: 6000 });
    }
  });

  it('leaves the unknown-size sentinel square whichever way it is rotated', () => {
    expect(orientedDimensions(1, 1, AssetOrientation.Rotate90CW)).toEqual({ width: 1, height: 1 });
  });
});
