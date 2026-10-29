import { describe, expect, it } from 'vitest';
import {
  FIT_VIEWPORT,
  clampComparisonViewport,
  getComparisonImageRect,
  getFitZoom,
  zoomComparisonViewport,
  type ComparisonFrame,
} from './comparisonViewport';

const frame: ComparisonFrame = {
  width: 600,
  height: 400,
  naturalWidth: 6000,
  naturalHeight: 4000,
  pixelRatio: 1,
};

describe('comparison zoom and pan', () => {
  it('fits the complete photo without changing its proportions', () => {
    expect(getFitZoom(frame)).toBe(0.1);
    expect(getComparisonImageRect(frame, FIT_VIEWPORT)).toEqual({
      left: 0,
      top: 0,
      width: 600,
      height: 400,
    });
  });

  it('centers portrait photos with letterboxing', () => {
    expect(getComparisonImageRect({ ...frame, naturalWidth: 2000 }, FIT_VIEWPORT)).toEqual({
      left: 200,
      top: 0,
      width: 200,
      height: 400,
    });
  });

  it.each([1, 1.25, 1.5, 2, 3])(
    'renders 100%% at one physical pixel per image pixel at DPR %s',
    (pixelRatio) => {
      const image = getComparisonImageRect({ ...frame, pixelRatio }, { ...FIT_VIEWPORT, zoom: 1 });
      expect(image.width * pixelRatio).toBeCloseTo(frame.naturalWidth);
      expect(image.height * pixelRatio).toBeCloseTo(frame.naturalHeight);
    },
  );

  it('recomputes fit on resize without changing an actual-size zoom', () => {
    const resized = { ...frame, width: 300 };
    expect(getComparisonImageRect(resized, FIT_VIEWPORT).width).toBe(300);
    expect(getComparisonImageRect(resized, { ...FIT_VIEWPORT, zoom: 1 }).width).toBe(6000);
  });

  it('synchronizes normalized image centers across different image sizes', () => {
    const viewport = { zoom: 1, x: 0.7, y: 0.6 };
    const left = getComparisonImageRect(frame, viewport);
    const rightFrame = { ...frame, width: 500, naturalWidth: 3000, naturalHeight: 2000 };
    const right = getComparisonImageRect(rightFrame, viewport);
    expect((frame.width / 2 - left.left) / left.width).toBeCloseTo(0.7);
    expect((rightFrame.width / 2 - right.left) / right.width).toBeCloseTo(0.7);
  });

  it('stops at each photo edge without exposing blank space', () => {
    const viewport = clampComparisonViewport(frame, { zoom: 1, x: -10, y: 10 });
    const rect = getComparisonImageRect(frame, viewport);
    expect(rect.left).toBe(0);
    expect(rect.top + rect.height).toBe(400);
  });

  it('locks axes where the image is smaller than the pane', () => {
    expect(clampComparisonViewport(frame, { zoom: 0.05, x: 0, y: 1 })).toEqual({
      zoom: 0.05,
      x: 0.5,
      y: 0.5,
    });
  });

  it('preserves the image point underneath the wheel cursor', () => {
    const before = { zoom: 0.5, x: 0.5, y: 0.5 };
    const anchor = { x: 420, y: 120 };
    const oldRect = getComparisonImageRect(frame, before);
    const after = zoomComparisonViewport(frame, before, 0.75, anchor);
    const newRect = getComparisonImageRect(frame, after);
    expect((anchor.x - oldRect.left) / oldRect.width).toBeCloseTo((anchor.x - newRect.left) / newRect.width);
    expect((anchor.y - oldRect.top) / oldRect.height).toBeCloseTo((anchor.y - newRect.top) / newRect.height);
  });

  it('resets pan when returning to fit', () => {
    expect(zoomComparisonViewport(frame, { zoom: 1, x: 0.8, y: 0.9 }, 'fit')).toEqual(FIT_VIEWPORT);
  });

  it('bounds zoom while still allowing unusually small or large fitted images', () => {
    expect(zoomComparisonViewport(frame, FIT_VIEWPORT, 1000).zoom).toBe(16);
    expect(zoomComparisonViewport(frame, FIT_VIEWPORT, -1).zoom).toBe(0.01);
    const tinyFit = { ...frame, naturalWidth: 600000 };
    expect(zoomComparisonViewport(tinyFit, FIT_VIEWPORT, -1).zoom).toBe(getFitZoom(tinyFit));
  });
});
