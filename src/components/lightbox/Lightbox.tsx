import { isSupportedVideoPath } from '@/common/supportedFormats';
import { useTrashDialog } from '@/components/trash/trashDialogStore';
import { confirm, useConfirmationDialog } from '@/components/ui/confirmationDialogStore';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { AssetsService } from '@/db/api/services/assets.service';
import { generateID } from '@/db/models/dbEntityWithID';
import { useLiveAsset } from '@/hooks/useLiveAsset';
import {
  deletePreviewOfFile,
  getOrCreateFullPreview,
  needsGeneratedPreview,
} from '@/media/thumbnails/preview';
import { regenerateThumbnailOfFile } from '@/media/thumbnails/thumbnail';
import { pathToImageSrc } from '@/system/diskManager';
import {
  IconChevronLeft,
  IconChevronRight,
  IconDatabaseImport,
  IconMinus,
  IconPlus,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { LightboxImageContext, LightboxOrigin } from '../../context/LightboxContext';
import { AssetInClient } from '../../db/models/AssetInClient';
import { useAppStore } from '../../stores/appState';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatDate } from '../../utils/dateFormatter';
import { Button } from '../ui/button';
import { copyImageToClipboardWithFeedback } from './copyImageAction';
import './lightbox.css';
import { LightboxFaceBoxes } from './LightboxFaceBoxes';
import { LightboxFilmstrip } from './LightboxFilmstrip';
import { LightboxTopBar } from './LightboxTopBar';
import { LightboxZoomMap } from './LightboxZoomMap';
import { LightboxInfoPanel } from './PhotoInfoPanel';
import { useLightboxInteractions } from './useLightboxInteractions';
import { useLightboxTransition } from './useLightboxTransition';
import { useScopedAssetIds } from './useScopedAssetIds';
import { usePhotoSource } from './usePhotoSource';

