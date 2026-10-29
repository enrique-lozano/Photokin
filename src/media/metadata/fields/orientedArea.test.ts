import { describe, expect, it } from 'vitest';
import { AssetOrientation } from './orientation';
import { orientationSwapsAxes, toDisplayedArea, toRawArea } from './orientedArea';

const ORIENTATIONS = Object.values(AssetOrientation).filter(
  (value): value is AssetOrientation => typeof value === 'number',
);

/** Off-centre and non-square, so a swapped or mirrored axis can't go unnoticed. */
const RAW_AREA = { x: 0.25, y: 0.4, w: 0.1, h: 0.2 };

describe('oriented area', () => {
  it('leaves an unrotated area untouched', () => {
    expect(toDisplayedArea(RAW_AREA, AssetOrientation.Horizontal)).toEqual(RAW_AREA);
  });

  it('mirrors the x axis only', () => {
    expect(toDisplayedArea(RAW_AREA, AssetOrientation.MirrorHorizontal)).toEqual({
      x: 0.75,
      y: 0.4,
      w: 0.1,
      h: 0.2,
    });
  });

  it('swaps the axes and mirrors x when rotated 90° CW', () => {
    expect(toDisplayedArea(RAW_AREA, AssetOrientation.Rotate90CW)).toEqual({
      x: 0.6,
      y: 0.25,
      w: 0.2,
      h: 0.1,
    });
  });

  it('round-trips every orientation through the file frame', () => {
    for (const orientation of ORIENTATIONS) {
      const displayed = toDisplayedArea(RAW_AREA, orientation);
      expect(toRawArea(displayed, orientation)).toEqual(RAW_AREA);
    }
  });

  it('reports which orientations swap the axes', () => {
    expect(ORIENTATIONS.filter(orientationSwapsAxes)).toEqual([
      AssetOrientation.MirrorHorizontalRotate270CW,
      AssetOrientation.Rotate90CW,
      AssetOrientation.MirrorHorizontalRotate90CW,
      AssetOrientation.Rotate270CW,
    ]);
  });
});
