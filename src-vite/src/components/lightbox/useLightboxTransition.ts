import type { LightboxOrigin } from '@/context/LightboxContext';
import type { AssetInClient } from '@/db/models/AssetInClient';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  getDisplayedImageRect,
  getImageClipPath,
  getThumbnailTransitionFrame,
  type DisplayedImageRect,
} from './lightboxImageGeometry';

const OPEN_DURATION_MS = 320;
const CLOSE_DURATION_MS = 240;
const NAVIGATION_DURATION_MS = 180;
// Snappy "decelerate" curve: fast start, gentle settle. Matches the CSS fade.
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

function _prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * Looks up the grid thumbnail currently representing `assetId` and returns its
 * on-screen rectangle, or null when it isn't visible (including virtualized cells).
 */
function _findThumbnailRect(assetId: string): LightboxOrigin {
  const el = document.querySelector(`[data-asset-id="${CSS.escape(assetId)}"]`);
  if (!(el instanceof HTMLElement)) return null;

  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) {
    return null;
  }
  let parent = el.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    const bounds = parent.getBoundingClientRect();
    if (
      (/(auto|scroll|hidden|clip)/.test(style.overflowY) &&
        (rect.bottom <= bounds.top || rect.top >= bounds.bottom)) ||
      (/(auto|scroll|hidden|clip)/.test(style.overflowX) &&
        (rect.right <= bounds.left || rect.left >= bounds.right))
    ) {
      return null;
    }
    parent = parent.parentElement;
  }

  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

type UseLightboxTransitionParams = {
  /** The requested image from the parent (null while closed/closing). */
  img: AssetInClient | null;
  origin: LightboxOrigin;
  mediaContainerRef: React.RefObject<HTMLElement | null>;
};

/**
 * Animates an opaque photo above the fading viewer, revealing the grid crop
 * without stretching it. Keeps the rendered image alive until close completes.
 */
