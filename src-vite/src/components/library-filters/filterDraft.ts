import { ExposureField, formatExposureRange } from '@/common/exposureStops';
import { SearchCondition, SearchQueryType } from '@/common/fileSearchFilters';
import { FilterCriteria, NumberRangeFilterCriteria } from '@/common/query/filters/FilterCriteria';
import { SearchFilter } from '@/common/query/filters/FilterTypes';
import { NumberOperator } from '@/common/query/operators/Operators';
import { TagDTO } from '@/db/models/TagDTO';
import { FAVORITE_RATING } from '@/media/metadata/fields/favorite';

export const MAX_FILESIZE_MB = 200;
export const MAX_PERSON_COUNT = 12;

type MediaTypeDraft = 'all' | 'photo' | 'video';
export type RatingComparison = '>=' | '=';
export type FlashDraft = 'any' | 'fired' | 'notFired';
/** `null` ends mean "no limit". */
export type ExposureRange = [number | null, number | null];

export type FilterSectionId =
  | 'quick'
  | 'date-taken'
  | 'date-added'
  | 'rating'
  | 'people'
  | 'tags'
  | 'location'
  | 'camera'
  | 'size'
  | 'text';

export type FilterDraftState = {
  favoritesOnly: boolean;
  mediaType: MediaTypeDraft;
  dateTakenAfter: string;
  dateTakenBefore: string;
  dateAddedAfter: string;
  dateAddedBefore: string;
  ratingMode: RatingComparison;
  ratingValue: number;
  peopleIds: string[];
  personCountRange: [number, number];
  tagIds: string[];
  location: string;
  /** Exact camera bodies (make + model); several are OR-ed together. */
  cameras: string[];
  lens: string;
  exposure: Record<ExposureField, ExposureRange>;
  flash: FlashDraft;
  sizeRange: [number, number];
  filenameContains: string;
  descriptionContains: string;
};

const EXPOSURE_CRITERIA: Record<ExposureField, (typeof NumberRangeFilterCriteria)[number]> = {
  iso: FilterCriteria.iso,
  aperture: FilterCriteria.aperture,
  shutterSpeed: FilterCriteria.shutterSpeed,
  focalLength: FilterCriteria.focalLength,
};

export const createEmptyDraft = (): FilterDraftState => ({
  favoritesOnly: false,
  mediaType: 'all',
  dateTakenAfter: '',
  dateTakenBefore: '',
  dateAddedAfter: '',
  dateAddedBefore: '',
  ratingMode: '>=',
  ratingValue: 0,
  peopleIds: [],
  personCountRange: [0, MAX_PERSON_COUNT],
  tagIds: [],
  location: '',
  cameras: [],
  lens: '',
  exposure: {
    iso: [null, null],
    aperture: [null, null],
    shutterSpeed: [null, null],
    focalLength: [null, null],
  },
  flash: 'any',
  sizeRange: [0, MAX_FILESIZE_MB],
  filenameContains: '',
  descriptionContains: '',
});

function _toISODate(input: string): Date | null {
  if (!input) return null;
  const value = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(value.valueOf())) return null;
  return value;
}

export function toDateInput(value: unknown): string {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    return '';
  }
  return value.toISOString().slice(0, 10);
}

/** The upper bound of a range slider means "no upper limit", so it is never shown as a number. */
export function formatRangeLabel(min: number, max: number, sliderMax: number, unit = ''): string {
  const suffix = unit ? ` ${unit}` : '';
  if (min === 0 && max === sliderMax) return 'any';
  if (max === sliderMax) return `${min}+${suffix}`;
  if (min === 0) return `≤ ${max}${suffix}`;
  return `${min} – ${max}${suffix}`;
}

function _getNumericFilterValue(
  filters: SearchFilter[],
  criteria: (typeof NumberRangeFilterCriteria)[number],
  operator: NumberOperator,
): number | null {
  const found = filters.find(
    (filter) =>
      filter.filterCriteria === criteria && filter.operator === operator && typeof filter.value === 'number',
  );
  return found ? (found.value as number) : null;
}

function _extractFilterIds(filter: SearchFilter | undefined): string[] {
  if (!filter || !Array.isArray(filter.value)) {
    return [];
  }

  return filter.value
    .map((entry) => (typeof entry === 'object' && entry !== null && 'id' in entry ? String(entry.id) : null))
    .filter((value): value is string => Boolean(value));
}

