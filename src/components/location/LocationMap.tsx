import {
  IconCurrentLocation,
  IconMap,
  IconMinus,
  IconMouse,
  IconPlus,
  IconSatellite,
} from '@tabler/icons-react';
import { platform } from '@tauri-apps/plugin-os';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import { cn } from '@/lib/utils';
import './locationMap.css';

export interface LocationMapMarker {
  id: string;
  latitude: number;
  longitude: number;
  selected?: boolean;
  label?: string;
}

interface LocationMapProps {
  markers: LocationMapMarker[];
  editable?: boolean;
  zoom?: number;
  className?: string;
  onMapClick?: (latitude: number, longitude: number) => void;
  onMarkerSelect?: (id: string) => void;
  onMarkerChange?: (id: string, latitude: number, longitude: number) => void;
}

interface MapTheme {
  name: 'standard' | 'satellite';
  url: string;
  attribution: string;
}

const MAP_THEMES: MapTheme[] = [
  {
    name: 'standard',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: 'OpenStreetMap',
  },
  {
    name: 'satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Powered by Esri',
  },
];

const MAP_THEME_STORAGE_KEY = 'photokin.lightbox.mapThemeIndex';
const MIN_ZOOM = 0;
const MAX_ZOOM = 18;
/** How long the "hold the modifier to zoom" hint stays up after a bare wheel. */
const WHEEL_HINT_DURATION_MS = 1600;

