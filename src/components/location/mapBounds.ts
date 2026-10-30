import type { GeoPoint } from './clusterPoints';

export type MapBounds = { south: number; north: number; west: number; east: number };

/** Leaflet bounds may span the date line or a horizontally repeated world. */
export function isPointInBounds(point: GeoPoint, bounds: MapBounds): boolean {
  const width = bounds.east - bounds.west;
  const longitudeOffset = (((point.longitude - bounds.west) % 360) + 360) % 360;
  const longitudeSpan = ((width % 360) + 360) % 360;
  return (
    point.latitude >= bounds.south &&
    point.latitude <= bounds.north &&
    (width >= 360 || longitudeOffset <= longitudeSpan)
  );
}
