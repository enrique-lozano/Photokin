import { IconMap, IconMaximize, IconMinus, IconPlus, IconSatellite } from '@tabler/icons-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { createMapThumbnailLoader } from './mapThumbnails';
import { clusterPoints, GeoPoint, PhotoCluster } from './clusterPoints';
import { isPointInBounds, type MapBounds } from './mapBounds';
import { MAP_THEME_STORAGE_KEY, MAP_THEMES, readStoredThemeIndex } from './LocationMap';
import './locationMap.css';
import './photoMap.css';

/** Photos closer than this on screen share one pin. */
const CELL_SIZE_PX = 72;
const MAX_ZOOM = 18;
const compactCount = new Intl.NumberFormat(undefined, { notation: 'compact' });

interface PhotoMapProps {
  /** Geotagged photos, newest first. */
  points: GeoPoint[];
  focus?: GeoPoint[] | null;
  /** Opens a photo, with the photos it was grouped with as the viewer's scope. */
  onOpen: (id: string, scopeIds: string[]) => void;
  onSelectArea: (bounds: MapBounds) => void;
}

function _mapBounds(bounds: L.LatLngBounds): MapBounds {
  return {
    south: bounds.getSouth(),
    north: bounds.getNorth(),
    west: bounds.getWest(),
    east: bounds.getEast(),
  };
}

function _bounds(points: GeoPoint[]) {
  return L.latLngBounds(points.map((point) => [point.latitude, point.longitude] as L.LatLngTuple));
}

