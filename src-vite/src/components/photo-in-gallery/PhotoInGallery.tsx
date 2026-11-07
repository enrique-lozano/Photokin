import { isSupportedVideoPath } from '@/common/supportedFormats';
import { SelectionCheck } from '@/components/ui/selection-check';
import { LightboxOrigin } from '@/context/LightboxContext';
import { isFavoriteRating } from '@/media/metadata/fields/favorite';
import { IconStarFilled } from '@tabler/icons-react';
import clsx from 'clsx';
import React, { memo, useRef } from 'react';
import { AssetInClient } from '../../db/models/AssetInClient';
import { useAppStore } from '../../stores/appState';
import { SelectionActionsContextMenu } from '../selection-actions/SelectionActionsMenu';
import './photoInGallery.css';
import { PhotoInGalleryThumbnail } from './PhotoInGalleryThumbnail';

const SelectButtonIcon = memo(function SelectButtonIcon({ isSelected }: { isSelected: boolean }) {
  const icon = <SelectionCheck selected={isSelected} size={24} />;

  return <div className={`selected-icon-container ${isSelected ? 'is-selected' : 'is-idle'}`}>{icon}</div>;
});

export const PhotoInGallery = memo(function PhotoInGallery(props: {
  img: AssetInClient;
  onImgClick?: (img: AssetInClient, origin?: LightboxOrigin) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedImages = useAppStore((state) => state.selectedImages);
  const setSelectedImages = useAppStore((state) => state.setSelectedImages);

  function handlePhotoClick() {
    if (selectedImages.length > 0) {
      handleSelectImage();
      return;
    }

    if (props.onImgClick) {
      const rect = containerRef.current?.getBoundingClientRect();
      const origin: LightboxOrigin = rect
        ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        : null;
      props.onImgClick(props.img, origin);
    }
  }

  const isImageSelected = selectedImages.some((x) => x.id == props.img.id);
  const isVideo = isSupportedVideoPath(props.img.filename);
  const isFavorite = isFavoriteRating(props.img.metadata.rating);

  const formatVideoDuration = (durationInSeconds: number) => {
    const safeDuration = Math.max(0, Math.floor(durationInSeconds));

    if (safeDuration === 0) {
      return null;
    }

    const seconds = String(safeDuration % 60).padStart(2, '0');
    const totalMinutes = Math.floor(safeDuration / 60);
    const minutes = String(totalMinutes % 60).padStart(2, '0');
    const hours = Math.floor(totalMinutes / 60);

    if (hours > 0) {
      return `${hours}:${minutes}:${seconds}`;
    }

    return `${totalMinutes}:${seconds}`;
  };

  const formattedDuration = isVideo ? formatVideoDuration(props.img.metadata.duration) : null;

  function handleSelectImage(ev?: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    ev?.stopPropagation();

    if (isImageSelected) {
      setSelectedImages(selectedImages.filter((x) => x.id != props.img.id));
      return;
    }

    setSelectedImages([...selectedImages, props.img]);
  }

  // While a selection is active a click adds to it rather than opening the photo.
  const isSelecting = selectedImages.length > 0;

  return (
    <SelectionActionsContextMenu img={props.img} isSelected={isImageSelected}>
      <div
        ref={containerRef}
        data-asset-id={props.img.id}
        className={`button-and-image-container ${isImageSelected ? 'selected' : ''}`}
      >
        <button
          type="button"
          className="photo-open-button focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          aria-label={
            isSelecting
              ? `${isImageSelected ? 'Deselect' : 'Select'} ${props.img.filename}`
              : `Open ${props.img.filename}`
          }
          onClick={() => handlePhotoClick()}
        >
          <div
            className={clsx('image-container select-none bg-transparent transition-transform', {
              'scale-[0.85] rounded-xl': isImageSelected,
            })}
          >
            {/* Gradient overlay on hover */}
            <div
              className={clsx(
                'z-10 top-gradient-effect bg-linear-to-b from-black/25 via-[transparent_25%] ',
                {
                  'rounded-xl': isImageSelected,
                },
              )}
            />

            <PhotoInGalleryThumbnail
              img={props.img}
              isImageSelected={isImageSelected}
            ></PhotoInGalleryThumbnail>
          </div>
        </button>

        {/* Sits above the photo, so it only takes the clicks of its own controls. */}
        <div className="pointer-events-none absolute z-20 w-full h-full">
          <button
            className="photo-select-button absolute p-2 rounded-full focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
            role="checkbox"
            aria-checked={isImageSelected}
            aria-label={isImageSelected ? 'Deselect photo' : 'Select photo'}
            onClick={(ev) => handleSelectImage(ev)}
          >
            <SelectButtonIcon isSelected={isImageSelected}></SelectButtonIcon>
          </button>

          {formattedDuration && <span className="video-duration-badge">{formattedDuration}</span>}
          {isFavorite && (
            <span className="photo-favorite-badge" title="Favorite" aria-label="Favorite">
              <IconStarFilled size={14} />
            </span>
          )}
        </div>
      </div>
    </SelectionActionsContextMenu>
  );
});
