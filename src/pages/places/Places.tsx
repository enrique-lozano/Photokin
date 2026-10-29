import { CountryFlag } from '@/components/location/CountryFlag.tsx';
import { NoResultsIndicator } from '@/components/NoResultsIndicator.tsx';
import { FilterChipPlaceholders, FilterChipRow } from '@/components/page-content/FilterChipRow';
import { ImportStatus, ImportStatusProvider, useImportStatus } from '@/components/page-content/ImportStatus';
import { useContentFilterChips } from '@/components/page-content/useContentFilterChips';
import { usePageChrome } from '@/components/page-content/usePageChrome';
import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { AssetsService } from '@/db/api/services/assets.service.ts';
import { countryNameFromCode } from '@/media/metadata/location/countryCode.ts';
import { IconArrowsSort, IconMapPin, IconMapPinFilled, IconWorld } from '@tabler/icons-react';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { FilterCriteria } from '../../common/query/filters/FilterCriteria.ts';
import type { SearchFilter } from '../../common/query/filters/FilterTypes.ts';
import { mergeSearchQueries } from '../../common/searchQueryUtils.ts';
import { SecondaryNavbar } from '../../components/secondary-navbar/SecondaryNavbar.tsx';
import { formatSidebarFilterCount } from '../../components/secondary-navbar/sidebarFilterCount';
import { SidebarSearchInput } from '../../components/secondary-navbar/SidebarSearchInput.tsx';
import { TimelineGallery } from '../../components/timeline-gallery/TimelineGallery.tsx';
import { useLiveQuery } from '../../db/connection/useLiveQuery.tsx';
import { useAppStore } from '../../stores/appState.ts';
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
  const importStatus = useImportStatus();
  const placesPending =
    importStatus?.data &&
    (importStatus.data.scanning || importStatus.data.metadata > 0 || importStatus.data.locations > 0);
  const searchQuery = useAppStore((state) => state.searchQuery);
  const sort = useSidebarStore((state) => state.sort.places);
  const setSort = useSidebarStore((state) => state.setSort);
  const groupBy = useSidebarStore((state) => state.placesGroupBy);
  const setGroupBy = useSidebarStore((state) => state.setPlacesGroupBy);
  const [searchFilter, setSearchFilter] = useState('');
  /** Key of the selected place, or of the selected country in country mode. */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { data: locationSections } = useLiveQuery(
    () => AssetsService.getFileCountByPlace({ searchQuery }),
    ['assets'],
    { extDependencies: [searchQuery] },
  );

  const places = useMemo<PlaceListItem[]>(
    () => (locationSections ?? []).map((section) => toPlaceItem(section)),
    [locationSections],
  );

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

  // Keep the selection valid as the live data changes, defaulting to the
  // first item so the gallery isn't empty on first visit.
  useEffect(() => {
    if (!visibleItems.some((item) => item.key === selectedKey)) {
      setSelectedKey(visibleItems.at(0)?.key ?? null);
    }
  }, [visibleItems, selectedKey]);

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

  const {
    chips,
    activeChipIds,
    toggleChip,
    conditions,
    isLoading: chipsLoading,
    isRefreshing: chipsRefreshing,
  } = useContentFilterChips({
    searchQuery: galleryQuery,
    resetKey: selectedKey ?? undefined,
  });

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

  const renderPlaceRow = (place: PlaceListItem) => (
    <button
      key={place.key}
      className={clsx('place-list-row', selectedKey === place.key && 'selected')}
      onClick={() => setSelectedKey(place.key)}
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
      onClick={() => setSelectedKey(country.key)}
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

  usePageChrome('photos');

  return (
    <div className="places-page">
      <div>
        <SecondaryNavbar title="Places">
          {/* Filter field + a trailing sort control (§1) — no sidebar title/action bar. */}
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

          {locationSections !== null && (
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

          <section className="places-list-container">
            {locationSections !== null && visibleItems.length === 0 ? (
              <p className="places-empty-hint">
                {placesPending
                  ? importStatus?.running
                    ? 'Places may appear as more photos are processed.'
                    : 'Import is unfinished. This place list is not complete yet.'
                  : places.length === 0
                    ? 'No located photos or videos yet.'
                    : `No ${itemNoun} match your search.`}
              </p>
            ) : groupBy === 'country' ? (
              visibleCountries.map((country) => renderCountryRow(country))
            ) : (
              countryGroups.map((group) => (
                <div key={group.key} className="place-country-group">
                  <p className="places-group-label">
                    <span className="places-group-name">
                      <CountryFlag code={group.countryCode} className="places-group-flag" />
                      {group.label}
                    </span>
                    <span className="places-group-count">{group.count.toLocaleString()}</span>
                  </p>
                  {group.places.map((place) => renderPlaceRow(place))}
                </div>
              ))
            )}
          </section>
        </SecondaryNavbar>

        {selectedCountry ? (
          <div className="page-content">
            <SecondaryTitleAndScrollableContent
              icon={<IconWorld />}
              title={selectedCountry.label}
              subtitle={`${selectedCountry.places.length.toLocaleString()} place${selectedCountry.places.length === 1 ? '' : 's'} · ${itemsLabel(selectedCountry.count)}`}
              filters={chipsFilter}
              galleryLayout
              content={
                <TimelineGallery
                  key={selectedCountry.key}
                  searchQuery={chippedGalleryQuery}
                  pendingImport="places"
                />
              }
            />
          </div>
        ) : selectedPlace ? (
          <div className="page-content">
            <SecondaryTitleAndScrollableContent
              icon={<IconMapPin />}
              title={selectedPlace.primaryLabel}
              subtitle={
                selectedPlace.secondaryLabel
                  ? `${selectedPlace.secondaryLabel} · ${itemsLabel(selectedPlace.count)}`
                  : itemsLabel(selectedPlace.count)
              }
              filters={chipsFilter}
              galleryLayout
              content={
                <TimelineGallery
                  key={selectedPlace.key}
                  searchQuery={chippedGalleryQuery}
                  pendingImport="places"
                />
              }
            />
          </div>
        ) : (
          <div className="page-content">
            <ImportStatus />
            <NoResultsIndicator
              title={groupBy === 'country' ? 'Select a country' : 'Select a place'}
              icon={<IconMapPin size={64} strokeWidth={1} />}
              description={`Pick a ${groupBy} from the left panel to browse the photos and videos captured there.`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
