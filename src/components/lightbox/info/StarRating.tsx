import { IconStar, IconStarFilled } from '@tabler/icons-react';
import { useState } from 'react';

const MAX_STARS = 5;

interface StarRatingProps {
  /** Current rating, 0–5. */
  value: number;
  /** Called with the new rating when a star is activated. Omit for read-only. */
  onChange?: (value: number) => void;
  /** Star glyph size in pixels. */
  size?: number;
}

/**
 * A 0–5 star rating control. When `onChange` is provided the stars are
 * interactive (hover preview, click to set, click the current value to clear);
 * otherwise it renders as a compact read-only indicator.
 */
export function StarRating({ value, onChange, size = 22 }: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const readOnly = !onChange;
  const shown = hovered ?? value;

  const stars = Array.from({ length: MAX_STARS }, (_, index) => {
    const position = index + 1;
    const isFilled = position <= shown;
    const Star = isFilled ? IconStarFilled : IconStar;
    const glyph = <Star size={size} className="star-rating__star" data-filled={isFilled} aria-hidden />;

    if (readOnly) {
      return <span key={position}>{glyph}</span>;
    }

    return (
      <button
        key={position}
        type="button"
        className="star-rating__button"
        aria-label={`${position} star${position > 1 ? 's' : ''}`}
        aria-pressed={position <= value}
        onMouseEnter={() => setHovered(position)}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered(position)}
        onBlur={() => setHovered(null)}
        onClick={() => onChange?.(value === position ? 0 : position)}
      >
        {glyph}
      </button>
    );
  });

  return (
    <div
      className={`star-rating${readOnly ? ' star-rating--readonly' : ''}`}
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={readOnly ? `Rating: ${value} of ${MAX_STARS}` : 'Rating'}
    >
      {stars}
    </div>
  );
}