/** Filters the drawer has no control for; they survive an Apply untouched. */
function _isPreservedFilter(filter: SearchFilter): boolean {
  return (
    filter.filterCriteria === FilterCriteria.rated ||
    (filter.filterCriteria === FilterCriteria.date && filter.operator === 'smallerThan') ||
    (filter.filterCriteria === FilterCriteria.camera && filter.operator !== 'equals')
  );
}

export function hydrateDraftFromFilters(filters: SearchFilter[]): FilterDraftState {
  const draft = createEmptyDraft();
  const ratingAtLeastFavorite = filters.some(
    (filter) =>
      filter.filterCriteria === FilterCriteria.rating &&
      filter.operator === 'greaterThanOrEquals' &&
      filter.value === FAVORITE_RATING,
  );
  draft.favoritesOnly = ratingAtLeastFavorite;

  const mediaTypeFilter = filters.find((filter) => filter.filterCriteria === FilterCriteria.mediaType);
  if (mediaTypeFilter && (mediaTypeFilter.value === 'photo' || mediaTypeFilter.value === 'video')) {
    draft.mediaType = mediaTypeFilter.value;
  }

  const dateTakenAfter = filters.find(
    (filter) => filter.filterCriteria === FilterCriteria.date && filter.operator === 'greaterThanOrEquals',
  );
  const dateTakenBefore = filters.find(
    (filter) => filter.filterCriteria === FilterCriteria.date && filter.operator === 'smallerThanOrEquals',
  );
  draft.dateTakenAfter = dateTakenAfter ? toDateInput(dateTakenAfter.value) : '';
  draft.dateTakenBefore = dateTakenBefore ? toDateInput(dateTakenBefore.value) : '';

  const dateAddedAfter = filters.find(
    (filter) =>
      filter.filterCriteria === FilterCriteria.dateAdded && filter.operator === 'greaterThanOrEquals',
  );
  const dateAddedBefore = filters.find(
    (filter) =>
      filter.filterCriteria === FilterCriteria.dateAdded && filter.operator === 'smallerThanOrEquals',
  );
  draft.dateAddedAfter = dateAddedAfter ? toDateInput(dateAddedAfter.value) : '';
  draft.dateAddedBefore = dateAddedBefore ? toDateInput(dateAddedBefore.value) : '';

  const equalsRating = _getNumericFilterValue(filters, FilterCriteria.rating, 'equals');
  const gteRating = _getNumericFilterValue(filters, FilterCriteria.rating, 'greaterThanOrEquals');
  if (equalsRating !== null) {
    draft.ratingMode = '=';
    draft.ratingValue = equalsRating;
  } else if (gteRating !== null) {
    draft.ratingMode = '>=';
    draft.ratingValue = gteRating;
  }

  const personFilter = filters.find((filter) => filter.filterCriteria === FilterCriteria.person);
  if (personFilter) {
    draft.peopleIds = _extractFilterIds(personFilter);
  }
  const personCountMin = _getNumericFilterValue(filters, FilterCriteria.person_count, 'greaterThanOrEquals');
  const personCountMax = _getNumericFilterValue(filters, FilterCriteria.person_count, 'smallerThanOrEquals');
  draft.personCountRange = [personCountMin ?? 0, personCountMax ?? MAX_PERSON_COUNT];

  const tagFilter = filters.find((filter) => filter.filterCriteria === FilterCriteria.tag);
  if (tagFilter) {
    draft.tagIds = _extractFilterIds(tagFilter);
  }

  const locationFilter = filters.find((filter) => filter.filterCriteria === FilterCriteria.location);
  if (locationFilter && typeof locationFilter.value === 'string') {
    draft.location = locationFilter.value;
  }

  const cameras = filters.flatMap((filter) =>
    filter.filterCriteria === FilterCriteria.camera &&
    filter.operator === 'equals' &&
    typeof filter.value === 'string'
      ? [filter.value]
      : [],
  );
  draft.cameras = [...new Set(cameras)];
  const lensFilter = filters.find((filter) => filter.filterCriteria === FilterCriteria.lens);
  if (lensFilter && typeof lensFilter.value === 'string') draft.lens = lensFilter.value;

  for (const field of Object.keys(EXPOSURE_CRITERIA) as ExposureField[]) {
    draft.exposure[field] = [
      _getNumericFilterValue(filters, EXPOSURE_CRITERIA[field], 'greaterThanOrEquals'),
      _getNumericFilterValue(filters, EXPOSURE_CRITERIA[field], 'smallerThanOrEquals'),
    ];
  }

  const flashFilter = filters.find((filter) => filter.filterCriteria === FilterCriteria.flash);
  if (flashFilter) draft.flash = flashFilter.value ? 'fired' : 'notFired';

  const minSize = _getNumericFilterValue(filters, FilterCriteria.size, 'greaterThanOrEquals');
  const maxSize = _getNumericFilterValue(filters, FilterCriteria.size, 'smallerThanOrEquals');
  draft.sizeRange = [minSize ?? 0, maxSize ?? MAX_FILESIZE_MB];

  const filenameFilter = filters.find((filter) => filter.filterCriteria === FilterCriteria.filename);
  if (filenameFilter && typeof filenameFilter.value === 'string') {
    draft.filenameContains = filenameFilter.value;
  }
  const descriptionFilter = filters.find((filter) => filter.filterCriteria === FilterCriteria.description);
  if (descriptionFilter && typeof descriptionFilter.value === 'string') {
    draft.descriptionContains = descriptionFilter.value;
  }

  return draft;
}

