import { useTrashDialog } from '@/components/trash/trashDialogStore';
import { useConfirmationDialog } from '@/components/ui/confirmationDialogStore';
import { LightboxNavigationScope } from '@/context/LightboxContext';
import { AssetsService } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { FaceBoxMode } from '@/stores/appState';
import { useSettingsStore } from '@/stores/settingsStore';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clampPanOffset, getDisplayedImageRect, getPanLimits } from './lightboxImageGeometry';

type UseLightboxInteractionsParams = {
  img: AssetInClient | null;
  isVideo: boolean;
  faceBoxMode: FaceBoxMode;
  /** Scope (gallery filters) within which next/previous are computed. */
  scope?: LightboxNavigationScope;
  onRequestClose?: () => void;
  onNavigate: (img: AssetInClient) => void;
  /** Toggle the info side panel (bound to the "i" key). */
  onToggleInfo?: () => void;
  /** Shared container ref, so the zoom transition can measure the same element. */
  mediaContainerRef: React.MutableRefObject<HTMLDivElement | null>;
};

export function useLightboxInteractions(params: UseLightboxInteractionsParams) {
  const { img, isVideo, faceBoxMode, scope, onNavigate, onRequestClose, onToggleInfo, mediaContainerRef } =
    params;
  const [scale, setScale] = useState<number>(1);
  const viewerMouseWheel = useSettingsStore((state) => state.viewerMouseWheel);
  const lastWheelNavigationRef = useRef<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setDragging] = useState(false);
  const [dragOrigin, setDragOrigin] = useState({ x: 0, y: 0 });
  const [adjacentAssets, setAdjacentAssets] = useState<{
    previous: AssetInClient | null;
    next: AssetInClient | null;
  }>({ previous: null, next: null });
  const [hoveredEdge, setHoveredEdge] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  // Whether the cursor is actively moving over the media. Used by the "auto"
  // face box mode to reveal the overlay while the pointer moves over the image.
  const [isCursorActive, setCursorActive] = useState(false);
  // Cursor position relative to the media container (only tracked in "hover"
  // mode, where each box reveals itself when the cursor is inside it).
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const cursorIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the image is still easing towards the last requested transform.
  const [isTransformSettling, setTransformSettling] = useState(false);
  const transformSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const containerSizeRef = useRef({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Sub-pixel overflow from rounding should not turn the cursor into a grab.
  const PAN_AXIS_EPSILON_PX = 0.5;

  const panLimits = useMemo(
    () =>
      getPanLimits({
        containerWidth: containerSize.width,
        containerHeight: containerSize.height,
        naturalWidth: imageNaturalSize.width,
        naturalHeight: imageNaturalSize.height,
        scale,
      }),
    [containerSize.height, containerSize.width, imageNaturalSize.height, imageNaturalSize.width, scale],
  );
  const canPanX = (panLimits?.maxX ?? 0) > PAN_AXIS_EPSILON_PX;
  const canPanY = (panLimits?.maxY ?? 0) > PAN_AXIS_EPSILON_PX;
  const isPannable = !params.isVideo && (canPanX || canPanY);
  const imageStyle = useMemo(
    () => ({
      transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
    }),
    [offset.x, offset.y, scale],
  );

  // The image animates towards each new transform (`.lightbox-media img`), so
  // anything positioned from `scale`/`offset` is ahead of the painted pixels
  // until that animation ends.
  const TRANSFORM_SETTLE_DELAY_MS = 220;

  const clearTransformSettling = () => {
    if (transformSettleTimeoutRef.current) {
      clearTimeout(transformSettleTimeoutRef.current);
      transformSettleTimeoutRef.current = null;
    }
    setTransformSettling(false);
  };

  const markTransformSettling = () => {
    setTransformSettling(true);
    if (transformSettleTimeoutRef.current) {
      clearTimeout(transformSettleTimeoutRef.current);
    }
    transformSettleTimeoutRef.current = setTimeout(() => {
      transformSettleTimeoutRef.current = null;
      setTransformSettling(false);
    }, TRANSFORM_SETTLE_DELAY_MS);
  };

  const resetZoomAndPan = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    clearTransformSettling();
  };

  const clearEdgeHover = () => {
    setHoveredEdge((current) => (current.left || current.right ? { left: false, right: false } : current));
  };

  // Hide the face boxes after the cursor stops moving for a short while.
  const CURSOR_IDLE_DELAY_MS = 1500;
  const markCursorActive = () => {
    setCursorActive(true);
    if (cursorIdleTimeoutRef.current) {
      clearTimeout(cursorIdleTimeoutRef.current);
    }
    cursorIdleTimeoutRef.current = setTimeout(() => {
      setCursorActive(false);
    }, CURSOR_IDLE_DELAY_MS);
  };

  const clearCursorActive = () => {
    if (cursorIdleTimeoutRef.current) {
      clearTimeout(cursorIdleTimeoutRef.current);
      cursorIdleTimeoutRef.current = null;
    }
    setCursorActive(false);
    setCursorPosition((current) => (current === null ? current : null));
  };

  useEffect(() => {
    return () => {
      if (cursorIdleTimeoutRef.current) {
        clearTimeout(cursorIdleTimeoutRef.current);
      }
      if (transformSettleTimeoutRef.current) {
        clearTimeout(transformSettleTimeoutRef.current);
      }
      if (pointerFrameRef.current !== null) {
        cancelAnimationFrame(pointerFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    clearCursorActive();
  }, [img?.id]);

  useEffect(() => {
    if (!img) {
      setAdjacentAssets({ previous: null, next: null });
      return;
    }

    resetZoomAndPan();

    let isUnmounted = false;
    const currentImg = img;

    const dateField = scope?.dateField ?? 'date';
    // Walk along the same timestamp the gallery is grouped by, so prev/next in
    // a "Recently added" view follow added-order rather than capture date.
    const currentDate = dateField === 'dateAdded' ? currentImg.dateAdded : currentImg.metadata.date;

    (async () => {
      const [previous, next] = await Promise.all([
        AssetsService.getAdjacentFile({
          currentAsset: { id: currentImg.id, date: currentDate },
          direction: 'previous',
          searchQuery: scope?.searchQuery,
          assetIds: scope?.assetIds,
          dateField,
          preserveOrder: scope?.preserveOrder,
        }),
        AssetsService.getAdjacentFile({
          currentAsset: { id: currentImg.id, date: currentDate },
          direction: 'next',
          searchQuery: scope?.searchQuery,
          assetIds: scope?.assetIds,
          dateField,
          preserveOrder: scope?.preserveOrder,
        }),
      ]);

      if (!isUnmounted) {
        setAdjacentAssets({ previous, next });
      }
    })();

    return () => {
      isUnmounted = true;
    };
  }, [img, scope]);

  useEffect(() => {
    clearEdgeHover();
    setImageNaturalSize({ width: 0, height: 0 });
  }, [img?.id]);

  useEffect(() => {
    const element = mediaContainerRef.current;
    if (!element) return;

    const publishSize = (width: number, height: number) => {
      containerSizeRef.current = { width, height };
      setContainerSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };

    publishSize(element.clientWidth, element.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      publishSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [mediaContainerRef]);

  // Zooming out or resizing the stage (info panel) can leave a pan that no
  // longer covers the frame. Pull the photo back before paint.
  useLayoutEffect(() => {
    setOffset((current) => {
      const next = clampPanOffset({
        containerWidth: containerSize.width,
        containerHeight: containerSize.height,
        naturalWidth: imageNaturalSize.width,
        naturalHeight: imageNaturalSize.height,
        scale,
        offset: current,
      });
      if (next.x === current.x && next.y === current.y) return current;
      return next;
    });
  }, [containerSize.height, containerSize.width, imageNaturalSize.height, imageNaturalSize.width, scale]);

  const updateScale = (delta: number) => {
    if ((delta > 0 && scale < 4) || (delta < 0 && scale > 1)) {
      markTransformSettling();
    }

    setScale((prev) => {
      const nextScale = Math.min(4, Math.max(1, Number((prev + delta).toFixed(2))));
      if (nextScale === 1) {
        setOffset({ x: 0, y: 0 });
      }
      return nextScale;
    });
  };

  useEffect(() => {
    if (!img) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (useTrashDialog.getState().open || useConfirmationDialog.getState().open) return;
      // An inner control (e.g. the info panel's tablist) already handled this key.
      if (event.defaultPrevented) return;

      // Let text fields (title/description/filename…) handle their own keys, so
      // arrows move the caret and +/- type characters instead of navigating or
      // zooming the lightbox.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === 'Escape') {
        onRequestClose?.();
      } else if (event.key === 'ArrowLeft' && adjacentAssets.previous) {
        onNavigate(adjacentAssets.previous);
      } else if (event.key === 'ArrowRight' && adjacentAssets.next) {
        onNavigate(adjacentAssets.next);
      } else if ((event.key === '+' || event.key === '=') && !isVideo) {
        updateScale(0.2);
      } else if ((event.key === '-' || event.key === '_') && !isVideo) {
        updateScale(-0.2);
      } else if (
        (event.key === 'i' || event.key === 'I') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        onToggleInfo?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adjacentAssets.next, adjacentAssets.previous, img, isVideo, onNavigate, onRequestClose, onToggleInfo]);

  const onMediaWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!img || event.deltaY === 0) return;
    if (useTrashDialog.getState().open || useConfirmationDialog.getState().open) return;

    if (viewerMouseWheel === 'zoom' || event.ctrlKey) {
      if (isVideo) return;
      event.preventDefault();
      updateScale(event.deltaY < 0 ? 0.2 : -0.2);
      return;
    }

    event.preventDefault();
    const now = performance.now();
    if (lastWheelNavigationRef.current !== null && now - lastWheelNavigationRef.current < 250) return;
    const adjacent = event.deltaY < 0 ? adjacentAssets.previous : adjacentAssets.next;
    if (!adjacent) return;
    lastWheelNavigationRef.current = now;
    onNavigate(adjacent);
  };

  const onMediaMouseDown = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!isPannable) return;

    event.preventDefault();
    setDragging(true);
    setDragOrigin({
      x: event.clientX - offset.x,
      y: event.clientY - offset.y,
    });
    // Nothing hover-driven should linger over the photo while panning it.
    clearEdgeHover();
    clearCursorActive();
  };

  // Pointer moves fire far more often than the screen refreshes (high polling
  // rate mice reach ~1kHz), and each one would read the container geometry and
  // re-render the viewer. Only the last position of each frame is processed.
  const handlePointerFrame = (point: { clientX: number; clientY: number }) => {
    if (isDragging && isPannable) {
      // Mid-drag only the offset matters: the edge arrows and the face boxes are
      // hidden, so skip the layout read and hit-tests they would need. The pan
      // is limited to axes where the photo overflows the frame.
      const frame = containerSizeRef.current;
      setOffset((current) => {
        const next = clampPanOffset({
          containerWidth: frame.width,
          containerHeight: frame.height,
          naturalWidth: imageNaturalSize.width,
          naturalHeight: imageNaturalSize.height,
          scale,
          offset: {
            x: point.clientX - dragOrigin.x,
            y: point.clientY - dragOrigin.y,
          },
        });
        if (next.x === current.x && next.y === current.y) return current;
        return next;
      });
      return;
    }

    const mediaBounds = mediaContainerRef.current?.getBoundingClientRect();
    if (mediaBounds) {
      const edgeThreshold = Math.min(140, mediaBounds.width * 0.12);
      const x = point.clientX - mediaBounds.left;
      const y = point.clientY - mediaBounds.top;
      const left = x >= 0 && x <= edgeThreshold;
      const right = x >= mediaBounds.width - edgeThreshold && x <= mediaBounds.width;
      setHoveredEdge((current) =>
        current.left === left && current.right === right ? current : { left, right },
      );

      // Only reveal the face boxes while the cursor is over the displayed
      // photo itself, not the letterbox/dark area around it.
      const imageRect = getDisplayedImageRect({
        containerWidth: mediaBounds.width,
        containerHeight: mediaBounds.height,
        naturalWidth: imageNaturalSize.width,
        naturalHeight: imageNaturalSize.height,
        scale,
        offset,
      });
      const isOverImage =
        !!imageRect &&
        x >= imageRect.left &&
        x <= imageRect.left + imageRect.width &&
        y >= imageRect.top &&
        y <= imageRect.top + imageRect.height;

      if (isOverImage && faceBoxMode !== 'never') {
        if (faceBoxMode === 'hover') {
          setCursorPosition((current) =>
            current && current.x === x && current.y === y ? current : { x, y },
          );
        } else {
          markCursorActive();
        }
      } else {
        clearCursorActive();
      }
    }
  };

  // Read through a ref so a frame scheduled just before a re-render still runs
  // against the current drag origin, scale and offset.
  const handlePointerFrameRef = useRef(handlePointerFrame);
  useEffect(() => {
    handlePointerFrameRef.current = handlePointerFrame;
  });

  const onMediaMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    pendingPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
    if (pointerFrameRef.current !== null) {
      return;
    }

    pointerFrameRef.current = requestAnimationFrame(() => {
      pointerFrameRef.current = null;
      const point = pendingPointerRef.current;
      if (point) {
        handlePointerFrameRef.current(point);
      }
    });
  };

  const stopDragging = () => {
    // Drop the frame that may still be queued: applying a new offset in the same
    // commit that re-enables the transform transition would animate the image
    // away from where the pointer left it.
    if (isDragging && pointerFrameRef.current !== null) {
      cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    setDragging(false);
  };

  const onMouseLeaveMedia = () => {
    stopDragging();
    clearEdgeHover();
    clearCursorActive();
  };

  const onImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    setImageNaturalSize({ width: target.naturalWidth, height: target.naturalHeight });
  };

  return {
    scale,
    offset,
    isPannable,
    adjacentAssets,
    hoveredEdge,
    imageNaturalSize,
    isCursorActive,
    cursorPosition,
    isDragging,
    /** Panning or zooming: overlays anchored to the image are stale until it settles. */
    isTransformingMedia: isDragging || isTransformSettling,
    mediaContainerRef,
    imageStyle,
    updateScale,
    onMediaWheel,
    onMediaMouseDown,
    onMediaMouseMove,
    stopDragging,
    onMouseLeaveMedia,
    onImageLoad,
  };
}
