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
import { memo, useCallback, useRef } from 'react';

/** Strip thumbnails are taller than grid rows so a single row reads at a glance. */
const STRIP_SCALE = 1.25;
/** Space reserved under a strip for its horizontal scrollbar. */
export const STRIP_SCROLLBAR_SPACE = 14;
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
  // Room for the horizontal scrollbar below the tiles.
  const rowHeight = height + STRIP_SCROLLBAR_SPACE;

  return (
    <div ref={ref} className="strip-row" style={{ height: rowHeight }}>
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

type SelectMode = 'replace' | 'toggle' | 'range';

function selectModeOf(event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): SelectMode {
  if (event.shiftKey) return 'range';
  return event.metaKey || event.ctrlKey ? 'toggle' : 'replace';
}

/** File-explorer behaviour: click selects, Cmd/Ctrl-click toggles, Shift-click selects a range, double-click opens. */
const ListRow = memo(function ListRow({
  image,
  index,
  onSelect,
  onOpen,
}: {
  image: AssetInClient;
  index: number;
  onSelect: (image: AssetInClient, index: number, mode: SelectMode) => void;
  onOpen: OpenImage;
}) {
  const selected = useAppStore((state) => state.selectedImages.some((x) => x.id === image.id));
  const rowRef = useRef<HTMLDivElement>(null);

  function open() {
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
      onClick={(event) => onSelect(image, index, selectModeOf(event))}
      onDoubleClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          open();
        } else if (event.key === ' ') {
          event.preventDefault();
          onSelect(image, index, 'toggle');
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
  const anchor = useRef(-1);

  const select = useCallback(
    (image: AssetInClient, index: number, mode: SelectMode) => {
      const { selectedImages, setSelectedImages } = useAppStore.getState();
      if (mode === 'range' && anchor.current >= 0) {
        const [from, to] = [anchor.current, index].sort((a, b) => a - b);
        setSelectedImages(images.slice(from, to + 1));
        return;
      }
      anchor.current = index;
      if (mode === 'toggle') {
        const isSelected = selectedImages.some((x) => x.id === image.id);
        setSelectedImages(
          isSelected ? selectedImages.filter((x) => x.id !== image.id) : [...selectedImages, image],
        );
        return;
      }
      setSelectedImages([image]);
    },
    [images],
  );

  return (
    <div role="table" className="list-rows">
      {images.map((image, index) => (
        <ListRow key={image.id} image={image} index={index} onSelect={select} onOpen={onOpen} />
      ))}
    </div>
  );
});

/** Column titles for the List lens; shares the rows' grid so the columns line up. */
export function ListColumns() {
  return (
    <div className="list-columns" role="row">
      <span />
      <span role="columnheader">Name</span>
      <span role="columnheader">Date taken</span>
      <span role="columnheader">Place</span>
      <span role="columnheader">Rating</span>
      <span role="columnheader" className="list-row__size">
        Size
      </span>
    </div>
  );
}
