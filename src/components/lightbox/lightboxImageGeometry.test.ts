import { describe, expect, it } from 'vitest';
import {
  clampPanOffset,
  getDisplayedImageRect,
  getImageClipPath,
  getPanLimits,
  getThumbnailTransitionFrame,
} from './lightboxImageGeometry';

// 2:1 photo in a 1000×800 frame. At scale 1 it fills the width and letterboxes
// vertically (1000×500). It has to be scaled past 1.6 before the height overflows.
const frame = {
  containerWidth: 1000,
  containerHeight: 800,
  naturalWidth: 2000,
  naturalHeight: 1000,
};

describe('getPanLimits', () => {
  it('locks both axes while the whole photo fits', () => {
    expect(getPanLimits({ ...frame, scale: 1 })).toEqual({ maxX: 0, maxY: 0 });
  });

  it('opens only the axis that overflows the frame', () => {
    expect(getPanLimits({ ...frame, scale: 1.2 })).toEqual({ maxX: 100, maxY: 0 });
  });

  it('opens both axes once the photo is larger than the frame', () => {
    expect(getPanLimits({ ...frame, scale: 2 })).toEqual({ maxX: 500, maxY: 100 });
  });

  it('returns null until the frame can be measured', () => {
    expect(getPanLimits({ ...frame, scale: 2, containerWidth: 0 })).toBeNull();
  });
});

describe('clampPanOffset', () => {
  it('leaves an in-range pan unchanged', () => {
    expect(clampPanOffset({ ...frame, scale: 2, offset: { x: 40, y: -20 } })).toEqual({ x: 40, y: -20 });
  });

  it('stops at the photo edge on an overflowing axis', () => {
    expect(clampPanOffset({ ...frame, scale: 1.2, offset: { x: 400, y: 0 } })).toEqual({ x: 100, y: 0 });
    expect(clampPanOffset({ ...frame, scale: 1.2, offset: { x: -400, y: 0 } })).toEqual({ x: -100, y: 0 });
  });

  it('ignores movement on an axis that already shows the whole photo', () => {
    expect(clampPanOffset({ ...frame, scale: 1.2, offset: { x: 10, y: 80 } })).toEqual({ x: 10, y: 0 });
  });

  it('recenters a pan that no longer fits after zooming out', () => {
    expect(clampPanOffset({ ...frame, scale: 1, offset: { x: 200, y: 50 } })).toEqual({ x: 0, y: 0 });
  });

  it('keeps the offset when the frame is not measurable yet', () => {
    expect(clampPanOffset({ ...frame, scale: 2, containerWidth: 0, offset: { x: 12, y: -4 } })).toEqual({
      x: 12,
      y: -4,
    });
  });
});

describe('getDisplayedImageRect', () => {
  it('centers the fitted photo and shifts it by the pan offset', () => {
    expect(getDisplayedImageRect({ ...frame, scale: 1.2, offset: { x: 40, y: 0 } })).toEqual({
      left: -60,
      top: 100,
      width: 1200,
      height: 600,
    });
  });

  describe('getThumbnailTransitionFrame', () => {
    const image = { left: 100, top: 150, width: 1200, height: 800 };

    it('maps an uncropped thumbnail onto the photo without fading or stretching it', () => {
      expect(getThumbnailTransitionFrame(image, { left: 20, top: 40, width: 300, height: 200 })).toEqual({
        transform: 'translate(-530px, -410px) scale(0.25)',
        clipPath: 'inset(0px 0px)',
      });
    });

    it('reveals the vertical crop of a wide tile with a uniform scale', () => {
      expect(getThumbnailTransitionFrame(image, { left: 20, top: 40, width: 300, height: 100 })).toEqual({
        transform: 'translate(-530px, -460px) scale(0.25)',
        clipPath: 'inset(200px 0px)',
      });
    });

    it('reveals the horizontal crop of a tall tile with a uniform scale', () => {
      expect(getThumbnailTransitionFrame(image, { left: 20, top: 40, width: 150, height: 200 })).toEqual({
        transform: 'translate(-605px, -410px) scale(0.25)',
        clipPath: 'inset(0px 300px)',
      });
    });

    it('lands the visible crop exactly on a square tile for portrait and landscape photos', () => {
      const tile = { left: 72, top: 220, width: 240, height: 240 };
      for (const photo of [image, { left: 400, top: 80, width: 600, height: 900 }]) {
        const frame = getThumbnailTransitionFrame(photo, tile);
        const scale = Math.max(tile.width / photo.width, tile.height / photo.height);
        const cropX = Math.max(0, (photo.width - tile.width / scale) / 2);
        const cropY = Math.max(0, (photo.height - tile.height / scale) / 2);
        expect((photo.width - 2 * cropX) * scale).toBeCloseTo(tile.width);
        expect((photo.height - 2 * cropY) * scale).toBeCloseTo(tile.height);
        expect(frame.clipPath).toBe(`inset(${cropY}px ${cropX}px)`);
      }
    });
  });

  describe('getImageClipPath', () => {
    const viewport = { left: 0, top: 52, width: 1000, height: 656 };

    it('keeps a fitted photo fully visible', () => {
      expect(getImageClipPath({ left: 100, top: 100, width: 800, height: 500 }, viewport)).toBe(
        'inset(0px 0px 0px 0px)',
      );
    });

    it('captures the stage clipping when closing a zoomed and panned photo', () => {
      expect(getImageClipPath({ left: -200, top: -48, width: 1600, height: 1000 }, viewport)).toBe(
        'inset(100px 400px 244px 200px)',
      );
    });
  });
});
