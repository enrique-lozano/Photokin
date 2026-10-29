import { SearchCondition } from '../../common/fileSearchFilters';
import { FilterCriteria, NumberRangeFilterCriteria } from '../../common/query/filters/FilterCriteria';
import { NumberOperator } from '../../common/query/operators/Operators';
import { RatingMode } from '../../common/ratingModeOptions';
import { ScopePlace } from '../../db/api/services/assets.service';
import { TagDTO } from '../../db/models/TagDTO';
import { FAVORITE_RATING } from '../../media/metadata/fields/favorite';
import { PersonRegion } from '@/db/models/PersonInfo';

/** Leading adornment of a chip. Resolved to an icon by `FilterChipRow`. */
export type ChipIconName =
  | 'calendar'
  | 'heart'
  | 'star'
  | 'video'
  | 'photo'
  | 'user'
  | 'users'
  | 'userOff'
  | 'tagOff'
  | 'mapPin'
  | 'mapPinOff';

/**
 * A quick, context-aware filter chip recommendation. Chips belonging to the
 * same `group` are mutually exclusive (selecting one replaces the other); chips
 * from different groups combine with AND. Each chip carries the full set of
 * search conditions it contributes. Selecting chips from different groups
 * combines them with AND (e.g. "This year" + "With Ana").
 */
export interface ContentFilterChip {
  id: string;
  label: string;
  count?: number;
  group: string;
  conditions: SearchCondition[];
  icon?: ChipIconName;
  /** Shown instead of the icon on person chips. */
  faceRegion?: PersonRegion;
}

/**
 * A scored candidate. `weight` nudges intrinsically meaningful filters
 * ("Favorites", "This year") above purely high-volume ones without overriding
 * the "most results first" priority.
 */
export interface ChipCandidate extends ContentFilterChip {
  weight: number;
}

/** The scope the candidates are built for, as measured by the histogram queries. */
export interface ChipScope {
  years: { year: string; totalImages: number }[];
  people: { tagId: string; name: string; totalImages: number; faceRegion?: PersonRegion }[];
  places: ScopePlace[];
  ratingMode: RatingMode;
}

/** How many busiest years / people / places we even consider as candidates. */
const MAX_YEAR_CANDIDATES = 4;
export const MAX_PEOPLE_CANDIDATES = 4;
export const MAX_PLACE_CANDIDATES = 3;

const numeric = (
  criteria: (typeof NumberRangeFilterCriteria)[number],
  operator: NumberOperator,
  value: number,
): SearchCondition => ({ filters: [{ filterCriteria: criteria, operator, value }] });

const rating = (operator: NumberOperator, value: number) => numeric(FilterCriteria.rating, operator, value);
const personCount = (operator: NumberOperator, value: number) =>
  numeric(FilterCriteria.person_count, operator, value);
const tagCount = (operator: NumberOperator, value: number) =>
  numeric(FilterCriteria.tag_count, operator, value);

const mediaType = (value: 'photo' | 'video'): SearchCondition => ({
  filters: [{ filterCriteria: FilterCriteria.mediaType, operator: 'equals', value }],
});

/** An empty value on `FilterCriteria.location` means "this asset has no place at all". */
const placeText = (
  criteria:
    | FilterCriteria.location
    | FilterCriteria.locationCity
    | FilterCriteria.locationCountry
    | FilterCriteria.locationCountryCode,
  value: string,
): SearchCondition => ({ filters: [{ filterCriteria: criteria, operator: 'equals', value }] });

const personTag = (id: string, name: string): TagDTO => ({ id, parentId: null, name, color: null });

const withPerson = (tagId: string, name: string): SearchCondition => ({
  filters: [{ filterCriteria: FilterCriteria.person, operator: 'contains', value: [personTag(tagId, name)] }],
});

const FAVORITES = rating('greaterThanOrEquals', FAVORITE_RATING);

function _yearConditions(year: number): SearchCondition[] {
  return [
    {
      filters: [
        {
          filterCriteria: FilterCriteria.date,
          operator: 'greaterThanOrEquals',
          value: new Date(Date.UTC(year, 0, 1)),
        },
        {
          filterCriteria: FilterCriteria.date,
          operator: 'smallerThan',
          value: new Date(Date.UTC(year + 1, 0, 1)),
        },
      ],
    },
  ];
}

type ChipSpec = [
  id: string,
  label: string,
  icon: ChipIconName,
  weight: number,
  conditions: SearchCondition[],
];

