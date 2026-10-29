import { create } from 'zustand';
import { TreeEntryEl } from '../components/tree/TreeEntryEl.model';

/**
 * Session state of the left-bar sections (Albums, Tags, People, Places).
 *
 * It lives outside `appState` because no shared shell UI reads it: only each
 * section's own layout does. It still has to outlive that layout, since leaving
 * a section unmounts it and coming back must restore the same view — so page
 * state alone isn't enough. Deliberately not persisted: it's a session memory,
 * not a preference (those belong in `settingsStore`).
 */

/** Sidebar list order for each left-bar section. */
export type PeopleSort = 'photos' | 'name' | 'suggestions';
export type TagsSort = 'photos' | 'name';
export type AlbumsSort = 'az' | 'za';
export type PlacesSort = 'count' | 'name';
/** Whether the Places sidebar lists individual places or whole countries. */
export type PlacesGroupBy = 'place' | 'country';

/** Sort of every section, so one setter covers them all and stays typed. */
export interface SidebarSorts {
  albums: AlbumsSort;
  tags: TagsSort;
  people: PeopleSort;
  places: PlacesSort;
}

/** Sections whose index route replays the sub-route last visited in them. */
export type SidebarRouteSection = 'tags' | 'people';

interface SidebarStore {
  /**
   * The album / tag trees. They hold the selection that defines what the page
   * shows, which is why they're kept here rather than in the layouts.
   */
  albumTree: TreeEntryEl[] | null;
  setAlbumTree: (newTree: TreeEntryEl[] | null) => void;
  tagTree: TreeEntryEl[] | null;
  setTagTree: (newTree: TreeEntryEl[] | null) => void;
  sort: SidebarSorts;
  setSort: <K extends keyof SidebarSorts>(section: K, value: SidebarSorts[K]) => void;
  placesGroupBy: PlacesGroupBy;
  setPlacesGroupBy: (value: PlacesGroupBy) => void;
  /** Last sub-route visited per section, e.g. `/tags/view/42`. */
  lastRoute: Partial<Record<SidebarRouteSection, string>>;
  setLastRoute: (section: SidebarRouteSection, route: string) => void;
}

export const useSidebarStore = create<SidebarStore>()((set) => ({
  albumTree: null,
  setAlbumTree: (albumTree) => set({ albumTree }),
  tagTree: null,
  setTagTree: (tagTree) => set({ tagTree }),
  sort: { albums: 'az', tags: 'name', people: 'name', places: 'name' },
  setSort: (section, value) => set((state) => ({ sort: { ...state.sort, [section]: value } })),
  placesGroupBy: 'place',
  setPlacesGroupBy: (placesGroupBy) => set({ placesGroupBy }),
  lastRoute: {},
  setLastRoute: (section, route) => set((state) => ({ lastRoute: { ...state.lastRoute, [section]: route } })),
}));