export function Lightbox(params: {
  img: AssetInClient | null;
  origin?: LightboxOrigin;
  onClose?: () => void;
}) {
  const { setLightboxImage, lightboxScope } = useContext(LightboxImageContext);
  const [isInfoPanelActive, setInfoPanelActive] = useState<boolean>(false);
  const [isRunningAction, setIsRunningAction] = useState(false);
  const [hoveredFaceId, setHoveredFaceId] = useState<string | null>(null);
  const faceBoxMode = useAppStore((state) => state.faceBoxMode);
  const setFaceBoxMode = useAppStore((state) => state.setFaceBoxMode);
  const autoPlayVideo = useSettingsStore((state) => state.autoPlayVideo);
  const loopVideo = useSettingsStore((state) => state.loopVideo);

  const mediaContainerRef = useRef<HTMLDivElement | null>(null);
  const {
    renderedImg,
    isActive,
    isNavigating,
    isTransitioning,
    setMediaElement,
    navigationDirection,
    onMediaLoad,
    onMediaError,
  } = useLightboxTransition({
    img: params.img,
    origin: params.origin ?? null,
    mediaContainerRef,
  });

  // Live version of the active asset, kept in sync with the DB so edits (title,
  // rating, description, date…) refresh the lightbox
  const liveAsset = useLiveAsset(params.img?.id ?? null, params.img);

  // The image currently painted: `renderedImg` owns the open/close lifecycle
  // (it survives the close animation to zoom back to its thumbnail), while
  // `liveAsset` upgrades its *content* to the freshest DB row. The id guard
  // avoids showing a stale/other asset while the live query catches up during
  // navigation or close.
  const displayImg = liveAsset && renderedImg && liveAsset.id === renderedImg.id ? liveAsset : renderedImg;
  const isVideo = displayImg ? isSupportedVideoPath(displayImg.filename) : false;

  // Ordered ids of every photo in the active scope, driving the filmstrip and
  // the position counter (same order as the gallery / prev-next navigation).
  const { ids: scopedAssetIds, isLoading: scopedIdsLoading } = useScopedAssetIds(
    lightboxScope,
    displayImg != null,
  );
  const currentIndex = displayImg ? scopedAssetIds.indexOf(displayImg.id) : -1;
  // Keep the filmstrip slot reserved while ids load so the stage doesn't jump
  // when the strip appears a moment later.
  const showFilmstrip = displayImg != null && (scopedAssetIds.length > 1 || scopedIdsLoading);

  const { src: displaySrc, setSrc: setDisplaySrc } = usePhotoSource(displayImg, !isVideo);

  // The handlers below are passed to memoized children, so they keep a stable
  // identity while panning re-renders the viewer at frame rate.
  const handleReloadMetadata = useCallback(async () => {
    const img = displayImg;
    if (!img || isRunningAction) return;

    const confirmed = await confirm({
      icon: <IconDatabaseImport size={24} />,
      title: `Reload metadata from “${img.filename}”?`,
      description:
        'Photokin will re-read metadata from this file. In-app edits that were never written back will be overwritten; the original file is not modified.',
      confirmLabel: 'Reload metadata',
      tone: 'warning',
    });
    if (!confirmed) return;

    setIsRunningAction(true);
    const toastId = generateID();
    toast.loading('Reloading metadata...', { id: toastId });

    try {
      const updated = await AssetsService.reloadMetadataForAsset(img);
      setLightboxImage(updated);
      toast.success('Metadata reloaded from file', { id: toastId });
    } catch (error) {
      toast.error(`Could not reload metadata: ${String(error)}`, { id: toastId });
    } finally {
      setIsRunningAction(false);
    }
  }, [displayImg, isRunningAction, setLightboxImage]);

  const handleReloadThumbnail = useCallback(async () => {
    const img = displayImg;
    if (!img || isRunningAction) return;

    setIsRunningAction(true);
    const toastId = generateID();
    toast.loading('Regenerating thumbnail...', { id: toastId });

    try {
      await regenerateThumbnailOfFile(img);

      // Refresh the full-size preview too for formats that rely on one, so a
      // changed source file is reflected in the lightbox.
      if (needsGeneratedPreview(img.filename)) {
        await deletePreviewOfFile(img.id);
        const preview = await getOrCreateFullPreview(img);
        if (preview) setDisplaySrc(pathToImageSrc(preview));
      }

      toast.success('Thumbnail regenerated', { id: toastId });
    } catch (error) {
      toast.error(`Could not regenerate thumbnail: ${String(error)}`, { id: toastId });
    } finally {
      setIsRunningAction(false);
    }
  }, [displayImg, isRunningAction]);

  const handleCopyImage = useCallback(() => {
    if (!displayImg || isVideo) return;
    void copyImageToClipboardWithFeedback(displayImg);
  }, [displayImg, isVideo]);

  const handleCloseLightbox = useCallback(() => {
    setInfoPanelActive(false);
    params.onClose?.();
  }, [params.onClose]);

  // Anything can close the lightbox through the context (e.g. opening a person
  // from the People section), not just the close button above; without this
  // the info drawer would stay open over the page with nothing in it.
  useEffect(() => {
    if (!params.img) {
      setInfoPanelActive(false);
      setHoveredFaceId(null);
    }
  }, [params.img]);

  const handleToggleInfoPanel = useCallback(() => setInfoPanelActive((value) => !value), []);
  const handleCloseInfoPanel = useCallback(() => setInfoPanelActive(false), []);
  const handleSelectAsset = useCallback(
    (asset: AssetInClient) => {
      const nextIndex = scopedAssetIds.indexOf(asset.id);
      navigationDirection.current =
        currentIndex >= 0 && nextIndex >= 0 ? Math.sign(nextIndex - currentIndex) : 0;
      setLightboxImage(asset);
    },
    [currentIndex, scopedAssetIds, navigationDirection, setLightboxImage],
  );

  const interactions = useLightboxInteractions({
    img: params.img,
    isVideo,
    faceBoxMode,
    scope: lightboxScope,
    mediaContainerRef,
    onNavigate: handleSelectAsset,
    onRequestClose: handleCloseLightbox,
    onToggleInfo: handleToggleInfoPanel,
  });

  const zoomLabel = interactions.scale === 1 ? 'Fit' : `${Math.round(interactions.scale * 100)}%`;

  const handleDelete = useCallback(async () => {
    const img = displayImg;
    if (!img) return;

    const currentIndex = scopedAssetIds.indexOf(img.id);
    let replacementId =
      currentIndex >= 0 ? (scopedAssetIds[currentIndex + 1] ?? scopedAssetIds[currentIndex - 1]) : null;
    if (!replacementId) {
      const dateField = lightboxScope?.dateField ?? 'date';
      const currentDate = dateField === 'dateAdded' ? img.dateAdded : img.metadata.date;
      const [previous, next] = await Promise.all([
        AssetsService.getAdjacentFile({
          currentAsset: { id: img.id, date: currentDate },
          direction: 'previous',
          searchQuery: lightboxScope?.searchQuery,
          assetIds: lightboxScope?.assetIds,
          dateField,
        }),
        AssetsService.getAdjacentFile({
          currentAsset: { id: img.id, date: currentDate },
          direction: 'next',
          searchQuery: lightboxScope?.searchQuery,
          assetIds: lightboxScope?.assetIds,
          dateField,
        }),
      ]);
      replacementId = next?.id ?? previous?.id ?? null;
    }

    // Already-trashed photos (opened from the Trash tab) are deleted for good;
    // live photos are moved to Trash.
    const outcome = await useTrashDialog.getState().request(img.trashedAt ? 'delete' : 'trash', [img]);
    if (outcome !== 'completed') return;

    if (!replacementId) {
      handleCloseLightbox();
      return;
    }

    try {
      setLightboxImage(await AssetsService.getByUUID(replacementId));
    } catch (error) {
      console.warn('Could not load the next photo after removal', error);
      handleCloseLightbox();
    }
  }, [displayImg, lightboxScope, scopedAssetIds, setLightboxImage, handleCloseLightbox]);

  const handleDeleteClick = useCallback(() => void handleDelete(), [handleDelete]);

  useEffect(() => {
    if (!displayImg) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (useTrashDialog.getState().open || useConfirmationDialog.getState().open) return;

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

      if (!event.repeat && (event.key === 'Delete' || event.key === 'Supr' || event.code === 'Delete')) {
        handleDeleteClick();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [displayImg, handleDeleteClick]);

  const handleReloadMetadataClick = useCallback(() => void handleReloadMetadata(), [handleReloadMetadata]);
  const handleReloadThumbnailClick = useCallback(() => void handleReloadThumbnail(), [handleReloadThumbnail]);

  return (
    <div className="lightbox">
      <div
        className={
          'lightbox-media' +
          (isActive ? ' isActive' : '') +
          (isInfoPanelActive ? ' with-info-modal' : '') +
          (isTransitioning ? ' is-transitioning' : '')
        }
        onMouseMove={interactions.onMediaMouseMove}
        onMouseUp={interactions.stopDragging}
        onMouseLeave={interactions.onMouseLeaveMedia}
      >
        <LightboxTopBar
          img={displayImg}
          isVideo={isVideo}
          isInfoActive={isInfoPanelActive}
          isRunningAction={isRunningAction}
          onToggleInfo={handleToggleInfoPanel}
          onClose={handleCloseLightbox}
          onCopy={handleCopyImage}
          onReloadMetadata={handleReloadMetadataClick}
          onReloadThumbnail={handleReloadThumbnailClick}
          onDelete={handleDeleteClick}
          faceBoxMode={faceBoxMode}
          onFaceBoxModeChange={setFaceBoxMode}
        />

        <div className="lightbox-body">
          <div className="lightbox-stage">
            <div className="img-container" onWheel={interactions.onMediaWheel} ref={mediaContainerRef}>
              {params.img && interactions.adjacentAssets.previous && interactions.hoveredEdge.left && (
                <Button
                  className="lightbox-nav-button left"
                  variant="ghost"
                  size="icon"
                  aria-label="Previous item"
                  onClick={() => handleSelectAsset(interactions.adjacentAssets.previous!)}
                >
                  <IconChevronLeft />
                </Button>
              )}

              {displayImg &&
                (isVideo ? (
                  <video
                    ref={setMediaElement}
                    src={pathToImageSrc(displayImg.fullPath)}
                    controls
                    autoPlay={autoPlayVideo}
                    loop={loopVideo}
                    playsInline
                    onLoadedData={onMediaLoad}
                    onError={onMediaError}
                    className="lightbox-video"
                  />
                ) : displaySrc ? (
                  <img
                    ref={setMediaElement}
                    src={displaySrc}
                    alt="Image detail"
                    style={interactions.imageStyle}
                    className={clsx(
                      interactions.isPannable && 'is-pannable',
                      interactions.isDragging && 'is-dragging',
                    )}
                    onMouseDown={interactions.onMediaMouseDown}
                    onLoad={(event) => {
                      interactions.onImageLoad(event);
                      onMediaLoad();
                    }}
                    onError={onMediaError}
                    draggable={false}
                  />
                ) : isNavigating ? null : (
                  <Skeleton className="lightbox-stage__placeholder" aria-hidden />
                ))}

              {params.img && !isVideo && (
                <LightboxFaceBoxes
                  imgId={params.img.id}
                  mode={faceBoxMode}
                  isCursorActive={interactions.isCursorActive}
                  cursorPosition={interactions.cursorPosition}
                  scale={interactions.scale}
                  offset={interactions.offset}
                  isTransforming={interactions.isTransformingMedia || isNavigating || isTransitioning}
                  imageNaturalSize={interactions.imageNaturalSize}
                  mediaContainerRef={interactions.mediaContainerRef}
                  highlightedFaceId={hoveredFaceId}
                />
              )}

              {params.img && interactions.adjacentAssets.next && interactions.hoveredEdge.right && (
                <Button
                  className="lightbox-nav-button right"
                  variant="ghost"
                  size="icon"
                  aria-label="Next item"
                  onClick={() => handleSelectAsset(interactions.adjacentAssets.next!)}
                >
                  <IconChevronRight />
                </Button>
              )}

              {params.img && (
                <LightboxZoomMap
                  img={params.img}
                  isVideo={isVideo}
                  scale={interactions.scale}
                  offset={interactions.offset}
                  imageNaturalSize={interactions.imageNaturalSize}
                  mediaContainerRef={interactions.mediaContainerRef}
                />
              )}
            </div>

            {displayImg && (
              <div className="lightbox-stage__footer">
                {!isVideo && (
                  <div className="lightbox-zoom-pill">
                    <button
                      type="button"
                      aria-label="Zoom out"
                      disabled={interactions.scale <= 1}
                      onClick={() => interactions.updateScale(-0.2)}
                    >
                      <IconMinus size={16} />
                    </button>
                    <button
                      type="button"
                      className="lightbox-zoom-pill__label"
                      aria-label="Fit to screen"
                      onClick={() => interactions.updateScale(-10)}
                    >
                      {zoomLabel}
                    </button>
                    <button
                      type="button"
                      aria-label="Zoom in"
                      disabled={interactions.scale >= 4}
                      onClick={() => interactions.updateScale(0.2)}
                    >
                      <IconPlus size={16} />
                    </button>
                  </div>
                )}

                {currentIndex >= 0 && scopedAssetIds.length > 1 && (
                  <span className="lightbox-counter">
                    {currentIndex + 1} of {scopedAssetIds.length} ·{' '}
                    {formatDate(displayImg.metadata.date, { dateStyle: 'long' })}
                  </span>
                )}
              </div>
            )}
          </div>

          {showFilmstrip && displayImg && (
            <LightboxFilmstrip
              assetIds={scopedAssetIds}
              currentId={displayImg.id}
              onSelect={handleSelectAsset}
            />
          )}
        </div>
      </div>

      <LightboxInfoPanel
        img={displayImg}
        isActive={isInfoPanelActive}
        onClose={handleCloseInfoPanel}
        onFaceHover={setHoveredFaceId}
      ></LightboxInfoPanel>
    </div>
  );
}
