import { RegionsService } from '@/db/api/services/regions.service';
import { TagsService } from '@/db/api/services/tags.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { FaceReviewStatus, faceReviewStatus } from '@/media/faces/faceReviewStatus';
import { FaceBoxMode } from '@/stores/appState';
import { IconCheck, IconQuestionMark } from '@tabler/icons-react';
import clsx from 'clsx';
import { CSSProperties, RefObject, useEffect, useMemo, useState } from 'react';
import { estimateFaceLabelWidth, faceLabelPlacement } from './faceLabelPlacement';
import { getDisplayedImageRect } from './lightboxImageGeometry';

type LightboxFaceBoxesProps = {
  imgId: string;
  mode: FaceBoxMode;
  /** Used by "auto" mode: true while the cursor moves over the photo. */
  isCursorActive: boolean;
  /** Used by "hover" mode: cursor position relative to the media container. */
  cursorPosition: { x: number; y: number } | null;
  scale: number;
  offset: { x: number; y: number };
  /** True while the image is being panned or zoomed towards a new transform. */
  isTransforming: boolean;
  imageNaturalSize: { width: number; height: number };
  mediaContainerRef: RefObject<HTMLDivElement | null>;
  highlightedFaceId?: string | null;
};

type PositionedFaceBox = {
  id: string;
  name: string;
  status: FaceReviewStatus;
  left: number;
  top: number;
  width: number;
  height: number;
  /** The media frame would clip a pill drawn under this box. */
  labelAbove: boolean;
  /** Horizontal nudge so the pill stays inside the media frame. */
  labelShift: number;
};

export function LightboxFaceBoxes(props: LightboxFaceBoxesProps) {
  const { data: faceRegions } = useLiveQuery(
    () => RegionsService.getImageRegions(props.imgId),
    ['tagRegionInfo'],
    { extDependencies: [props.imgId] },
  );

  const { data: tags } = useLiveQuery(() => TagsService.getAll(), ['tags']);

  const tagNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const tag of tags ?? []) {
      map.set(tag.id, tag.name);
    }
    return map;
  }, [tags]);

  // Track the container size so boxes are repositioned whenever it changes
  // (window resize, info panel opening/closing, etc.).
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const mediaContainer = props.mediaContainerRef.current;
    if (!mediaContainer || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(mediaContainer);
    setContainerSize({ width: mediaContainer.clientWidth, height: mediaContainer.clientHeight });

    return () => observer.disconnect();
  }, [props.mediaContainerRef]);

  // The image animates towards each new transform, so mid-pan/zoom the live
  // scale/offset describe pixels that aren't on screen yet. The boxes are hidden
  // during that window anyway, so they stay on the last settled transform and
  // only catch up once the image stopped moving.
  const [settledTransform, setSettledTransform] = useState({
    scale: props.scale,
    offset: props.offset,
  });
  useEffect(() => {
    if (props.isTransforming) {
      return;
    }
    setSettledTransform({ scale: props.scale, offset: props.offset });
  }, [props.isTransforming, props.scale, props.offset.x, props.offset.y]);

  const boxes = useMemo<PositionedFaceBox[]>(() => {
    if (!faceRegions || faceRegions.length === 0) {
      return [];
    }

    const imageRect = getDisplayedImageRect({
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
      naturalWidth: props.imageNaturalSize.width,
      naturalHeight: props.imageNaturalSize.height,
      scale: settledTransform.scale,
      offset: settledTransform.offset,
    });
    if (!imageRect) {
      return [];
    }

    return faceRegions.map((region) => {
      const area = region.areaInfo;
      const name = region.tagId ? (tagNameById.get(region.tagId) ?? 'Unknown') : 'Unknown';
      const status = faceReviewStatus(region);
      const left = imageRect.left + area.left * imageRect.width;
      const top = imageRect.top + area.top * imageRect.height;
      const width = area.w * imageRect.width;
      const height = area.h * imageRect.height;
      const placement = faceLabelPlacement(
        { left, top, width, height },
        containerSize,
        estimateFaceLabelWidth(name, status !== 'unnamed'),
      );
      return {
        id: region.id,
        name,
        status,
        left,
        top,
        width,
        height,
        labelAbove: placement.above,
        labelShift: placement.shiftX,
      };
    });
  }, [
    faceRegions,
    tagNameById,
    settledTransform,
    props.imageNaturalSize.width,
    props.imageNaturalSize.height,
    containerSize.width,
    containerSize.height,
  ]);

  // External highlights override the configured visibility mode.
  if (boxes.length === 0) {
    return null;
  }

  const isBoxVisible = (box: PositionedFaceBox): boolean => {
    // Nothing is shown mid pan/zoom, so keep the per-box classes stable instead
    // of recomputing hit-tests on every pointer move.
    if (props.isTransforming) {
      return false;
    }
    if (box.id === props.highlightedFaceId) {
      return true;
    }
    if (props.mode === 'never') {
      return false;
    }
    if (props.mode === 'hover') {
      const cursor = props.cursorPosition;
      return (
        !!cursor &&
        cursor.x >= box.left &&
        cursor.x <= box.left + box.width &&
        cursor.y >= box.top &&
        cursor.y <= box.top + box.height
      );
    }
    // "auto": all boxes follow the cursor-moving state.
    return props.isCursorActive;
  };

  return (
    <div className={'lightbox-face-boxes' + (props.isTransforming ? ' isSuppressed' : '')} aria-hidden>
      {boxes.map((box) => (
        <div
          key={box.id}
          className={clsx(
            'lightbox-face-box',
            `lightbox-face-box--${box.status}`,
            isBoxVisible(box) && 'isVisible',
            box.id === props.highlightedFaceId && 'isHighlighted',
            box.labelAbove && 'isLabelAbove',
          )}
          style={
            {
              left: `${box.left}px`,
              top: `${box.top}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
              '--face-label-shift': `${box.labelShift}px`,
            } as CSSProperties
          }
        >
          <span className="lightbox-face-box__label">
            {box.status === 'confirmed' && <IconCheck size={12} stroke={3} />}
            {box.status === 'suggested' && <IconQuestionMark size={12} stroke={3} />}
            {box.name}
          </span>
        </div>
      ))}
    </div>
  );
}
