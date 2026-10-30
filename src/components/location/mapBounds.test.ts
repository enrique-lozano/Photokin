import { describe, expect, it } from 'vitest';
import { isPointInBounds } from './mapBounds';

describe('map area membership', () => {
  it.each([
    [2, 1, 3, true],
    [1, 1, 3, true],
    [3, 1, 3, true],
    [4, 1, 3, false],
    [179, 170, 190, true],
    [-179, 170, 190, true],
    [-179, 170, -170, true],
    [0, 170, 190, false],
    [2, 361, 363, true],
    [2, -359, -357, true],
    [0, -200, 200, true],
  ])('longitude %s within %s…%s: %s', (longitude, west, east, expected) => {
    expect(
      isPointInBounds({ id: 'photo', latitude: 0, longitude }, { south: -1, north: 1, west, east }),
    ).toBe(expected);
  });

  it('excludes photos outside the latitude range', () => {
    expect(
      isPointInBounds(
        { id: 'photo', latitude: 2, longitude: 0 },
        { south: -1, north: 1, west: -180, east: 180 },
      ),
    ).toBe(false);
  });
});