const QUALITY_SPECS: Record<RatingMode, ChipSpec> = {
  [RatingMode.Favorites]: ['favorites', 'Favorites', 'heart', 3, [FAVORITES]],
  [RatingMode.Stars]: ['top-rated', 'Top rated', 'star', 2, [rating('greaterThanOrEquals', 4)]],
};

/** Chips whose conditions never depend on the scope, by mutually exclusive group. */
const STATIC_SPECS: Record<string, readonly ChipSpec[]> = {
  media: [
    ['videos', 'Videos', 'video', 3, [mediaType('video')]],
    ['photos', 'Photos', 'photo', 1, [mediaType('photo')]],
  ],
  // All three carry the same weight, so which one wins the group's single slot
  // is decided by how many assets it actually matches.
  'people-count': [
    ['solo', 'Alone', 'user', 3, [personCount('equals', 1)]],
    ['group', 'Group photo', 'users', 3, [personCount('greaterThanOrEquals', 2)]],
    ['no-people', 'No people', 'userOff', 3, [personCount('equals', 0)]],
  ],
  curation: [['untagged', 'Untagged', 'tagOff', 2, [tagCount('equals', 0)]]],
  place: [['no-location', 'No location', 'mapPinOff', 1, [placeText(FilterCriteria.location, '')]]],
};

function _qualityCandidate(ratingMode: RatingMode): ChipCandidate {
  const [id, label, icon, weight, conditions] = QUALITY_SPECS[ratingMode];
  return { id, label, group: 'quality', icon, weight, conditions };
}

function _staticCandidates(ratingMode: RatingMode): ChipCandidate[] {
  return [
    _qualityCandidate(ratingMode),
    ...Object.entries(STATIC_SPECS).flatMap(([group, specs]) =>
      specs.map(([id, label, icon, weight, conditions]) => ({
        id,
        label,
        group,
        icon,
        weight,
        conditions,
      })),
    ),
  ];
}

function _yearCandidates(years: ChipScope['years']): ChipCandidate[] {
  const currentYear = new Date().getFullYear();

  return [...years]
    .filter((entry) => Number.isFinite(Number(entry.year)))
    .sort((a, b) => b.totalImages - a.totalImages)
    .slice(0, MAX_YEAR_CANDIDATES)
    .map(({ year, totalImages }) => {
      const offset = currentYear - Number(year);
      const relative = offset === 0 ? 'This year' : offset === 1 ? 'Last year' : null;

      return {
        id: `year-${year}`,
        label: relative ?? year,
        count: totalImages,
        group: 'time',
        icon: 'calendar' as const,
        weight: relative ? 3 - offset : 1,
        conditions: _yearConditions(Number(year)),
      };
    });
}

function _personCandidates(people: ChipScope['people']): ChipCandidate[] {
  return people.map((person) => ({
    id: `person-${person.tagId}`,
    label: `With ${person.name}`,
    count: person.totalImages,
    // Each person is its own group: "with X" and "with Y" combine with AND.
    group: `person-${person.tagId}`,
    faceRegion: person.faceRegion,
    icon: 'user' as const,
    weight: 2,
    conditions: [withPerson(person.tagId, person.name)],
  }));
}

/**
 * Pins a place bucket back to its assets: by city when it has one, otherwise by
 * the country's canonical code (so "Italy"/"Italia" both match) or its name.
 */
function _placeCondition(place: ScopePlace): SearchCondition {
  if (place.city) return placeText(FilterCriteria.locationCity, place.city);
  if (place.countryCode) return placeText(FilterCriteria.locationCountryCode, place.countryCode);
  return placeText(FilterCriteria.locationCountry, place.country ?? '');
}

function _placeCandidates(places: ScopePlace[]): ChipCandidate[] {
  return places.flatMap((place) => {
    const label = place.city ?? place.country ?? place.countryCode;
    if (!label) return [];

    return [
      {
        id: `place-${label}`,
        label,
        count: place.totalImages,
        group: 'place',
        icon: 'mapPin' as const,
        weight: 2,
        conditions: [_placeCondition(place)],
      },
    ];
  });
}

/**
 * Builds the full candidate list (time / quality / media / people / place).
 * Year, person and place candidates already know their result count (it comes
 * straight from the histogram queries), so only the rest need an extra count query.
 */
export function buildChipCandidates(scope: ChipScope): {
  precounted: ChipCandidate[];
  toCount: ChipCandidate[];
} {
  return {
    precounted: [
      ..._yearCandidates(scope.years),
      ..._personCandidates(scope.people),
      ..._placeCandidates(scope.places),
    ],
    toCount: _staticCandidates(scope.ratingMode),
  };
}
