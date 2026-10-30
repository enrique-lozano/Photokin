import type { AssetInClient } from '@/db/models/AssetInClient';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePhotoSource } from '../lightbox/usePhotoSource';
import { Button } from '../ui/button';
import type { ComparisonSide } from './ComparePhotos';
import {
  clampComparisonViewport,
  getComparisonImageRect,
  getFitZoom,
  zoomComparisonViewport,
  type ComparisonFrame,
  type ComparisonViewport,
} from './comparisonViewport';

interface ComparisonPaneProps {
  side: ComparisonSide;
  asset: AssetInClient;
  active: boolean;
  viewport: ComparisonViewport;
  onActivate: (side: ComparisonSide) => void;
  onViewportChange: (side: ComparisonSide, viewport: ComparisonViewport) => void;
  onFrameChange: (side: ComparisonSide, frame: ComparisonFrame | null) => void;
}

export function ComparisonPane({
  side,
  asset,
  active,
  viewport,
  onActivate,
  onViewportChange,
  onFrameChange,
}: ComparisonPaneProps) {
  const source = usePhotoSource(asset);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [frame, setFrame] = useState<ComparisonFrame | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; viewport: ComparisonViewport } | null>(null);

  useLayoutEffect(() => {
    setImageLoaded(false);
  }, [source.src]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image || !imageLoaded || !source.isFullResolution) {
      setFrame(null);
      onFrameChange(side, null);
      return;
    }
    const measure = () => {
      const { width, height } = stage.getBoundingClientRect();
      const next =
        width > 0 && height > 0 && image.naturalWidth > 0 && image.naturalHeight > 0
          ? {
              width,
              height,
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
              pixelRatio: window.devicePixelRatio || 1,
            }
          : null;
      setFrame(next);
      onFrameChange(side, next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [imageLoaded, source.isFullResolution, source.src, side, onFrameChange]);

  const rect = frame ? getComparisonImageRect(frame, viewport) : null;
  const canPan = !!rect && !!frame && (rect.width > frame.width + 0.5 || rect.height > frame.height + 0.5);
  const label = side === 0 ? 'A' : 'B';

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!frame || event.deltaY === 0) return;
      onActivate(side);
      const bounds = stage.getBoundingClientRect();
      const zoom = viewport.zoom === 'fit' ? getFitZoom(frame) : viewport.zoom;
      onViewportChange(
        side,
        zoomComparisonViewport(frame, viewport, zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15), {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        }),
      );
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [frame, viewport, side, onActivate, onViewportChange]);

  return (
    <section className={`compare-pane${active ? ' is-active' : ''}`} aria-label={`Photo ${label}`}>
      <button
        type="button"
        className="compare-pane__heading"
        aria-pressed={active}
        aria-label={`Select photo ${label}: ${asset.filename}`}
        onClick={() => onActivate(side)}
      >
        <span className="compare-pane__badge">{label}</span>
        <span className="compare-pane__filename" title={asset.filename}>
          {asset.filename}
        </span>
        {active && <span className="compare-pane__selected">Selected</span>}
      </button>
      <div
        ref={stageRef}
        className={`compare-pane__stage${canPan ? ' can-pan' : ''}${dragging ? ' is-dragging' : ''}`}
        tabIndex={0}
        role="group"
        aria-label={`Photo ${label} preview`}
        onFocus={() => onActivate(side)}
        onDoubleClick={() => {
          if (frame) {
            onViewportChange(
              side,
              zoomComparisonViewport(frame, viewport, viewport.zoom === 'fit' ? 1 : 'fit'),
            );
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          onActivate(side);
          event.currentTarget.focus({ preventScroll: true });
          if (!canPan || !frame) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            viewport: clampComparisonViewport(frame, viewport),
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || !rect || !frame) return;
          onViewportChange(
            side,
            clampComparisonViewport(frame, {
              ...drag.viewport,
              x: drag.viewport.x - (event.clientX - drag.x) / rect.width,
              y: drag.viewport.y - (event.clientY - drag.y) / rect.height,
            }),
          );
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          dragRef.current = null;
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          dragRef.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragging(false);
        }}
      >
        {source.src && (
          <img
            ref={imageRef}
            src={source.src}
            alt={asset.metadata.title?.trim() || asset.filename}
            draggable={false}
            className={rect ? 'compare-pane__image' : 'compare-pane__placeholder'}
            style={
              rect
                ? {
                    width: rect.width,
                    height: rect.height,
                    transform: `translate(${rect.left}px, ${rect.top}px)`,
                  }
                : undefined
            }
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageLoaded(false);
              source.onError();
            }}
          />
        )}
        {!source.isFullResolution && !source.error && (
          <span className="compare-pane__status" role="status">
            Loading full-size photo...
          </span>
        )}
        {source.error && (
          <div className="compare-pane__status compare-pane__error" role="alert">
            <span>{source.error}</span>
            <Button variant="outline" size="sm" onClick={source.retry}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
