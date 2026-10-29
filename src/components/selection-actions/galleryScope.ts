import { createContext, useContext } from 'react';

/**
 * What the current page's gallery is a view of, provided by the page so the
 * photo menus can offer "remove from these results" for it.
 */
export type GalleryScope =
  | {
      kind: 'person';
      personName: string;
      /** This person's faces on each of their photos, keyed by asset id. */
      regionIdsByAsset: ReadonlyMap<string, readonly string[]>;
    }
  | { kind: 'tag'; tagId: string; tagName: string };

const GalleryScopeContext = createContext<GalleryScope | null>(null);

export const GalleryScopeProvider = GalleryScopeContext.Provider;

export function useGalleryScope(): GalleryScope | null {
  return useContext(GalleryScopeContext);
}
