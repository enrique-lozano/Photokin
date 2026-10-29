import { getFileExtensionFromPath, WEBVIEW_DISPLAYABLE_IMAGE_FORMATS } from '@/common/supportedFormats';
import { Skeleton } from '@/components/ui/skeleton';
import { PersonRegion } from '@/db/models/PersonInfo';
import { AreaBox } from '@/db/models/TagRegionInfoDTO';
import {
  getCachedThumbnailPath,
  resolveThumbnailPath,
  THUMBNAIL_SIZE_MAX_PIXELS,
} from '@/media/thumbnails/thumbnail';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import { pathToImageSrc } from '@/system/diskManager';
import { IconUser } from '@tabler/icons-react';
import clsx from 'clsx';
import { CSSProperties, useEffect, useState } from 'react';
import './faceThumbnail.css';
import { useSharpFaceCrop } from './useSharpFaceCrop';

/** Face crop scale factor: pulls back from the detection box so hair and shoulders fill the tile. */
const FACE_CROP_SCALE = 1.3;

/**
 * Whether the DEFAULT thumbnail already holds more face than a tile can show,
 * making a read of the original pure cost. Thumbnails are normalised to their
 * longest side, which is the side the larger of the two fractions spans.
 */
function _thumbnailResolvesFace(area: AreaBox): boolean {
  const thumbnailFacePx =
    Math.max(area.w, area.h) * FACE_CROP_SCALE * THUMBNAIL_SIZE_MAX_PIXELS[ThumbnailSize.DEFAULT];

  return thumbnailFacePx >= 20 * window.devicePixelRatio;
}

/** Keeps a window of `size` inside 0..1 by sliding it, never by shrinking it. */
function _windowStart(center: number, size: number): number {
  return Math.min(Math.max(center - size / 2, 0), Math.max(0, 1 - size));
}

/**
 * `object-view-box` insets for a circular (or cover-fit) face crop.
 *
 * `imageAspectRatio` (width / height) is what makes the window square in
 * *pixels*: `w` and `h` are fractions of different sides, so without it the
 * window stretches along the photo's longer side. Centred faces hide that —
 * `object-fit: cover` trims the excess — but a face near an edge slides its
 * window inwards instead, and then the untrimmed band shows up as a face that
 * looks zoomed out and off-centre.
 */
export function faceCropViewBox(area: AreaBox, imageAspectRatio?: number): CSSProperties {
  const aspect =
    imageAspectRatio && Number.isFinite(imageAspectRatio) && imageAspectRatio > 0 ? imageAspectRatio : 1;

  let width = Math.max(area.w, area.h / aspect) * FACE_CROP_SCALE;
  let height = width * aspect;

  // A window wider or taller than the photo cannot be honoured; shrink both
  // sides together so it stays square rather than clamping into a rectangle.
  const fit = Math.min(1, 1 / width, 1 / height);
  width *= fit;
  height *= fit;

  const left = _windowStart(area.x, width);
  const top = _windowStart(area.y, height);

  return {
    objectViewBox: `inset(${top * 100}% ${(1 - left - width) * 100}% ${(1 - top - height) * 100}% ${left * 100}%)`,
  } as CSSProperties;
}

type FaceThumbnailProps = {
  region?: PersonRegion;
  className?: string;
  /**
   * Fades a crop of the original in over the thumbnail crop, for the face
   * surfaces where a 480px thumbnail leaves a small face too soft to judge.
   * Reading an original is expensive, so it applies only to faces the thumbnail
   * cannot resolve, skips formats the webview cannot paint, and loads lazily.
   * Needs a positioned parent, since the layer fills it.
   */
  sharp?: boolean;
};

const cachedSrc = (assetId: string) => {
  const path = getCachedThumbnailPath(assetId, ThumbnailSize.DEFAULT);
  return path ? pathToImageSrc(path) : null;
};

export function FaceThumbnail({ region, className, sharp = false }: FaceThumbnailProps) {
  // Hydrate from the in-memory path cache so an already-resolved face paints
  // immediately. The People sidebar and grid show the same people side by side,
  // and resolving a path costs several IPC round-trips per thumbnail.
  const [source, setSource] = useState(() => ({
    assetId: region?.assetId,
    src: region ? cachedSrc(region.assetId) : null,
    failed: false,
  }));
  const src = source.assetId === region?.assetId ? source.src : null;
  // State, not a ref: the node arrives on a later render than the first, and the
  // upgrade has to start observing it when it does.
  const [thumbnailNode, setThumbnailNode] = useState<HTMLElement | null>(null);

  const sharpCandidate =
    region &&
    sharp &&
    !_thumbnailResolvesFace(region.area) &&
    WEBVIEW_DISPLAYABLE_IMAGE_FORMATS.has(getFileExtensionFromPath(region.path))
      ? pathToImageSrc(region.path)
      : null;

  const sharpSrc = useSharpFaceCrop(src ? thumbnailNode : null, sharpCandidate);

  useEffect(() => {
    if (!region || !thumbnailNode) return;
    const currentRegion = region;

    const cached = cachedSrc(currentRegion.assetId);
    if (cached) {
      setSource({ assetId: currentRegion.assetId, src: cached, failed: false });
      return;
    }

    let cancelled = false;

    async function resolveSource() {
      const thumbnailPath = await resolveThumbnailPath(
        { id: currentRegion.assetId, fullPath: currentRegion.path },
        ThumbnailSize.DEFAULT,
      );

      if (cancelled) return;
      setSource({
        assetId: currentRegion.assetId,
        src: pathToImageSrc(thumbnailPath ?? currentRegion.path),
        failed: false,
      });
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void resolveSource().catch((error) => {
          if (cancelled) return;
          console.error('Could not resolve face thumbnail', error);
          setSource({ assetId: currentRegion.assetId, src: null, failed: true });
        });
      },
      { rootMargin: '120px' },
    );
    observer.observe(thumbnailNode);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // Observe the placeholder before requesting any disk work. Equivalent
    // region objects from a live refresh must not restart the lookup.
  }, [region?.assetId, region?.path, thumbnailNode]);

  if (!region || (source.assetId === region.assetId && source.failed)) {
    return (
      <span className={clsx('face-thumbnail', 'fallback', className)}>
        <IconUser size={14} />
      </span>
    );
  }

  if (!src) {
    return <Skeleton ref={setThumbnailNode} className={clsx('face-thumbnail', className)} aria-hidden />;
  }

  const viewBox = faceCropViewBox(region.area);

  return (
    <>
      <img
        ref={setThumbnailNode}
        className={clsx('face-thumbnail', className)}
        src={src}
        alt="Face preview"
        style={viewBox}
      />
      {sharpSrc && (
        <img
          className={clsx('face-thumbnail', 'face-thumbnail-sharp', className)}
          src={sharpSrc}
          alt=""
          aria-hidden
          style={viewBox}
        />
      )}
    </>
  );
}
