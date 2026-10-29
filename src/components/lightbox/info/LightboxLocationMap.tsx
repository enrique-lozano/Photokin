import { LocationMap } from '@/components/location/LocationMap';

interface LightboxLocationMapProps {
  latitude: number;
  longitude: number;
  /** Initial zoom level used on mount and when re-centering. */
  zoom?: number;
}

/**
 * Renders an interactive Leaflet map centered on the asset's GPS coordinates.
 * The shared map remains read-only here; editing is enabled only by the location
 * dialog.
 */
export function LightboxLocationMap({ latitude, longitude, zoom = 13 }: LightboxLocationMapProps) {
  return <LocationMap markers={[{ id: 'location', latitude, longitude }]} zoom={zoom} />;
}
