import { StarRating } from '@/components/lightbox/info/StarRating';
import { PhotoInGallery } from '@/components/photo-in-gallery/PhotoInGallery';
import { PhotoInGalleryThumbnail } from '@/components/photo-in-gallery/PhotoInGalleryThumbnail';
import { RatingMode } from '@/common/ratingModeOptions';
import { LightboxOrigin } from '@/context/LightboxContext';
import { AssetsService } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { useHorizontalScrollFades } from '@/hooks/useHorizontalScrollFades';
import { isFavoriteRating, FAVORITE_RATING } from '@/media/metadata/fields/favorite';
import { useAppStore } from '@/stores/appState';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatDate } from '@/utils/dateFormatter';
import { formatBytes } from '@/utils/numberFormatter';
import { IconHeart, IconHeartFilled } from '@tabler/icons-react';
import clsx from 'clsx';
import { memo, useRef } from 'react';

/** Strip thumbnails are taller than grid rows so a single row reads at a glance. */
const STRIP_SCALE = 1.25;
const MIN_ASPECT = 0.6;
const MAX_ASPECT = 2.2;

type OpenImage = (img: AssetInClient, origin?: LightboxOrigin) => void;

/** One group as a single horizontally scrolling, snapping row with a fade on the right edge. */
export const StripRow = memo(function StripRow({
  images,
  onOpen,
}: {
  images: AssetInClient[];
  onOpen: OpenImage;
}) {
  const size = useAppStore((state) => state.galleryThumbnailSize);
  const ref = useRef<HTMLDivElement>(null);
  useHorizontalScrollFades(ref);
  const height = Math.round(size * STRIP_SCALE);

  return (
    <div ref={ref} className="strip-row" style={{ height }}>
      {images.map((image) => {
        const aspect = image.metadata.width / Math.max(1, image.metadata.height);
        const width = Math.round(height * Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect || 1.5)));
        return (
          <div key={image.id} className="strip-tile" style={{ width, height }}>
            <PhotoInGallery img={image} onImgClick={onOpen} />
          </div>
        );
      })}
    </div>
  );
});

function RatingCell({ image }: { image: AssetInClient }) {
  const ratingMode = useSettingsStore((state) => state.ratingMode);
  const rating = image.metadata.rating ?? 0;
  const rate = (value: number) => void AssetsService.rateAssets([image.id], value);

  if (ratingMode === RatingMode.Favorites) {
    const favorite = isFavoriteRating(rating);
    return (
      <button
        type="button"
        className={clsx('list-row__favorite', favorite && 'is-favorite')}
        aria-pressed={favorite}
        aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
        title={favorite ? 'Remove from favorites' : 'Add to favorites'}
        onClick={(event) => {
          event.stopPropagation();
          rate(favorite ? 0 : FAVORITE_RATING);
        }}
      >
        {favorite ? <IconHeartFilled size={16} /> : <IconHeart size={16} />}
      </button>
    );
  }

  return (
    <span onClick={(event) => event.stopPropagation()}>
      <StarRating value={rating} onChange={rate} size={14} />
    </span>
  );
}

const ListRow = memo(function ListRow({ image, onOpen }: { image: AssetInClient; onOpen: OpenImage }) {
  const selectedImages = useAppStore((state) => state.selectedImages);
  const setSelectedImages = useAppStore((state) => state.setSelectedImages);
  const selectionMode = useAppStore((state) => state.selectionMode);
  const selected = selectedImages.some((x) => x.id === image.id);
  const rowRef = useRef<HTMLDivElement>(null);

  function handleClick() {
    if (selectedImages.length > 0 || selectionMode) {
      setSelectedImages(
        selected ? selectedImages.filter((x) => x.id !== image.id) : [...selectedImages, image],
      );
      return;
    }
    const rect = rowRef.current?.getBoundingClientRect();
    onOpen(image, rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null);
  }

  return (
    <div
      ref={rowRef}
      role="row"
      tabIndex={0}
      aria-selected={selected}
      className={clsx('list-row', selected && 'is-selected')}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleClick();
        }
      }}
    >
      <span className="list-row__thumb">
        <PhotoInGalleryThumbnail img={image} isImageSelected={selected} />
      </span>
      <span className="list-row__name" title={image.filename}>
        {image.filename}
      </span>
      <span className="list-row__cell">
        {formatDate(image.metadata.date, { dateStyle: 'medium', timeStyle: 'short' })}
      </span>
      <span className="list-row__cell list-row__place" title={image.metadata.location?.name ?? undefined}>
        {image.metadata.location?.name ?? '—'}
      </span>
      <RatingCell image={image} />
      <span className="list-row__cell list-row__size">{formatBytes(image.filesize)}</span>
    </div>
  );
});

/** One group as a table of rows with inline metadata (the group header is sticky). */
export const ListRows = memo(function ListRows({
  images,
  onOpen,
}: {
  images: AssetInClient[];
  onOpen: OpenImage;
}) {
  return (
    <div role="table" className="list-rows">
      {images.map((image) => (
        <ListRow key={image.id} image={image} onOpen={onOpen} />
      ))}
    </div>
  );
});
