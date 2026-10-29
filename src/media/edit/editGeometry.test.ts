import { describe, expect, it } from 'vitest';
import { initialEdit, orientRegion, pixelCrop, reframeCrop, transformRegion } from './editGeometry';

describe('editor geometry', () => {
  it('preserves the selected image area when rotating or flipping', () => {
    const edit = {
      ...initialEdit(1000, 800, 'jpg'),
      crop: [0.1, 0.2, 0.5, 0.6] as [number, number, number, number],
    };
    const rotated = reframeCrop(edit, { turns: 1, flipHorizontal: false, flipVertical: false });
    expect(rotated[0]).toBeCloseTo(0.2);
    expect(rotated[1]).toBeCloseTo(0.1);
    expect(rotated[2]).toBeCloseTo(0.6);
    expect(rotated[3]).toBeCloseTo(0.5);
    for (const turns of [0, 1, 2, 3]) {
      for (const flipHorizontal of [false, true]) {
        const next = {
          ...edit,
          turns,
          flipHorizontal,
          crop: reframeCrop(edit, { turns, flipHorizontal, flipVertical: false }),
        };
        const restored = reframeCrop(next, edit);
        for (let index = 0; index < 4; index++) expect(restored[index]).toBeCloseTo(edit.crop[index]);
      }
    }
  });
  const area = { x: 0.3, y: 0.4, w: 0.2, h: 0.1 };
  it('preserves normalized faces on resize', () => {
    const edit = { ...initialEdit(1000, 800, 'jpg'), width: 500, height: 400 };
    expect(transformRegion(area, edit, 1000, 800)).toEqual({
      x: 0.3,
      y: 0.4,
      w: expect.closeTo(0.2),
      h: expect.closeTo(0.1),
    });
  });
  it('matches every quarter-turn and flip combination', () => {
    for (const turns of [0, 1, 2, 3]) {
      for (const flipHorizontal of [false, true]) {
        for (const flipVertical of [false, true]) {
          const edit = { ...initialEdit(1000, 800, 'jpg'), turns, flipHorizontal, flipVertical };
          const result = transformRegion(area, edit, 1000, 800)!;
          const expected = orientRegion(area, edit);
          for (const key of ['x', 'y', 'w', 'h'] as const) expect(result[key]).toBeCloseTo(expected[key]);
        }
      }
    }
    expect(orientRegion(area, { turns: 1, flipHorizontal: false, flipVertical: false })).toEqual({
      x: 0.6,
      y: 0.3,
      w: 0.1,
      h: 0.2,
    });
  });
  it('renormalizes surviving faces and drops cropped-away faces', () => {
    const edit = {
      ...initialEdit(1000, 800, 'jpg'),
      crop: [0, 0, 0.5, 1] as [number, number, number, number],
    };
    expect(transformRegion(area, edit, 1000, 800)?.x).toBeCloseTo(0.6);
    expect(transformRegion({ ...area, x: 0.8 }, edit, 1000, 800)).toBeNull();
  });
  it('uses the same rounded pixel edges as the encoder', () => {
    const edit = {
      ...initialEdit(101, 81, 'jpg'),
      crop: [0.1, 0.1, 0.5, 0.5] as [number, number, number, number],
    };
    expect(pixelCrop(edit, 101, 81)).toMatchObject({ x: 10, y: 8, width: 51, height: 41 });
  });
  it('keeps a half-visible face but discards one with less than half its area remaining', () => {
    const edit = {
      ...initialEdit(1000, 800, 'jpg'),
      crop: [0, 0, 0.5, 1] as [number, number, number, number],
    };
    expect(transformRegion({ x: 0.5, y: 0.5, w: 0.25, h: 0.25 }, edit, 1000, 800)).toEqual({
      x: 0.875,
      y: 0.5,
      w: 0.25,
      h: 0.25,
    });
    expect(transformRegion({ x: 0.51, y: 0.5, w: 0.25, h: 0.25 }, edit, 1000, 800)).toBeNull();
  });
  it('uses rounded crop pixels, not ideal percentages, to place face regions', () => {
    const edit = {
      ...initialEdit(101, 81, 'jpg'),
      crop: [0.1, 0.1, 0.5, 0.5] as [number, number, number, number],
    };
    const face = transformRegion({ x: 0.5, y: 0.5, w: 0.2, h: 0.2 }, edit, 101, 81)!;
    expect(face.x).toBeCloseTo((50.5 - 10) / 51);
    expect(face.y).toBeCloseTo((40.5 - 8) / 41);
    expect(face.w).toBeCloseTo(20.2 / 51);
    expect(face.h).toBeCloseTo(16.2 / 41);
  });
});
