import { describe, expect, it } from 'vitest';
import { estimateFaceLabelWidth, faceLabelPlacement } from './faceLabelPlacement';

const container = { width: 1000, height: 800 };

describe('faceLabelPlacement', () => {
  it('keeps a centered face labelled underneath', () => {
    const placement = faceLabelPlacement({ left: 400, top: 300, width: 120, height: 120 }, container, 80);
    expect(placement).toEqual({ above: false, shiftX: 0 });
  });

  it('flips the label above a face sitting on the bottom edge', () => {
    const placement = faceLabelPlacement({ left: 400, top: 760, width: 80, height: 40 }, container, 80);
    expect(placement.above).toBe(true);
    expect(placement.shiftX).toBe(0);
  });

  it('leaves the label below when the photo has room under the face', () => {
    const placement = faceLabelPlacement({ left: 400, top: 400, width: 80, height: 40 }, container, 80);
    expect(placement.above).toBe(false);
  });

  it('pulls a right-edge label back into the frame', () => {
    const placement = faceLabelPlacement({ left: 960, top: 200, width: 40, height: 40 }, container, 120);
    expect(placement.shiftX).toBeLessThan(0);
    const center = 980;
    const left = center - 60 + placement.shiftX;
    expect(left + 120).toBeLessThanOrEqual(container.width - 8);
  });

  it('pulls a left-edge label back into the frame', () => {
    const placement = faceLabelPlacement({ left: 0, top: 200, width: 40, height: 40 }, container, 120);
    expect(placement.shiftX).toBeGreaterThan(0);
    const left = 20 - 60 + placement.shiftX;
    expect(left).toBeGreaterThanOrEqual(8);
  });

  it('flips and shifts a face in the bottom-right corner', () => {
    const placement = faceLabelPlacement({ left: 900, top: 750, width: 90, height: 50 }, container, 160);
    expect(placement.above).toBe(true);
    expect(placement.shiftX).toBeLessThan(0);
  });
});

describe('estimateFaceLabelWidth', () => {
  it('grows with the name and the status icon, and stops at the pill max width', () => {
    expect(estimateFaceLabelWidth('Ana', false)).toBeLessThan(estimateFaceLabelWidth('Ana', true));
    expect(estimateFaceLabelWidth('A'.repeat(80), true)).toBe(200);
  });
});