/**
 * The global search query the draft stands for. Everything is AND-ed in one
 * condition, except several cameras, which get their own OR condition.
 * `currentFilters` are the filters applied now; the ones the drawer cannot
 * edit are carried over.
 */
export function buildDraftConditions(
  draft: FilterDraftState,
  currentFilters: SearchFilter[],
  resolved: { people: TagDTO[]; tags: TagDTO[] },
): SearchCondition[] {
  const filters = currentFilters.filter(_isPreservedFilter);

  if (draft.favoritesOnly) {
    filters.push({
      filterCriteria: FilterCriteria.rating,
      operator: 'greaterThanOrEquals',
      value: FAVORITE_RATING,
    });
  }
  if (draft.mediaType !== 'all') {
    filters.push({ filterCriteria: FilterCriteria.mediaType, operator: 'equals', value: draft.mediaType });
  }

  const addDate = (
    criteria: FilterCriteria.date | FilterCriteria.dateAdded,
    after: string,
    before: string,
  ) => {
    const from = _toISODate(after);
    if (from) filters.push({ filterCriteria: criteria, operator: 'greaterThanOrEquals', value: from });
    const to = _toISODate(before);
    if (to) filters.push({ filterCriteria: criteria, operator: 'smallerThanOrEquals', value: to });
  };
  addDate(FilterCriteria.date, draft.dateTakenAfter, draft.dateTakenBefore);
  addDate(FilterCriteria.dateAdded, draft.dateAddedAfter, draft.dateAddedBefore);

  if (draft.ratingValue > 0) {
    filters.push({
      filterCriteria: FilterCriteria.rating,
      operator: draft.ratingMode === '>=' ? 'greaterThanOrEquals' : 'equals',
      value: draft.ratingValue,
    });
  }

  if (resolved.people.length > 0) {
    filters.push({ filterCriteria: FilterCriteria.person, operator: 'contains', value: resolved.people });
  }
  const [countMin, countMax] = draft.personCountRange;
  if (countMin > 0) {
    filters.push({
      filterCriteria: FilterCriteria.person_count,
      operator: 'greaterThanOrEquals',
      value: countMin,
    });
  }
  if (countMax < MAX_PERSON_COUNT) {
    filters.push({
      filterCriteria: FilterCriteria.person_count,
      operator: 'smallerThanOrEquals',
      value: countMax,
    });
  }

  if (resolved.tags.length > 0) {
    filters.push({ filterCriteria: FilterCriteria.tag, operator: 'contains', value: resolved.tags });
  }

  if (draft.location.trim()) {
    filters.push({
      filterCriteria: FilterCriteria.location,
      operator: 'contains',
      value: draft.location.trim(),
    });
  }

  const cameraFilters: SearchFilter[] = draft.cameras.map((camera) => ({
    filterCriteria: FilterCriteria.camera,
    operator: 'equals',
    value: camera,
  }));
  if (cameraFilters.length === 1) filters.push(cameraFilters[0]);
  if (draft.lens.trim()) {
    filters.push({ filterCriteria: FilterCriteria.lens, operator: 'equals', value: draft.lens.trim() });
  }

  for (const field of Object.keys(EXPOSURE_CRITERIA) as ExposureField[]) {
    const [min, max] = draft.exposure[field];
    const filterCriteria = EXPOSURE_CRITERIA[field];
    if (min !== null) filters.push({ filterCriteria, operator: 'greaterThanOrEquals', value: min });
    if (max !== null) filters.push({ filterCriteria, operator: 'smallerThanOrEquals', value: max });
  }

  if (draft.flash !== 'any') {
    filters.push({
      filterCriteria: FilterCriteria.flash,
      operator: 'equals',
      value: draft.flash === 'fired',
    });
  }

  const [sizeMin, sizeMax] = draft.sizeRange;
  if (sizeMin > 0) {
    filters.push({ filterCriteria: FilterCriteria.size, operator: 'greaterThanOrEquals', value: sizeMin });
  }
  if (sizeMax < MAX_FILESIZE_MB) {
    filters.push({ filterCriteria: FilterCriteria.size, operator: 'smallerThanOrEquals', value: sizeMax });
  }

  if (draft.filenameContains.trim()) {
    filters.push({
      filterCriteria: FilterCriteria.filename,
      operator: 'contains',
      value: draft.filenameContains.trim(),
    });
  }
  if (draft.descriptionContains.trim()) {
    filters.push({
      filterCriteria: FilterCriteria.description,
      operator: 'contains',
      value: draft.descriptionContains.trim(),
    });
  }

  const conditions: SearchCondition[] = filters.length > 0 ? [{ filters }] : [];
  if (cameraFilters.length > 1) conditions.push({ type: SearchQueryType.OR, filters: cameraFilters });
  return conditions;
}