export function isValidLatLon(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function readStoredThemeIndex(): number {
  const stored = Number(localStorage.getItem(MAP_THEME_STORAGE_KEY));
  return stored === 1 ? 1 : 0;
}

export function LocationMap({
  markers,
  editable = false,
  zoom = 13,
  className,
  onMapClick,
  onMarkerSelect,
  onMarkerChange,
}: LocationMapProps) {
  const validMarkers = useMemo(
    () => markers.filter((marker) => isValidLatLon(marker.latitude, marker.longitude)),
    [markers],
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const leafletMarkersRef = useRef(new Map<string, L.Marker>());
  const layerRef = useRef<L.TileLayer | null>(null);
  const callbacksRef = useRef({ onMapClick, onMarkerSelect, onMarkerChange });
  const initialFitDoneRef = useRef(false);
  const tileErrorFallbackRef = useRef(false);
  const wheelHintTimerRef = useRef<number | null>(null);

  const [zoomLevel, setZoomLevel] = useState(zoom);
  const [themeIndex, setThemeIndex] = useState(readStoredThemeIndex);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const [wheelHintVisible, setWheelHintVisible] = useState(false);

  const zoomModifierLabel = useMemo(() => (platform() === 'macos' ? '⌘' : 'Ctrl'), []);

  callbacksRef.current = { onMapClick, onMarkerSelect, onMarkerChange };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: markerIcon2x,
      iconUrl: markerIcon,
      shadowUrl: markerShadow,
    });

    const map = L.map(container, {
      center: [0, 0],
      zoom: 2,
      keyboard: false,
      zoomControl: false,
      // The map always sits inside a scrollable panel (the lightbox info panel,
      // the location dialog), so a bare wheel has to scroll that panel instead
      // of zooming. Zooming is opt-in with a modifier, as in embedded maps.
      scrollWheelZoom: false,
      maxZoom: MAX_ZOOM + 1,
    });
    map.attributionControl.setPrefix('');
    map.on('zoomend', () => setZoomLevel(map.getZoom()));
    map.on('click', (event) => callbacksRef.current.onMapClick?.(event.latlng.lat, event.latlng.lng));
    mapRef.current = map;

    const handleWheel = (event: WheelEvent) => {
      // A bare wheel belongs to the surrounding panel; only say why nothing
      // zoomed, and let the event bubble so the panel still scrolls.
      if (!event.ctrlKey && !event.metaKey) {
        setWheelHintVisible(true);
        if (wheelHintTimerRef.current !== null) window.clearTimeout(wheelHintTimerRef.current);
        wheelHintTimerRef.current = window.setTimeout(
          () => setWheelHintVisible(false),
          WHEEL_HINT_DURATION_MS,
        );
        return;
      }

      // Trackpad pinch also arrives here, as a wheel event with `ctrlKey` set.
      event.preventDefault();
      const current = map.getZoom();
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + (event.deltaY < 0 ? 1 : -1)));
      if (next !== current) map.setZoomAround(map.mouseEventToContainerPoint(event), next);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('wheel', handleWheel);
      if (wheelHintTimerRef.current !== null) window.clearTimeout(wheelHintTimerRef.current);
      map.remove();
      mapRef.current = null;
      leafletMarkersRef.current.clear();
      layerRef.current = null;
      initialFitDoneRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (layerRef.current) map.removeLayer(layerRef.current);
    tileErrorFallbackRef.current = false;
    setTilesUnavailable(false);

    const theme = MAP_THEMES[themeIndex] ?? MAP_THEMES[0];
    const layer = L.tileLayer(theme.url, { attribution: theme.attribution }).addTo(map);
    layer.on('tileerror', () => {
      if (tileErrorFallbackRef.current) {
        setTilesUnavailable(true);
        return;
      }
      tileErrorFallbackRef.current = true;
      if (themeIndex !== 0) setThemeIndex(0);
      else setTilesUnavailable(true);
    });
    layerRef.current = layer;
  }, [themeIndex]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const nextIds = new Set(validMarkers.map((marker) => marker.id));
    for (const [id, leafletMarker] of leafletMarkersRef.current) {
      if (!nextIds.has(id)) {
        map.removeLayer(leafletMarker);
        leafletMarkersRef.current.delete(id);
      }
    }

    for (const marker of validMarkers) {
      let leafletMarker = leafletMarkersRef.current.get(marker.id);
      if (!leafletMarker) {
        leafletMarker = L.marker([marker.latitude, marker.longitude], {
          draggable: editable,
          title: marker.label,
        }).addTo(map);
        leafletMarker.on('click', () => callbacksRef.current.onMarkerSelect?.(marker.id));
        leafletMarker.on('dragend', (event) => {
          const position = (event.target as L.Marker).getLatLng();
          callbacksRef.current.onMarkerChange?.(marker.id, position.lat, position.lng);
        });
        leafletMarkersRef.current.set(marker.id, leafletMarker);
      } else {
        leafletMarker.setLatLng([marker.latitude, marker.longitude]);
        if (leafletMarker.dragging) {
          if (editable) leafletMarker.dragging.enable();
          else leafletMarker.dragging.disable();
        }
      }
      leafletMarker.setOpacity(marker.selected === false ? 0.55 : 1);
      leafletMarker.setZIndexOffset(marker.selected === false ? 0 : 1000);
    }

    if (!initialFitDoneRef.current && validMarkers.length > 0) {
      initialFitDoneRef.current = true;
      if (validMarkers.length === 1) {
        map.setView([validMarkers[0].latitude, validMarkers[0].longitude], zoom);
      } else {
        map.fitBounds(
          L.latLngBounds(validMarkers.map((marker) => [marker.latitude, marker.longitude] as L.LatLngTuple)),
          { padding: [28, 28], maxZoom: zoom },
        );
      }
    }
  }, [editable, validMarkers, zoom]);

  function zoomIn() {
    const map = mapRef.current;
    if (map && zoomLevel < MAX_ZOOM) map.setZoom(zoomLevel + 1);
  }

  function zoomOut() {
    const map = mapRef.current;
    if (map && zoomLevel > MIN_ZOOM) map.setZoom(zoomLevel - 1);
  }

  function recenter() {
    const map = mapRef.current;
    if (!map || validMarkers.length === 0) return;
    if (validMarkers.length === 1) {
      map.setView([validMarkers[0].latitude, validMarkers[0].longitude], zoom);
    } else {
      map.fitBounds(
        L.latLngBounds(validMarkers.map((marker) => [marker.latitude, marker.longitude] as L.LatLngTuple)),
        { padding: [28, 28], maxZoom: zoom },
      );
    }
  }

  function toggleTheme() {
    setThemeIndex((current) => {
      const next = current === 0 ? 1 : 0;
      localStorage.setItem(MAP_THEME_STORAGE_KEY, String(next));
      return next;
    });
  }

  const isSatellite = themeIndex === 1;

  return (
    <div className={cn('location-map', editable && 'location-map--editable', className)}>
      <div ref={containerRef} className="location-map__canvas" />

      {editable && validMarkers.length === 0 && !tilesUnavailable && (
        <div className="location-map__empty">Click the map to place the selected photos</div>
      )}
      {tilesUnavailable && (
        <div className="location-map__offline text-foreground">
          Map unavailable. You can still enter coordinates below.
        </div>
      )}
      {wheelHintVisible && !tilesUnavailable && (
        <div className="location-map__hint" role="status">
          <IconMouse size={16} aria-hidden />
          Hold {zoomModifierLabel} and scroll to zoom
        </div>
      )}

      <div className="location-map__controls">
        <button
          type="button"
          className="location-map__control"
          title="Zoom out"
          aria-label="Zoom out"
          disabled={zoomLevel <= MIN_ZOOM}
          onClick={zoomOut}
        >
          <IconMinus size={18} />
        </button>
        <button
          type="button"
          className="location-map__control"
          title="Zoom in"
          aria-label="Zoom in"
          disabled={zoomLevel >= MAX_ZOOM}
          onClick={zoomIn}
        >
          <IconPlus size={18} />
        </button>
        <button
          type="button"
          className="location-map__control"
          title="Center on locations"
          aria-label="Center on locations"
          disabled={validMarkers.length === 0}
          onClick={recenter}
        >
          <IconCurrentLocation size={18} />
        </button>
        <button
          type="button"
          className="location-map__control"
          title={isSatellite ? 'Standard map' : 'Satellite map'}
          aria-label={isSatellite ? 'Standard map' : 'Satellite map'}
          onClick={toggleTheme}
        >
          {isSatellite ? <IconMap size={18} /> : <IconSatellite size={18} />}
        </button>
      </div>
    </div>
  );
}
