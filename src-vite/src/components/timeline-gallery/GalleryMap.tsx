import { PhotoMap } from '@/components/location/PhotoMap';
import { LightboxImageContext } from '@/context/LightboxContext';
import { AssetsService } from '@/db/api/services/assets.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { SearchQuery } from '@/common/fileSearchFilters';
import { Skeleton } from '@/components/ui/skeleton';
import { getScrollParent } from '@/utils/scrollParent';
import { useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';

/** The Map lens: the list's geotagged photos, clustered. Same photo set as every other lens. */
export function GalleryMap({
  searchQuery,
  assetIdsFilter,
}: {
  searchQuery?: SearchQuery;
  assetIdsFilter?: string[];
}) {
  const { openLightbox } = useContext(LightboxImageContext);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>();

  // Fill the scroll area below the pinned headers, so once the hero scrolls away the map is full height.
  useLayoutEffect(() => {
    const scrollParent = getScrollParent(wrapperRef.current);
    if (!scrollParent) return;
    const measure = () => {
      const style = getComputedStyle(scrollParent);
      const pinned =
        (parseFloat(style.getPropertyValue('--compact-hero-h')) || 0) +
        (parseFloat(style.getPropertyValue('--chip-row-h')) || 0);
      setHeight(Math.max(420, scrollParent.clientHeight - pinned));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scrollParent);
    return () => observer.disconnect();
  }, []);
  const searchQueryKey = useMemo(() => JSON.stringify(searchQuery ?? null), [searchQuery]);
  const assetIdsKey = useMemo(() => assetIdsFilter?.join(',') ?? null, [assetIdsFilter]);

  const { data: points } = useLiveQuery(
    () => AssetsService.getGeoPoints({ searchQuery, assetIds: assetIdsFilter }),
    ['assets'],
    { extDependencies: [searchQueryKey, assetIdsKey] },
  );

  return (
    <div ref={wrapperRef} className="gallery-map" style={{ height }}>
      {!points ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <PhotoMap
          points={points}
          onOpen={(id, scopeIds) =>
            void AssetsService.getByUUID(id).then((asset) =>
              openLightbox(asset, undefined, { assetIds: scopeIds, preserveOrder: true }),
            )
          }
        />
      )}
    </div>
  );
}
