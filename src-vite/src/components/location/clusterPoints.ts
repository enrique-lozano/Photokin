export type GeoPoint = { id: string; latitude: number; longitude: number };

/** Photos that fall in the same on-screen cell, drawn as one map pin. */
export type PhotoCluster = { ids: string[]; latitude: number; longitude: number; points: GeoPoint[] };

/**
 * Groups points that land in the same `cellSize`-pixel square at the current
 * zoom. `project` turns a point into pixels (Leaflet's `map.project`). Points
 * should come newest first: each cluster is pinned at, and shows, its newest photo.
 */
export function clusterPoints(
  points: GeoPoint[],
  project: (point: GeoPoint) => { x: number; y: number },
  cellSize: number,
): PhotoCluster[] {
  const cells = new Map<string, PhotoCluster>();
  for (const point of points) {
    const { x, y } = project(point);
    const key = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
    const cluster = cells.get(key);
    if (cluster) {
      cluster.ids.push(point.id);
      cluster.points.push(point);
    } else {
      cells.set(key, {
        ids: [point.id],
        latitude: point.latitude,
        longitude: point.longitude,
        points: [point],
      });
    }
  }
  return [...cells.values()];
}
