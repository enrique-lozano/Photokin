import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { Button } from '@/components/ui/button';
import { IconCheck, IconEye, IconSparkles } from '@tabler/icons-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { PersonRegion } from '@/db/models/PersonInfo';

type SuggestionBannerProps = {
  /** Plain text on a person's own page; a link to them where many banners stack. */
  personName: ReactNode;
  /** Replaces the sparkle, e.g. with the person's avatar in a list of people. */
  icon?: ReactNode;
  /** Replaces the "N photos may be …" wording for banners that are not suggestions. */
  title?: ReactNode;
  regions: PersonRegion[];
  acceptLabel?: string;
  /** Resolves once the whole batch has been written, so the button can wait on it. */
  onAcceptAll?: () => Promise<void>;
  onReview: () => void;
};

const FACE_SIZE = 50;
const FACE_GAP = 6;

export function SuggestionBanner({
  personName,
  icon,
  title,
  regions,
  acceptLabel = 'Accept all',
  onAcceptAll,
  onReview,
}: SuggestionBannerProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [maxVisible, setMaxVisible] = useState(regions.length);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    const element = stripRef.current;
    if (!element) return;

    const update = () => {
      const width = element.clientWidth;
      const fitting = Math.floor((width + FACE_GAP) / (FACE_SIZE + FACE_GAP));
      setMaxVisible(Math.max(1, fitting));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitsAll = regions.length <= maxVisible;
  const previewCount = fitsAll ? regions.length : Math.max(1, maxVisible - 1);
  const preview = regions.slice(0, previewCount);
  const extra = regions.length - previewCount;

  return (
    <section className="suggestion-banner">
      <header className="suggestion-banner-header">
        {icon ?? <IconSparkles size={16} className="suggestion-banner-spark" />}
        <span className="text-sm font-semibold">
          {title ?? (
            <>
              {regions.length} {regions.length === 1 ? 'photo' : 'photos'} may be {personName}
            </>
          )}
        </span>
      </header>

      <div className="suggestion-banner-row">
        <div className="suggestion-banner-strip" ref={stripRef}>
          {preview.map((region) => (
            <FaceThumbnail key={region.id} region={region} className="suggestion-banner-face" />
          ))}
          {extra > 0 && <span className="suggestion-banner-more">+{extra}</span>}
        </div>

        <div className="suggestion-banner-actions">
          {onAcceptAll && (
            <Button
              size="sm"
              isLoading={isAccepting}
              onClick={async () => {
                setIsAccepting(true);
                try {
                  await onAcceptAll();
                } finally {
                  setIsAccepting(false);
                }
              }}
            >
              {!isAccepting && <IconCheck size={14} />}
              {acceptLabel}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onReview} disabled={isAccepting}>
            <IconEye size={14} />
            Review
          </Button>
        </div>
      </div>
    </section>
  );
}
