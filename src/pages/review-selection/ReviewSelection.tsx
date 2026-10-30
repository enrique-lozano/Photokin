import { usePageChrome } from '@/components/page-content/usePageChrome';
import { TimelineGallery } from '@/components/timeline-gallery/TimelineGallery';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useAppStore } from '@/stores/appState';
import { IconLayoutGrid } from '@tabler/icons-react';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent';

/**
 * "Review selection" (§5): shows the current selection basket as a temporary
 * view — the photos you gathered, wherever they came from — so "what do I
 * actually have selected?" always has a one-click answer. Reads the basket
 * straight from the global store; no route params.
 */
export function ReviewSelection() {
  const navigate = useNavigate();
  const selectedImages = useAppStore((state) => state.selectedImages);
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);

  const basketIds = useMemo(() => selectedImages.map((image) => image.id), [selectedImages]);
  const count = basketIds.length;

  useEffect(() => {
    setBreadcrumb([{ label: 'Review selection' }]);
    return () => setBreadcrumb([]);
  }, [setBreadcrumb]);

  // The basket is exactly what was picked, so the library filters don't narrow it.
  usePageChrome('photos', undefined, 'none');

  return (
    <SecondaryTitleAndScrollableContent
      icon={<IconLayoutGrid size={22} />}
      title="Review selection"
      subtitle={`${count.toLocaleString()} ${count === 1 ? 'photo' : 'photos'} in your basket`}
      actions={
        <Button variant="outline" onClick={() => navigate(-1)}>
          Done
        </Button>
      }
      galleryLayout={count > 0}
      content={
        count > 0 ? (
          <TimelineGallery key={basketIds.join(',')} assetIdsFilter={basketIds} />
        ) : (
          <EmptyState
            icon={IconLayoutGrid}
            title="Nothing selected yet"
            description="Select photos in any gallery by clicking the circle on a photo. They gather here so you can review them together."
            action={
              <Button variant="outline" onClick={() => navigate(-1)}>
                Go back
              </Button>
            }
          />
        )
      }
    />
  );
}