export function useLightboxTransition({ img, origin, mediaContainerRef }: UseLightboxTransitionParams) {
  // The image actually painted on screen. Lags behind `img` during the close
  // animation so the element survives long enough to animate out.
  const [renderedImg, setRenderedImg] = useState<AssetInClient | null>(img);
  const [isActive, setIsActive] = useState<boolean>(img != null);

  const mediaElementRef = useRef<HTMLElement | null>(null);
  const runningAnimationRef = useRef<Animation | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOpenRef = useRef<boolean>(img != null);
  const previousRenderedIdRef = useRef(renderedImg?.id ?? null);
  const navigationDirection = useRef(0);
  const pendingNavigationRef = useRef(false);
  const outgoingMediaRef = useRef<HTMLImageElement | null>(null);
  const outgoingAnimationRef = useRef<Animation | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const sharedMediaRef = useRef<{
    image: HTMLImageElement;
    rect: DisplayedImageRect;
    media: HTMLImageElement;
    visibility: string;
    animation: Animation | null;
  } | null>(null);

  const setMediaElement = useCallback((el: HTMLElement | null) => {
    mediaElementRef.current = el;
  }, []);

  const clearOutgoingMedia = useCallback(() => {
    outgoingAnimationRef.current?.cancel();
    outgoingAnimationRef.current = null;
    outgoingMediaRef.current?.remove();
    outgoingMediaRef.current = null;
  }, []);

  const clearSharedMedia = useCallback(() => {
    const shared = sharedMediaRef.current;
    if (!shared) return;
    shared.animation?.cancel();
    shared.image.remove();
    shared.media.style.visibility = shared.visibility;
    sharedMediaRef.current = null;
  }, []);

  const createSharedMedia = useCallback(() => {
    const media = mediaElementRef.current;
    // Videos keep their native playback surface and use the backdrop fade.
    if (!(media instanceof HTMLImageElement) || !media.complete || media.naturalWidth <= 0) return null;

    // Measuring the transformed element also captures the current zoom/pan on close.
    const bounds = media.getBoundingClientRect();
    const displayed = getDisplayedImageRect({
      containerWidth: bounds.width,
      containerHeight: bounds.height,
      naturalWidth: media.naturalWidth,
      naturalHeight: media.naturalHeight,
      scale: 1,
      offset: { x: 0, y: 0 },
    });
    if (!displayed) return null;

    const rect = { ...displayed, left: bounds.left + displayed.left, top: bounds.top + displayed.top };
    const image = new Image();
    image.src = media.currentSrc || media.src;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.className = 'lightbox-transition-image';
    Object.assign(image.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    // Outside the stage: neither its overflow nor its backdrop fade can clip the photo.
    (media.closest('.lightbox') ?? document.body).append(image);
    const shared: NonNullable<typeof sharedMediaRef.current> = {
      image,
      rect,
      media,
      visibility: media.style.visibility,
      animation: null,
    };
    media.style.visibility = 'hidden';
    sharedMediaRef.current = shared;
    return shared;
  }, []);

  const startOpenAnimation = useCallback(() => {
    if (!pendingOpenRef.current) return;
    if (_prefersReducedMotion() || !origin) {
      pendingOpenRef.current = false;
      return;
    }
    const container = mediaContainerRef.current;
    if (!container) return;
    const shared = sharedMediaRef.current ?? createSharedMedia();
    if (!shared) return;
    const bounds = container.getBoundingClientRect();
    const fitted = getDisplayedImageRect({
      containerWidth: bounds.width,
      containerHeight: bounds.height,
      naturalWidth: shared.media.naturalWidth,
      naturalHeight: shared.media.naturalHeight,
      scale: 1,
      offset: { x: 0, y: 0 },
    });
    if (!fitted) {
      clearSharedMedia();
      return;
    }
    const current = shared.animation ? getComputedStyle(shared.image) : null;
    const from = current
      ? { transform: current.transform, clipPath: current.clipPath }
      : getThumbnailTransitionFrame(shared.rect, origin);
    const to = getThumbnailTransitionFrame(shared.rect, {
      ...fitted,
      left: bounds.left + fitted.left,
      top: bounds.top + fitted.top,
    });
    shared.animation?.cancel();
    pendingOpenRef.current = false;
    setIsTransitioning(true);
    shared.animation = shared.image.animate([from, to], {
      duration: OPEN_DURATION_MS,
      easing: EASING,
      fill: 'both',
    });
    shared.animation.onfinish = () => {
      clearSharedMedia();
      setIsTransitioning(false);
    };
  }, [origin, createSharedMedia, clearSharedMedia, mediaContainerRef]);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  // React to open / navigate / close requests coming from the parent.
  useEffect(() => {
    if (img) {
      clearCloseTimer();
      const wasClosed = renderedImg == null;
      if (!wasClosed && !isActive) {
        runningAnimationRef.current?.cancel();
        pendingOpenRef.current = true;
      }
      if (renderedImg && renderedImg.id !== img.id && !_prefersReducedMotion()) {
        clearSharedMedia();
        pendingOpenRef.current = false;
        setIsTransitioning(false);
        const el = mediaElementRef.current;
        if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) {
          clearOutgoingMedia();
          const outgoing = el.cloneNode(false) as HTMLImageElement;
          outgoing.alt = '';
          outgoing.setAttribute('aria-hidden', 'true');
          Object.assign(outgoing.style, {
            position: 'absolute',
            inset: '0',
            pointerEvents: 'none',
            transition: 'none',
          });
          el.before(outgoing);
          outgoingMediaRef.current = outgoing;
        }
        setIsNavigating(true);
      }
      setRenderedImg(img);
      setIsActive(true);
      if (wasClosed) {
        pendingOpenRef.current = true;
      }
    } else if (renderedImg) {
      // Closing: fade the backdrop out (via isActive) and zoom the image back
      // toward its thumbnail, then unmount once the animation completes.
      setIsActive(false);
      pendingOpenRef.current = false;
      pendingNavigationRef.current = false;
      clearOutgoingMedia();
      setIsNavigating(false);

      const closingImg = renderedImg;
      // Offscreen/removed thumbnails use a fade instead of flying out of the viewport.
      const target = _findThumbnailRect(closingImg.id);
      const el = mediaElementRef.current;

      runningAnimationRef.current?.cancel();

      if (!_prefersReducedMotion()) {
        const shared = sharedMediaRef.current ?? (target ? createSharedMedia() : null);
        if (shared) {
          const current = getComputedStyle(shared.image);
          const viewport = mediaContainerRef.current?.getBoundingClientRect();
          const from = shared.animation
            ? { transform: current.transform, clipPath: current.clipPath }
            : {
                transform: 'none',
                clipPath: viewport ? getImageClipPath(shared.rect, viewport) : 'inset(0px)',
              };
          shared.animation?.cancel();
          shared.animation = shared.image.animate(
            [from, target ? getThumbnailTransitionFrame(shared.rect, target) : { ...from, opacity: 0 }],
            { duration: CLOSE_DURATION_MS, easing: EASING, fill: 'both' },
          );
          setIsTransitioning(true);
        } else if (el) {
          runningAnimationRef.current = el.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: CLOSE_DURATION_MS,
            easing: EASING,
            fill: 'forwards',
          });
        }
      } else {
        clearSharedMedia();
      }

      clearCloseTimer();
      closeTimerRef.current = setTimeout(
        () => {
          runningAnimationRef.current?.cancel();
          runningAnimationRef.current = null;
          clearSharedMedia();
          setIsTransitioning(false);
          setRenderedImg(null);
        },
        _prefersReducedMotion() ? 0 : CLOSE_DURATION_MS,
      );
    }
    // `renderedImg` intentionally omitted: this effect only reacts to parent
    // requests (`img`/`origin`), not to its own rendered-state bookkeeping.
  }, [img, origin, createSharedMedia, clearSharedMedia, clearOutgoingMedia, mediaContainerRef]);

  // The thumbnail source may mount a commit later, or finish decoding after layout.
  useLayoutEffect(() => {
    if (renderedImg) startOpenAnimation();
  });

  useLayoutEffect(() => {
    const previousId = previousRenderedIdRef.current;
    previousRenderedIdRef.current = renderedImg?.id ?? null;
    pendingNavigationRef.current = Boolean(previousId && renderedImg && previousId !== renderedImg.id);
    if (pendingNavigationRef.current) runningAnimationRef.current?.cancel();
  }, [renderedImg?.id]);

  const onMediaError = () => {
    pendingOpenRef.current = false;
    pendingNavigationRef.current = false;
    clearSharedMedia();
    setIsTransitioning(false);
    clearOutgoingMedia();
    setIsNavigating(false);
  };

  const onMediaLoad = () => {
    startOpenAnimation();
    if (!pendingNavigationRef.current) return;
    pendingNavigationRef.current = false;
    const el = mediaElementRef.current;
    if (!el || _prefersReducedMotion()) {
      onMediaError();
      return;
    }

    runningAnimationRef.current?.cancel();
    const distance = navigationDirection.current * 80;
    if (outgoingMediaRef.current) {
      outgoingAnimationRef.current = outgoingMediaRef.current.animate(
        [
          { opacity: 1, translate: '0 0' },
          { opacity: 0, translate: `${-distance}px 0` },
        ],
        { duration: NAVIGATION_DURATION_MS, easing: EASING, fill: 'forwards' },
      );
    }
    const animation = el.animate([{ translate: `${distance}px 0` }, { translate: '0 0' }], {
      duration: NAVIGATION_DURATION_MS,
      easing: EASING,
    });
    animation.onfinish = () => {
      clearOutgoingMedia();
      setIsNavigating(false);
    };
    runningAnimationRef.current = animation;
  };

  useEffect(() => {
    return () => {
      clearCloseTimer();
      runningAnimationRef.current?.cancel();
      clearSharedMedia();
      clearOutgoingMedia();
    };
  }, [clearOutgoingMedia, clearSharedMedia]);

  return {
    renderedImg,
    isActive,
    isNavigating,
    isTransitioning,
    setMediaElement,
    navigationDirection,
    onMediaLoad,
    onMediaError,
  };
}
