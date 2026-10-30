import { CountryFlag } from '@/components/location/CountryFlag.tsx';
import {
  ClearLibraryFiltersButton,
  useHasActiveLibraryFilters,
} from '@/components/app-shell/ClearLibraryFilters';
import { ChipFiltersEmptyState } from '@/components/page-content/ChipFiltersEmptyState';
import { FilterChipPlaceholders, FilterChipRow } from '@/components/page-content/FilterChipRow';
import { ImportStatus, ImportStatusProvider } from '@/components/page-content/ImportStatus';
import { useContentFilterChips } from '@/components/page-content/useContentFilterChips';
import { usePageChrome } from '@/components/page-content/usePageChrome';
import { Button } from '@/components/ui/button.tsx';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { isPointInBounds, type MapBounds } from '@/components/location/mapBounds';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { EmptyState } from '@/components/ui/empty-state';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { SeparatedListView } from '@/components/ui/separated-list-view';
import { AssetsService } from '@/db/api/services/assets.service.ts';
import { countryNameFromCode } from '@/media/metadata/location/countryCode.ts';
import { IconArrowsSort, IconMap, IconMapPin, IconMapPinFilled, IconWorld } from '@tabler/icons-react';
import clsx from 'clsx';
import { useContext, useEffect, useMemo, useState } from 'react';
import { PhotoMap } from '@/components/location/PhotoMap';
import { LightboxImageContext } from '@/context/LightboxContext';
import { FilterCriteria } from '../../common/query/filters/FilterCriteria.ts';
import type { SearchFilter } from '../../common/query/filters/FilterTypes.ts';
import { mergeSearchQueries } from '../../common/searchQueryUtils.ts';
import { SecondaryNavbar } from '../../components/secondary-navbar/SecondaryNavbar.tsx';
import { formatSidebarFilterCount } from '../../components/secondary-navbar/sidebarFilterCount';
import { SidebarNoMatches } from '../../components/secondary-navbar/SidebarNoMatches';
import { SidebarSearchInput } from '../../components/secondary-navbar/SidebarSearchInput.tsx';
import { TimelineGallery } from '../../components/timeline-gallery/TimelineGallery.tsx';
import { useLiveQuery } from '../../db/connection/useLiveQuery.tsx';
import { useAppStore } from '../../stores/appState.ts';
import { useHiddenItemsStore } from '@/stores/hiddenItemsStore';
import { PlacesGroupBy, PlacesSort, useSidebarStore } from '../../stores/sidebarStore.ts';
import { SecondaryTitleAndScrollableContent } from '../search/SecondaryTitleAndScrollableContent.tsx';
import './places.css';

const UNKNOWN_COUNTRY = 'Unknown country';

/** One structured place row as returned by {@link AssetsService.getFileCountByPlace}. */
type PlaceSection = {
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
  totalImages: number;
  totalSizeInBytes: number;
};

type PlaceListItem = {
  /** Stable identity built from the structured parts; used for selection and keys. */
  key: string;
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
  /** Grouping key for the country: the ISO code when present, else the name. */
  countryKey: string;
  /** Localized country name derived from the code, falling back to the stored name. */
  countryLabel: string;
  /** Primary label shown in the row: city, else region, else country. */
  primaryLabel: string;
  /** Region hint shown under a city row (empty otherwise). */
  regionLabel: string;
  /** Trailing detail (region + country) shown in the content subtitle. */
  secondaryLabel: string;
  /** Full comma-joined label, used for the sidebar text search. */
  fullLabel: string;
  count: number;
};

type CountryGroup = {
  key: string;
  label: string;
  country: string | null;
  countryCode: string | null;
  places: PlaceListItem[];
  count: number;
};

type PlaceSidebarRow =
  | { kind: 'country'; key: string; country: CountryGroup }
  | { kind: 'place'; key: string; place: PlaceListItem; group: CountryGroup | null };

