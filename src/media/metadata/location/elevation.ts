import { chunked } from '@/utils/array.utils';
import { fetch } from '@tauri-apps/plugin-http';

const ELEVATION_ENDPOINT = 'https://api.open-meteo.com/v1/elevation';
const MAX_POINTS_PER_REQUEST = 100;

interface ElevationResponse {
  elevation?: unknown[];
  error?: boolean;
  reason?: string;
}

export interface ElevationPoint {
  latitude: number;
  longitude: number;
}

export function elevationRequestUrl(points: ElevationPoint[]): string {
  const params = new URLSearchParams({
    latitude: points.map((point) => point.latitude).join(','),
    longitude: points.map((point) => point.longitude).join(','),
  });
  return `${ELEVATION_ENDPOINT}?${params.toString()}`;
}

/** Returns terrain elevations in metres, preserving the input order. */
export async function lookupElevations(points: ElevationPoint[]): Promise<(number | null)[]> {
  const elevations: (number | null)[] = [];

  for (const chunk of chunked(points, MAX_POINTS_PER_REQUEST)) {
    const response = await fetch(elevationRequestUrl(chunk));
    const body = (await response.json()) as ElevationResponse;

    if (!response.ok || body.error) {
      throw new Error(body.reason || `Elevation service returned HTTP ${response.status}`);
    }
    if (!Array.isArray(body.elevation) || body.elevation.length !== chunk.length) {
      throw new Error('Elevation service returned an unexpected response');
    }

    elevations.push(
      ...body.elevation.map((value) =>
        typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null,
      ),
    );
  }

  return elevations;
}