/** Library map: moving it only changes the draft area, never the gallery. */
export function PhotoMap({ points, focus, onOpen, onSelectArea }: PhotoMapProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const canvasRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    setContainer(node);
    return () => setContainer((current) => (current === node ? null : current));
  }, []);
  const mapRef = useRef<L.Map | null>(null);
  const pinsRef = useRef<L.LayerGroup | null>(null);
  const [paintThumbnails] = useState(createMapThumbnailLoader);
  const pendingFrameRef = useRef<L.LatLngBounds | null>(null);
  const fittedRef = useRef(false);
  const framingRef = useRef(false);
  const navigatingRef = useRef(false);
  const viewRef = useRef<{ center: L.LatLng; zoom: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [moving, setMoving] = useState(false);
  const [areaChanged, setAreaChanged] = useState(false);
  const latestRef = useRef({ points, onOpen });
  latestRef.current = {
    points,
    onOpen: (id, ids) => {
      setExpanded(false);
      onOpen(id, ids);
    },
  };

  const [themeIndex, setThemeIndex] = useState(readStoredThemeIndex);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);

  const renderPins = () => {
    const map = mapRef.current;
    const pins = pinsRef.current;
    if (!map || !pins) return;
    const { points: all, onOpen: open } = latestRef.current;

    const view = map.getBounds();
    const zoom = map.getZoom();
    const nearby = _mapBounds(view.pad(0.25));
    const position = (point: GeoPoint) =>
      L.latLng(
        point.latitude,
        point.longitude + 360 * Math.round((map.getCenter().lng - point.longitude) / 360),
      );
    const clusters = clusterPoints(
      all.filter((point) => isPointInBounds(point, nearby)),
      (point) => map.project(position(point), zoom),
      CELL_SIZE_PX,
    );

    pins.clearLayers();
    const pinElements = new Map<string, HTMLElement>();
    for (const cluster of clusters) {
      const marker = L.marker(position(cluster.points[0]), {
        icon: L.divIcon({
          className: 'photo-map-pin',
          html: `<div class="photo-map-pin__photo"></div>${
            cluster.ids.length > 1
              ? `<span class="photo-map-pin__count">${compactCount.format(cluster.ids.length)}</span>`
              : ''
          }`,
          iconSize: [56, 56],
          iconAnchor: [28, 28],
        }),
        title: cluster.ids.length > 1 ? `${cluster.ids.length} photos` : undefined,
      });
      marker.on('click', () => _openOrZoom(map, cluster, open));
      pins.addLayer(marker);
      const photo = marker.getElement()?.querySelector<HTMLElement>('.photo-map-pin__photo');
      if (photo) pinElements.set(cluster.ids[0], photo);
    }
    paintThumbnails(pinElements);
  };
  const renderPinsRef = useRef(renderPins);
  renderPinsRef.current = renderPins;

  const frameMap = () => {
    const map = mapRef.current;
    if (!map || !map.getContainer().offsetWidth || !map.getContainer().offsetHeight) return;
    framingRef.current = true;
    map.invalidateSize({ pan: false });
    if (pendingFrameRef.current) {
      map.fitBounds(pendingFrameRef.current, { padding: [40, 40], maxZoom: 14, animate: false });
      pendingFrameRef.current = null;
      fittedRef.current = true;
      setAreaChanged(false);
    }
    framingRef.current = false;
  };

  useEffect(() => {
    if (!container) return;

    const map = L.map(container, {
      center: viewRef.current?.center ?? [20, 0],
      zoom: viewRef.current?.zoom ?? 2,
      zoomControl: false,
      maxZoom: MAX_ZOOM,
    });
    map.attributionControl.setPrefix('');
    pinsRef.current = L.layerGroup().addTo(map);
    map.on('movestart zoomstart', () => {
      if (framingRef.current) return;
      navigatingRef.current = true;
      setMoving(true);
    });
    map.on('moveend', () => {
      setMoving(false);
      if (navigatingRef.current) setAreaChanged(true);
      navigatingRef.current = false;
      renderPinsRef.current();
    });
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(frameMap);
    resizeObserver.observe(container);
    return () => {
      viewRef.current = { center: map.getCenter(), zoom: map.getZoom() };
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      pinsRef.current = null;
    };
  }, [container]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let fellBack = false;
    setTilesUnavailable(false);
    const theme = MAP_THEMES[themeIndex] ?? MAP_THEMES[0];
    const layer = L.tileLayer(theme.url, { attribution: theme.attribution }).addTo(map);
    layer.on('tileerror', () => {
      if (fellBack || themeIndex === 0) setTilesUnavailable(true);
      else {
        fellBack = true;
        setThemeIndex(0);
      }
    });
    return () => {
      map.removeLayer(layer);
    };
  }, [themeIndex, container]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!fittedRef.current && points.length > 0) pendingFrameRef.current ??= _bounds(points);
    frameMap();
    renderPinsRef.current();
  }, [points, container]);

  useEffect(() => {
    if (focus?.length) {
      pendingFrameRef.current = _bounds(focus);
      frameMap();
    }
  }, [focus]);

  function toggleTheme() {
    setThemeIndex((current) => {
      const next = current === 0 ? 1 : 0;
      localStorage.setItem(MAP_THEME_STORAGE_KEY, String(next));
      return next;
    });
  }

  const isSatellite = themeIndex === 1;

  const mapContent = (
    <div className={`location-map photo-map${moving ? ' photo-map--moving' : ''}`}>
      <div ref={canvasRef} className="location-map__canvas" />
      <div
        className="photo-map__area-action"
        hidden={expanded}
        inert={moving || !areaChanged}
        aria-hidden={moving || !areaChanged}
      >
        <Button
          size="sm"
          className={areaChanged ? 'photo-map__apply' : 'photo-map__apply photo-map__apply--hidden'}
          onClick={() => {
            if (!mapRef.current) return;
            onSelectArea(_mapBounds(mapRef.current.getBounds()));
            setAreaChanged(false);
          }}
        >
          View photos in this area
        </Button>
      </div>
      {tilesUnavailable && points.length > 0 && (
        <div className="location-map__offline text-foreground">
          Map unavailable offline. You can still browse places in the list.
        </div>
      )}
      {points.length === 0 && (
        <div className="location-map__empty">No photos with GPS coordinates match your library filters.</div>
      )}
      <div className="location-map__controls" inert={moving} aria-hidden={moving}>
        <button
          type="button"
          className="location-map__control"
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => mapRef.current?.zoomOut()}
        >
          <IconMinus size={18} />
        </button>
        <button
          type="button"
          className="location-map__control"
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => mapRef.current?.zoomIn()}
        >
          <IconPlus size={18} />
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
      {!expanded && (
        <div className="photo-map__expand" inert={moving} aria-hidden={moving}>
          <DialogTrigger asChild>
            <Button variant="secondary" size="icon" title="Expand map" aria-label="Expand map">
              <IconMaximize size={18} />
            </Button>
          </DialogTrigger>
        </div>
      )}
    </div>
  );

  return (
    <Dialog
      open={expanded}
      onOpenChange={(open) => {
        setMoving(false);
        setExpanded(open);
      }}
    >
      {expanded ? (
        <>
          <div className="photo-map" />
          <DialogContent className="photo-map-dialog" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Map</DialogTitle>
            </DialogHeader>
            {mapContent}
          </DialogContent>
        </>
      ) : (
        mapContent
      )}
    </Dialog>
  );
}

/** A group zooms in to split apart; a single photo, or a stack at one spot, opens. */
function _openOrZoom(map: L.Map, cluster: PhotoCluster, open: PhotoMapProps['onOpen']) {
  const bounds = _bounds(cluster.points);
  const sameSpot = bounds.getNorthEast().equals(bounds.getSouthWest());
  if (cluster.ids.length > 1 && !sameSpot && map.getZoom() < MAX_ZOOM) {
    map.flyToBounds(bounds, { padding: [64, 64], maxZoom: MAX_ZOOM });
  } else {
    open(cluster.ids[0], cluster.ids);
  }
}
