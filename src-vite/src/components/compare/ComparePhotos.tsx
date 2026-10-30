import type { AssetInClient } from '@/db/models/AssetInClient';
import { useLiveAsset } from '@/hooks/useLiveAsset';
import { useAppStore } from '@/stores/appState';
import { useWindowControls } from '@/system/useWindowControls';
import { LightboxImageContext } from '@/context/LightboxContext';
import {
  IconChevronLeft,
  IconInfoCircle,
  IconLink,
  IconMinus,
  IconPlus,
  IconUnlink,
} from '@tabler/icons-react';
import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { WindowControls } from '../app-shell/WindowControls';
import { LightboxInfoPanel } from '../lightbox/PhotoInfoPanel';
import '../lightbox/lightbox.css';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { ComparisonPane } from './ComparisonPane';
import {
  FIT_VIEWPORT,
  getFitZoom,
  zoomComparisonViewport,
  type ComparisonFrame,
  type ComparisonViewport,
} from './comparisonViewport';
import './comparePhotos.css';

export type ComparisonSide = 0 | 1;

export function ComparePhotos({ pair }: { pair: [AssetInClient, AssetInClient] }) {
  const left = useLiveAsset(pair[0].id, pair[0]) ?? pair[0];
  const right = useLiveAsset(pair[1].id, pair[1]) ?? pair[1];
  const assets = [left, right];
  const setComparisonPair = useAppStore((state) => state.setComparisonPair);
  const [active, setActive] = useState<ComparisonSide>(0);
  const [linked, setLinked] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [viewports, setViewports] = useState<[ComparisonViewport, ComparisonViewport]>([
    FIT_VIEWPORT,
    FIT_VIEWPORT,
  ]);
  const [frames, setFrames] = useState<[ComparisonFrame | null, ComparisonFrame | null]>([null, null]);
  const contentRef = useRef<HTMLDivElement>(null);
  const { startDragging, handleDragRegionDoubleClick } = useWindowControls();
  const close = useCallback(() => setComparisonPair(null), [setComparisonPair]);
  const closeInfo = useCallback(() => setShowInfo(false), []);
  const lightboxContext = useContext(LightboxImageContext);
  // Person links in the shared details panel dismiss their owning viewer.
  const infoContext = useMemo(() => ({ ...lightboxContext, closeLightbox: close }), [lightboxContext, close]);

  const updateViewport = useCallback(
    (side: ComparisonSide, viewport: ComparisonViewport) => {
      setViewports((current) =>
        linked ? [viewport, viewport] : side === 0 ? [viewport, current[1]] : [current[0], viewport],
      );
    },
    [linked],
  );
  const updateFrame = useCallback((side: ComparisonSide, frame: ComparisonFrame | null) => {
    setFrames((current) => (side === 0 ? [frame, current[1]] : [current[0], frame]));
  }, []);

  const zoom = (value: ComparisonViewport['zoom']) => {
    const frame = frames[active];
    if (frame) updateViewport(active, zoomComparisonViewport(frame, viewports[active], value));
  };
  const stepZoom = (factor: number) => {
    const frame = frames[active];
    if (!frame) return;
    const current = viewports[active].zoom;
    zoom((current === 'fit' ? getFitZoom(frame) : current) * factor);
  };
  const toggleLink = () => {
    if (!linked) {
      const viewport = viewports[active];
      setViewports([viewport, viewport]);
    }
    setLinked(!linked);
  };
  const currentZoom = viewports[active].zoom;

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        ref={contentRef}
        className="compare-photos fixed inset-0 left-0 top-0 h-dvh w-screen max-h-none translate-x-0 translate-y-0 rounded-none border-0 p-0 data-[state=open]:animate-none data-[state=closed]:animate-none"
        hideCloseButton
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (showInfo) {
            event.preventDefault();
            setShowInfo(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.defaultPrevented) return;
          const target = event.target;
          if (
            target instanceof HTMLElement &&
            (target.closest('input, textarea, select, [contenteditable="true"]') ||
              target.closest('[role="dialog"]') !== contentRef.current)
          ) {
            return;
          }
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          switch (event.key.toLowerCase()) {
            case '+':
            case '=':
              event.preventDefault();
              stepZoom(1.25);
              break;
            case '-':
              event.preventDefault();
              stepZoom(1 / 1.25);
              break;
            case '0':
              event.preventDefault();
              zoom('fit');
              break;
            case '1':
              event.preventDefault();
              zoom(1);
              break;
            case 'i':
              event.preventDefault();
              setShowInfo((value) => !value);
              break;
            case 'arrowleft':
            case 'arrowright':
              event.preventDefault();
              setActive(event.key === 'ArrowLeft' ? 0 : 1);
              break;
          }
        }}
      >
        <header className="lightbox-topbar">
          <div className="lightbox-topbar__lead">
            <Button
              variant="ghost"
              size="icon"
              className="lightbox-topbar__action"
              aria-label="Back to gallery"
              title="Back to gallery (Esc)"
              onClick={close}
            >
              <IconChevronLeft size={20} />
            </Button>
            <div className="lightbox-topbar__titles">
              <DialogTitle className="lightbox-topbar__title text-sm leading-tight font-semibold">
                Compare photos
              </DialogTitle>
              <span className="lightbox-topbar__subtitle">Photo {active === 0 ? 'A' : 'B'} selected</span>
            </div>
          </div>
          <div
            className="lightbox-topbar__drag"
            data-tauri-drag-region
            onMouseDown={startDragging}
            onDoubleClick={handleDragRegionDoubleClick}
          />
          <div className="lightbox-topbar__actions">
            <div className="compare-photos__tools" role="group" aria-label="Comparison tools">
              <Button
                variant="ghost"
                size="sm"
                className="compare-photos__tool"
                aria-label="Link zoom and pan"
                aria-pressed={linked}
                onClick={toggleLink}
                title="Move and zoom both photos together. Unlink to position them separately."
              >
                {linked ? <IconLink size={16} /> : <IconUnlink size={16} />}
                <span className="compare-photos__link-label">Link zoom &amp; pan</span>
                <span className="sr-only">{linked ? 'Linked' : 'Unlinked'}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="compare-photos__tool"
                aria-label="Photo details"
                aria-pressed={showInfo}
                title="Details for the selected photo (I)"
                onClick={() => setShowInfo((value) => !value)}
              >
                <IconInfoCircle size={16} />
                <span className="compare-photos__details-label">Details</span>
              </Button>
            </div>
            <WindowControls className="lightbox-topbar__window-controls compare-photos__window-controls" />
          </div>
        </header>
        <div className={`compare-photos__body${showInfo ? ' with-info' : ''}`}>
          <div className="compare-photos__panes">
            {([0, 1] as const).map((side) => (
              <ComparisonPane
                key={pair[side].id}
                side={side}
                asset={assets[side]}
                active={active === side}
                viewport={viewports[side]}
                onActivate={setActive}
                onViewportChange={updateViewport}
                onFrameChange={updateFrame}
              />
            ))}
          </div>
          <footer className="compare-photos__footer">
            <span className="compare-photos__hint">
              Click a photo to select it. Scroll to zoom, drag to pan.
            </span>
            <div className="compare-photos__zoom" role="group" aria-label="Photo zoom">
              <Button
                variant="ghost"
                size="icon"
                disabled={!frames[active]}
                aria-label="Zoom out"
                onClick={() => stepZoom(1 / 1.25)}
              >
                <IconMinus size={16} />
              </Button>
              <span className="compare-photos__zoom-value" aria-live="polite">
                {currentZoom === 'fit' ? 'Fit' : `${Math.round(currentZoom * 100)}%`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                disabled={!frames[active]}
                aria-label="Zoom in"
                onClick={() => stepZoom(1.25)}
              >
                <IconPlus size={16} />
              </Button>
              <Button
                variant={currentZoom === 'fit' ? 'secondary' : 'ghost'}
                size="sm"
                disabled={!frames[active]}
                onClick={() => zoom('fit')}
                title="Show the whole photo (0)"
              >
                Fit
              </Button>
              <Button
                variant={currentZoom === 1 ? 'secondary' : 'ghost'}
                size="sm"
                disabled={!frames[active]}
                onClick={() => zoom(1)}
                title="Actual size: one image pixel per screen pixel (1)"
              >
                100%
              </Button>
            </div>
          </footer>
        </div>
        {showInfo && (
          <LightboxImageContext.Provider value={infoContext}>
            <LightboxInfoPanel img={assets[active]} isActive onClose={closeInfo} />
          </LightboxImageContext.Provider>
        )}
      </DialogContent>
    </Dialog>
  );
}