function groupByCountry(places: PlaceListItem[], sort: PlacesSort): CountryGroup[] {
  const groupsByCountry = new Map<string, CountryGroup>();

  for (const place of places) {
    const group = groupsByCountry.get(place.countryKey) ?? {
      key: place.countryKey,
      label: place.countryLabel,
      country: place.country,
      countryCode: place.countryCode,
      places: [],
      count: 0,
    };
    group.places.push(place);
    group.count += place.count;
    groupsByCountry.set(place.countryKey, group);
  }

  const groups = [...groupsByCountry.values()];

  if (sort === 'name') {
    groups.sort((a, b) => a.label.localeCompare(b.label));
    groups.forEach((group) => group.places.sort((a, b) => a.primaryLabel.localeCompare(b.primaryLabel)));
  } else {
    groups.sort((a, b) => b.count - a.count);
    groups.forEach((group) => group.places.sort((a, b) => b.count - a.count));
  }

  return groups;
}

/**
 * Pins the country by its canonical code when we have one, so photos whose
 * country name is stored in another language still match.
 */
function countryFilter({
  countryCode,
  country,
}: {
  countryCode: string | null;
  country: string | null;
}): SearchFilter {
  return countryCode
    ? { filterCriteria: FilterCriteria.locationCountryCode, operator: 'equals', value: countryCode }
    : { filterCriteria: FilterCriteria.locationCountry, operator: 'equals', value: country ?? '' };
}

function itemsLabel(count: number) {
  return `${count.toLocaleString()} item${count === 1 ? '' : 's'}`;
}

/**
 * Builds a place row from the structured city/region/country columns. The most
 * specific available part becomes the primary label; the country is grouped by
 * its ISO code (canonical, language-neutral) and displayed via a localized name
 * derived from that code, so "Italy"/"Italia" collapse into one flagged group.
 */
function toPlaceItem(section: PlaceSection): PlaceListItem {
  const { city, state, country, countryCode } = section;
  const countryLabel = countryNameFromCode(countryCode) ?? country ?? UNKNOWN_COUNTRY;
  const parts = [city, state, countryLabel].filter((part): part is string => Boolean(part));

  return {
    key: [countryCode ?? country ?? '', state ?? '', city ?? ''].join('\u0000'),
    city,
    state,
    country,
    countryCode,
    countryKey: countryCode ?? country ?? UNKNOWN_COUNTRY,
    countryLabel,
    primaryLabel: parts.at(0) ?? UNKNOWN_COUNTRY,
    regionLabel: city && state ? state : '',
    secondaryLabel: parts.slice(1).join(', '),
    fullLabel: parts.join(', '),
    count: section.totalImages,
  };
}

export function PlacesPage() {
  return (
    <ImportStatusProvider>
      <PlacesContent />
    </ImportStatusProvider>
  );
}

