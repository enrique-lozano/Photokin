import { describe, expect, it } from 'vitest';
import { clusterPoints, GeoPoint } from './clusterPoints';

const point = (id: string, x: number, y: number): GeoPoint => ({ id, latitude: y, longitude: x });
const asPixels = (p: GeoPoint) => ({ x: p.longitude, y: p.latitude });

describe('clusterPoints', () => {
  it('groups points in the same cell and pins the group at its first (newest) point', () => {
    const clusters = clusterPoints(
      [point('newest', 10, 10), point('older', 50, 60), point('far', 200, 10)],
      asPixels,
      72,
    );

    expect(clusters.map((cluster) => cluster.ids)).toEqual([['newest', 'older'], ['far']]);
    expect(clusters[0]).toMatchObject({ latitude: 10, longitude: 10 });
  });

  it('keeps every point when they are far apart', () => {
    const points = [point('a', 0, 0), point('b', 100, 0), point('c', 0, 100)];
    expect(clusterPoints(points, asPixels, 72)).toHaveLength(3);
  });
});