const UTC_DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });

/** "2024", "2024 – 2026" for whole years; otherwise medium dates. */
export function formatDateRange(after: string, before: string): string | null {
  const from = _toISODate(after);
  const to = _toISODate(before);
  if (from && to && after.endsWith('-01-01') && before.endsWith('-12-31')) {
    const [startYear, endYear] = [after.slice(0, 4), before.slice(0, 4)];
    return startYear === endYear ? startYear : `${startYear} – ${endYear}`;
  }
  if (from && to) return `${UTC_DATE.format(from)} – ${UTC_DATE.format(to)}`;
  if (from) return `Since ${UTC_DATE.format(from)}`;
  if (to) return `Until ${UTC_DATE.format(to)}`;
  return null;
}

function _formatNames(names: string[]): string {
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
}

const join = (parts: (string | null | false | undefined)[]): string | null =>
  parts.filter(Boolean).join(' · ') || null;

/**
 * What each section has set, in a few words, for its collapsed header.
 * `null` means the section adds no filter.
 */
export function getSectionSummaries(
  draft: FilterDraftState,
  names: { people: string[]; tags: string[] },
): Record<FilterSectionId, string | null> {
  const [countMin, countMax] = draft.personCountRange;
  const personCount =
    (countMin > 0 || countMax < MAX_PERSON_COUNT) &&
    formatRangeLabel(countMin, countMax, MAX_PERSON_COUNT, 'people');
  const exposure = (field: ExposureField) => formatExposureRange(field, draft.exposure[field]);
  const iso = exposure('iso');
  const shutter = exposure('shutterSpeed');
  const [sizeMin, sizeMax] = draft.sizeRange;

  return {
    quick: join([
      draft.favoritesOnly && 'Favorites',
      draft.mediaType === 'photo' && 'Photos',
      draft.mediaType === 'video' && 'Videos',
    ]),
    'date-taken': formatDateRange(draft.dateTakenAfter, draft.dateTakenBefore),
    'date-added': formatDateRange(draft.dateAddedAfter, draft.dateAddedBefore),
    rating:
      draft.ratingValue > 0
        ? draft.ratingMode === '>='
          ? `${draft.ratingValue}★ and up`
          : `Exactly ${draft.ratingValue}★`
        : null,
    people: join([
      draft.peopleIds.length > 0 &&
        (names.people.length > 0 ? _formatNames(names.people) : `${draft.peopleIds.length} people`),
      personCount,
    ]),
    tags:
      draft.tagIds.length > 0
        ? names.tags.length > 0
          ? _formatNames(names.tags)
          : `${draft.tagIds.length} tags`
        : null,
    location: draft.location.trim() || null,
    camera: join([
      draft.cameras.length === 1
        ? draft.cameras[0]
        : draft.cameras.length > 1 && `${draft.cameras.length} cameras`,
      draft.lens.trim(),
      iso && `ISO ${iso}`,
      exposure('aperture'),
      shutter && `Shutter ${shutter}`,
      exposure('focalLength'),
      draft.flash === 'fired' && 'Flash fired',
      draft.flash === 'notFired' && 'No flash',
    ]),
    size:
      sizeMin > 0 || sizeMax < MAX_FILESIZE_MB
        ? formatRangeLabel(sizeMin, sizeMax, MAX_FILESIZE_MB, 'MB')
        : null,
    text: join([
      draft.filenameContains.trim() && `“${draft.filenameContains.trim()}”`,
      draft.descriptionContains.trim() && `“${draft.descriptionContains.trim()}”`,
    ]),
  };
}