function PlacesContent() {
  const hasLibraryFilters = useHasActiveLibraryFilters();
  const searchQuery = useAppStore((state) => state.searchQuery);
  const sort = useSidebarStore((state) => state.sort.places);
  const setSort = useSidebarStore((state) => state.setSort);
  const groupBy = useSidebarStore((state) => state.placesGroupBy);
  const setGroupBy = useSidebarStore((state) => state.setPlacesGroupBy);
  const [searchFilter, setSearchFilter] = useState('');
  /** Key of the selected place, or of the selected country in country mode. */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [area, setArea] = useState<MapBounds | null>(null);
  const [mapMounted, setMapMounted] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const showHiddenItems = useHiddenItemsStore((state) => state.showHiddenItems);
  const { openLightbox } = useContext(LightboxImageContext);

  const { data: locationSections } = useLiveQuery(
    () => AssetsService.getFileCountByPlace({ searchQuery }),
    ['assets'],
    { extDependencies: [searchQuery] },
  );

  const places = useMemo<PlaceListItem[]>(
    () => (locationSections ?? []).map((section) => toPlaceItem(section)),
    [locationSections],
  );
  const noPlaces = locationSections !== null && places.length === 0;

  const visiblePlaces = useMemo(() => {
    const normalizedFilter = searchFilter.trim().toLowerCase();
    if (!normalizedFilter) return places;

    return places.filter((place) => place.fullLabel.toLowerCase().includes(normalizedFilter));
  }, [places, searchFilter]);

  const countryGroups = useMemo(() => groupByCountry(visiblePlaces, sort), [visiblePlaces, sort]);

  // Country mode groups the unfiltered places so each country keeps its full
  // count, then filters on the country name itself.
  const countries = useMemo(() => groupByCountry(places, sort), [places, sort]);

  const visibleCountries = useMemo(() => {
    const normalizedFilter = searchFilter.trim().toLowerCase();
    if (!normalizedFilter) return countries;

    return countries.filter((country) => country.label.toLowerCase().includes(normalizedFilter));
  }, [countries, searchFilter]);

  const visibleItems = groupBy === 'country' ? visibleCountries : visiblePlaces;
  const sidebarRows = useMemo<PlaceSidebarRow[]>(
    () =>
      groupBy === 'country'
        ? visibleCountries.map((country) => ({ kind: 'country', key: country.key, country }))
        : countryGroups.flatMap((group) =>
            group.places.map((place, index) => ({
              kind: 'place' as const,
              key: place.key,
              place,
              group: index === 0 ? group : null,
            })),
          ),
    [groupBy, visibleCountries, countryGroups],
  );

  // Keep the selection valid as the live data changes, defaulting to the
  // first item so the gallery isn't empty on first visit.
  useEffect(() => {
    if (area) return;
    if (!visibleItems.some((item) => item.key === selectedKey)) {
      setSelectedKey(visibleItems.at(0)?.key ?? null);
    }
  }, [visibleItems, selectedKey, area]);

  const selectedPlace =
    groupBy === 'place' ? (places.find((place) => place.key === selectedKey) ?? null) : null;
  const selectedCountry =
    groupBy === 'country' ? (countries.find((country) => country.key === selectedKey) ?? null) : null;

  const changeGroupBy = (value: PlacesGroupBy) => {
    // Switching to countries keeps the selected place's country in view.
    if (value === 'country' && selectedPlace) setSelectedKey(selectedPlace.countryKey);
    setGroupBy(value);
  };

  // Memoized: the chips hook and the gallery both key off this query's identity,
  // so a fresh array on every render would refetch both in a loop.
  const galleryQuery = useMemo(() => {
    if (selectedCountry) {
      return mergeSearchQueries(searchQuery, { filters: [countryFilter(selectedCountry)] });
    }
    if (selectedPlace) {
      return mergeSearchQueries(searchQuery, {
        filters: [
          {
            filterCriteria: FilterCriteria.locationCity,
            operator: 'equals',
            value: selectedPlace.city ?? '',
          },
          {
            filterCriteria: FilterCriteria.locationState,
            operator: 'equals',
            value: selectedPlace.state ?? '',
          },
          countryFilter(selectedPlace),
        ],
      });
    }
    return searchQuery;
  }, [searchQuery, selectedCountry, selectedPlace]);

  const { data: geoPoints, error: mapError } = useLiveQuery(
    () => AssetsService.getGeoPoints({ searchQuery }),
    ['assets', 'fileTags', 'tagRegionInfo'],
    { extDependencies: [searchQuery, showHiddenItems] },
  );
  const { data: focusPoints, error: focusError } = useLiveQuery(
    () => (selectedKey ? AssetsService.getGeoPoints({ searchQuery: galleryQuery }) : Promise.resolve(null)),
    ['assets', 'fileTags', 'tagRegionInfo'],
    { extDependencies: [galleryQuery, selectedKey, showHiddenItems] },
  );
  const areaIds = useMemo(
    () =>
      area
        ? (geoPoints ?? []).filter((point) => isPointInBounds(point, area)).map((point) => point.id)
        : undefined,
    [geoPoints, area],
  );
  const scopeKey = area ? JSON.stringify(area) : (selectedKey ?? undefined);

  const {
    chips,
    activeChipIds,
    toggleChip,
    clear: clearChips,
    conditions,
    isLoading: chipsLoading,
    isRefreshing: chipsRefreshing,
  } = useContentFilterChips({
    searchQuery: galleryQuery,
    assetIds: areaIds,
    resetKey: scopeKey,
  });

  const chipsEmptyState =
    activeChipIds.length > 0 ? <ChipFiltersEmptyState onClear={clearChips} /> : undefined;

  const chipsFilter =
    chips.length > 0 ? (
      <FilterChipRow
        chips={chips}
        activeChipIds={activeChipIds}
        onToggle={toggleChip}
        disabled={chipsRefreshing}
      />
    ) : chipsLoading ? (
      <FilterChipPlaceholders />
    ) : undefined;

  const chippedGalleryQuery = useMemo(
    () => mergeSearchQueries(galleryQuery, conditions),
    [galleryQuery, conditions],
  );

  const openFromMap = async (id: string, scopeIds: string[]) => {
    openLightbox(await AssetsService.getByUUID(id), undefined, { assetIds: scopeIds, preserveOrder: true });
  };

  const selectRow = (key: string) => {
    setArea(null);
    setSelectedKey(key);
  };

  const renderPlaceRow = (place: PlaceListItem) => (
    <button
      key={place.key}
      className={clsx('place-list-row', selectedKey === place.key && 'selected')}
      onClick={() => selectRow(place.key)}
    >
      <span className="place-icon">
        <IconMapPinFilled size={16} />
      </span>
      <span className="place-text">
        <span className="place-name">{place.primaryLabel}</span>
        {place.regionLabel && <span className="place-region">{place.regionLabel}</span>}
      </span>
      <span className="place-badge">{place.count.toLocaleString()}</span>
    </button>
  );

  const renderCountryRow = (country: CountryGroup) => (
    <button
      key={country.key}
      className={clsx('place-list-row', selectedKey === country.key && 'selected')}
      onClick={() => selectRow(country.key)}
    >
      <span className={clsx('place-icon', country.countryCode && 'place-icon--flag')}>
        {country.countryCode ? (
          <CountryFlag code={country.countryCode} className="place-flag" />
        ) : (
          <IconWorld size={16} />
        )}
      </span>
      <span className="place-text">
        <span className="place-name">{country.label}</span>
        <span className="place-region">
          {country.places.length.toLocaleString()} place{country.places.length === 1 ? '' : 's'}
        </span>
      </span>
      <span className="place-badge">{country.count.toLocaleString()}</span>
    </button>
  );

  const itemNoun = groupBy === 'country' ? 'countries' : 'places';
  const selectedItem = selectedCountry ?? selectedPlace;
  usePageChrome('photos');

  return (
    <div className="places-page">
      <div>
        <SecondaryNavbar title="Places">
          {noPlaces ? (
            <EmptyState
              size="sidebar"
              icon={IconMapPin}
              title="No places yet"
              description="Photos with a location are grouped here by place."
            />
          ) : (
            /* Filter field + a trailing sort control (§1) — no sidebar title/action bar. */
            <div className="places-filter-row">
              <SidebarSearchInput
                placeholder={`Search ${itemNoun}`}
                value={searchFilter}
                onValueChange={setSearchFilter}
                className="grow"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" title="Sort and group" aria-label="Sort and group">
                    <IconArrowsSort size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={sort}
                    onValueChange={(value) => setSort('places', value as PlacesSort)}
                  >
                    <DropdownMenuRadioItem value="name">Alphabetical</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="count">Number of items</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Group by</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={groupBy}
                    onValueChange={(value) => changeGroupBy(value as PlacesGroupBy)}
                  >
                    <DropdownMenuRadioItem value="place">Place</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="country">Country</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {locationSections !== null && !noPlaces && (
            <p className="sidebar-section-label">
              <span
                className={clsx(
                  'sidebar-section-label__count',
                  searchFilter.trim() && 'sidebar-section-label__count--filtered',
                )}
              >
                {groupBy === 'country'
                  ? formatSidebarFilterCount(
                      countries.length,
                      searchFilter.trim() ? visibleCountries.length : null,
                    )
                  : formatSidebarFilterCount(
                      places.length,
                      searchFilter.trim() ? visiblePlaces.length : null,
                    )}
              </span>
              <span>{groupBy === 'country' ? 'Countries' : 'Places'}</span>
            </p>
          )}

          {locationSections === null ? (
            <section className="places-list-container">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="place-list-row place-list-row--skeleton" aria-hidden>
                  <Skeleton className="place-icon" />
                  <Skeleton className="h-3.5 w-2/5" />
                </div>
              ))}
            </section>
          ) : (
            <SeparatedListView
              key={`${groupBy}:${sort}:${searchFilter}`}
              className="places-list-container"
              aria-label={groupBy === 'country' ? 'Countries' : 'Places'}
              items={sidebarRows}
              itemKey={(row) => row.key}
              estimateSize={(row) => (row.kind === 'country' ? 44 : row.group ? 72 : 36)}
              separatorBuilder={() => <div style={{ height: 2 }} />}
              emptyState={
                places.length > 0 ? (
                  <SidebarNoMatches noun={itemNoun} onClear={() => setSearchFilter('')} />
                ) : null
              }
              renderItem={(row, index) =>
                row.kind === 'country' ? (
                  renderCountryRow(row.country)
                ) : (
                  <>
                    {row.group && (
                      <p className={clsx('places-group-label', index > 0 && 'places-group-label--spaced')}>
                        <span className="places-group-name">
                          <CountryFlag code={row.group.countryCode} className="places-group-flag" />
                          {row.group.label}
                        </span>
                        <span className="places-group-count">{row.group.count.toLocaleString()}</span>
                      </p>
                    )}
                    {renderPlaceRow(row.place)}
                  </>
                )
              }
            />
          )}
          <Accordion
            type="single"
            collapsible
            className="places-map"
            onValueChange={(value) => {
              setMapOpen(Boolean(value));
              if (value) setMapMounted(true);
            }}
          >
            <AccordionItem value="map" className="border-b-0">
              <AccordionTrigger className="py-2 hover:no-underline">
                <span className="flex items-center gap-2">
                  <IconMap size={16} /> Map
                </span>
              </AccordionTrigger>
              <AccordionContent forceMount inert={!mapOpen} aria-hidden={!mapOpen}>
                {mapError || focusError ? (
                  <EmptyState
                    size="sidebar"
                    icon={IconMapPin}
                    title="Could not load photo locations"
                    description={(mapError ?? focusError)?.message}
                  />
                ) : geoPoints === null ? (
                  <Skeleton className="h-48 w-full" />
                ) : mapMounted ? (
                  <PhotoMap
                    points={geoPoints}
                    focus={focusPoints}
                    onOpen={(id, ids) => void openFromMap(id, ids)}
                    onSelectArea={(bounds) => {
                      setArea(bounds);
                      setSelectedKey(null);
                    }}
                  />
                ) : null}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </SecondaryNavbar>

        {selectedItem || area ? (
          <div className="page-content">
            <SecondaryTitleAndScrollableContent
              icon={area ? <IconMap /> : selectedCountry ? <IconWorld /> : <IconMapPin />}
              title={area ? 'Map area' : (selectedCountry?.label ?? selectedPlace?.primaryLabel)}
              subtitle={
                area
                  ? `${itemsLabel(areaIds?.length ?? 0)} · Photos with GPS coordinates`
                  : selectedCountry
                    ? `${selectedCountry.places.length.toLocaleString()} place${selectedCountry.places.length === 1 ? '' : 's'} · ${itemsLabel(selectedCountry.count)}`
                    : selectedPlace?.secondaryLabel
                      ? `${selectedPlace.secondaryLabel} · ${itemsLabel(selectedPlace.count)}`
                      : itemsLabel(selectedItem?.count ?? 0)
              }
              filters={chipsFilter}
              galleryLayout
              content={
                <TimelineGallery
                  key={scopeKey}
                  searchQuery={chippedGalleryQuery}
                  assetIdsFilter={areaIds}
                  pendingImport="places"
                  onNoResults={
                    chipsEmptyState ??
                    (area ? (
                      <EmptyState
                        icon={IconMapPin}
                        title="No photos in this area"
                        description="Choose another area on the map or select a place from the list."
                      />
                    ) : undefined)
                  }
                />
              }
            />
          </div>
        ) : (
          <div className="page-content">
            <ImportStatus />
            {locationSections === null ? null : places.length === 0 ? (
              <EmptyState
                icon={IconMapPin}
                title={hasLibraryFilters ? 'No places match your filters' : 'No places yet'}
                description={
                  hasLibraryFilters ? (
                    'Remove a library filter, or clear them all, to see more places.'
                  ) : (
                    <>
                      Photos and videos with a location show up here, grouped by place. To add one, select
                      photos and choose Edit location (
                      <KbdGroup>
                        <Kbd>Ctrl</Kbd>
                        <Kbd>G</Kbd>
                      </KbdGroup>
                      ).
                    </>
                  )
                }
                action={hasLibraryFilters ? <ClearLibraryFiltersButton /> : undefined}
                pendingImport="places"
              />
            ) : (
              <EmptyState
                icon={groupBy === 'country' ? IconWorld : IconMapPin}
                title={groupBy === 'country' ? 'Select a country' : 'Select a place'}
                description={`Pick a ${groupBy} on the left to see the photos and videos taken there.`}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
