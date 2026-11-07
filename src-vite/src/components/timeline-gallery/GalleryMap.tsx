import { PhotoMap } from '@/components/location/PhotoMap';
import { LightboxImageContext } from '@/context/LightboxContext';
import { AssetsService } from '@/db/api/services/assets.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { SearchQuery } from '@/common/fileSearchFilters';
import { Skeleton } from '@/components/ui/skeleton';
import { useContext, useMemo } from 'react';

/** The Map lens: the list's geotagged photos, clustered. Same photo set as every other lens. */
export function GalleryMap({
  searchQuery,
  assetIdsFilter,
}: {
  searchQuery?: SearchQuery;
  assetIdsFilter?: string[];
}) {
  const { openLightbox } = useContext(LightboxImageContext);
  const searchQueryKey = useMemo(() => JSON.stringify(searchQuery ?? null), [searchQuery]);
  const assetIdsKey = useMemo(() => assetIdsFilter?.join(',') ?? null, [assetIdsFilter]);

  const { data: points } = useLiveQuery(
    () => AssetsService.getGeoPoints({ searchQuery, assetIds: assetIdsFilter }),
    ['assets'],
    { extDependencies: [searchQueryKey, assetIdsKey] },
  );

  if (!points) return <Skeleton className="gallery-map" />;

  return (
    <div className="gallery-map">
      <PhotoMap
        points={points}
        onOpen={(id, scopeIds) =>
          void AssetsService.getByUUID(id).then((asset) =>
            openLightbox(asset, undefined, { assetIds: scopeIds, preserveOrder: true }),
          )
        }
      />
    </div>
  );
}
