import { AreaBox } from '@/db/models/TagRegionInfoDTO';
import { AssetOrientation } from './orientation';

/**
 * Face regions are stored in the file's raw frame, but Photokin works in the
 * displayed one (orientation already applied). These two functions are inverses,
 * so a region written back round-trips to the same box on the next read.
 */

/** Orientations above 4 rotate, mapping the raw X axis onto the displayed Y one. */
export function orientationSwapsAxes(orientation: AssetOrientation): boolean {
  return orientation > 4;
}

/** Raw frame → displayed frame. */
export function toDisplayedArea(area: AreaBox, orientation: AssetOrientation): AreaBox {
  return _mirror(_swap(area, orientation), orientation);
}

/** Displayed frame → raw frame. */
export function toRawArea(area: AreaBox, orientation: AssetOrientation): AreaBox {
  return _swap(_mirror(area, orientation), orientation);
}

function _swap(area: AreaBox, orientation: AssetOrientation): AreaBox {
  return orientationSwapsAxes(orientation) ? { x: area.y, y: area.x, w: area.h, h: area.w } : { ...area };
}

/** Mirrors the axes this orientation reflects. Its own inverse, hence one function. */
function _mirror(area: AreaBox, orientation: AssetOrientation): AreaBox {
  const { x: mirrorX, y: mirrorY } = _mirroredAxes(orientation);
  return {
    ...area,
    x: mirrorX ? 1 - area.x : area.x,
    y: mirrorY ? 1 - area.y : area.y,
  };
}

function _mirroredAxes(orientation: AssetOrientation): { x: boolean; y: boolean } {
  switch (orientation) {
    case AssetOrientation.MirrorHorizontal:
    case AssetOrientation.Rotate90CW:
      return { x: true, y: false };
    case AssetOrientation.Rotate180:
    case AssetOrientation.MirrorHorizontalRotate90CW:
      return { x: true, y: true };
    case AssetOrientation.MirrorVertical:
    case AssetOrientation.Rotate270CW:
      return { x: false, y: true };
    default:
      return { x: false, y: false };
  }
}
