import { SearchQuery } from '@/common/fileSearchFilters';
import type { AssetDateField } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { ReactNode, createContext, useCallback, useState } from 'react';

/**
 * Screen-space rectangle of the grid thumbnail a photo was opened from. Used to
 * animate a shared-element zoom between the gallery and the lightbox.
 */
export type LightboxOrigin = {
  left: number;
  top: number;
  width: number;
  height: number;
} | null;

/**
 * The set of assets the lightbox should navigate within. Mirrors the scope of
 * the gallery the photo was opened from (e.g. a tag, album, person or calendar
 * selection) so that next/previous stay inside that subset instead of walking
 * the whole library. `null` means "the entire library".
 */
export type LightboxNavigationScope = {
  searchQuery?: SearchQuery;
  assetIds?: string[];
  /** Timestamp column next/previous walk by, matching the source gallery. */
  dateField?: AssetDateField;
  /** Navigate `assetIds` in the given order instead of by date. */
  preserveOrder?: boolean;
} | null;

export const LightboxImageContext = createContext<{
  lightboxImage: AssetInClient | null;
  lightboxOrigin: LightboxOrigin;
  /** Scope used to compute next/previous while the lightbox is open. */
  lightboxScope: LightboxNavigationScope;
  /** Opens the lightbox, optionally animating from the thumbnail `origin`. */
  openLightbox: (img: AssetInClient, origin?: LightboxOrigin, scope?: LightboxNavigationScope) => void;
  closeLightbox: () => void;
  /** Swaps the displayed image without re-running the open animation (navigation). */
  setLightboxImage: React.Dispatch<React.SetStateAction<AssetInClient | null>>;
}>({
  lightboxImage: null,
  lightboxOrigin: null,
  lightboxScope: null,
  openLightbox: () => {},
  closeLightbox: () => {},
  setLightboxImage: () => {},
});

export function LightboxImageProvider(props: { children: ReactNode }) {
  const [lightboxImage, setLightboxImage] = useState<AssetInClient | null>(null);
  const [lightboxOrigin, setLightboxOrigin] = useState<LightboxOrigin>(null);
  const [lightboxScope, setLightboxScope] = useState<LightboxNavigationScope>(null);

  const openLightbox = useCallback(
    (img: AssetInClient, origin: LightboxOrigin = null, scope: LightboxNavigationScope = null) => {
      setLightboxOrigin(origin);
      setLightboxScope(scope);
      setLightboxImage(img);
    },
    [],
  );

  const closeLightbox = useCallback(() => {
    setLightboxImage(null);
  }, []);

  return (
    <LightboxImageContext.Provider
      value={{
        lightboxImage,
        lightboxOrigin,
        lightboxScope,
        openLightbox,
        closeLightbox,
        setLightboxImage,
      }}
    >
      {props.children}
    </LightboxImageContext.Provider>
  );
}
