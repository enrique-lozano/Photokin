/*
  Enum representing various criteria that can be used for filtering search results.
*/

import { AssetDTO } from '../../../db/models/AssetDTO';

export enum FilterCriteria {
  date = 'date',
  person_count = 'person_count',
  tag_count = 'tag_count',
  rating = 'rating',
  rated = 'rated',
  size = 'size',
  mediaType = 'mediaType',
  filename = 'filename',
  path = 'path',
  person = 'person',
  tag = 'tag',
  year = 'year',
  month = 'month',
  day = 'day',
  weekday = 'weekday',
  description = 'description',
  camera = 'camera',
  lens = 'lens',
  iso = 'iso',
  focalLength = 'focalLength',
  aperture = 'aperture',
  shutterSpeed = 'shutterSpeed',
  location = 'location',
  dateAdded = 'dateAdded',
  locationCity = 'locationCity',
  locationState = 'locationState',
  locationCountry = 'locationCountry',
  locationCountryCode = 'locationCountryCode',
  /** Matches on whether an asset is in the app-managed Trash. */
  trashed = 'trashed',
  /** Matches on whether the EXIF flash tag says the flash fired. */
  flash = 'flash',
}

/**
 * Constant array of filter criteria that accept text values.
 */
export const TextFilterCriteria = [
  FilterCriteria.filename,
  FilterCriteria.description,
  FilterCriteria.camera,
  FilterCriteria.lens,
  FilterCriteria.location,
  FilterCriteria.locationCity,
  FilterCriteria.locationState,
  FilterCriteria.locationCountry,
  FilterCriteria.locationCountryCode,
] as const;

/**
 * Constant array of filter criteria that accept number ranges.
 */
export const NumberRangeFilterCriteria = [
  FilterCriteria.person_count,
  FilterCriteria.tag_count,
  FilterCriteria.rating,
  FilterCriteria.size,
  FilterCriteria.year,
  FilterCriteria.month,
  FilterCriteria.day,
  FilterCriteria.weekday,
  FilterCriteria.iso,
  FilterCriteria.focalLength,
  FilterCriteria.aperture,
  FilterCriteria.shutterSpeed,
] as const;

/**
 * Criteria matching a single calendar component of the capture date
 * (`year:2019`, `month:12`) instead of a full date.
 */
export const DatePartFilterCriteria = [
  FilterCriteria.year,
  FilterCriteria.month,
  FilterCriteria.day,
  FilterCriteria.weekday,
] as const;

/**
 * Constant array of filter criteria that accept date ranges.
 */
export const DateRangeFilterCriteria = [FilterCriteria.date, FilterCriteria.dateAdded] as const;

export const ListFilterCriteria = [FilterCriteria.tag, FilterCriteria.path, FilterCriteria.person] as const;

export const MediaTypeFilterCriteria = [FilterCriteria.mediaType] as const;

export function filterCriteriaWhereIndex(criteria: FilterCriteria): keyof AssetDTO {
  switch (criteria) {
    case FilterCriteria.date:
      return 'date';
    case FilterCriteria.dateAdded:
      return 'dateAdded';
    case FilterCriteria.rating:
      return 'rating';
    case FilterCriteria.size:
      return 'filesize';
    case FilterCriteria.mediaType:
      return 'filename';
    case FilterCriteria.filename:
      return 'filename';
    case FilterCriteria.path:
      return 'albumId';
    // NOTE: the date-part criteria (year/month/day/weekday) have no backing
    // column either — they compare a `strftime` component of `date` and are
    // handled directly in `_getExpression`.
    case FilterCriteria.description:
      return 'description';
    case FilterCriteria.lens:
      return 'lens';
    // NOTE: `FilterCriteria.location` has no single backing column — it matches
    // a label composed in SQL from the structured columns and is handled
    // directly in `_getExpression`, so it never reaches this mapping.
    case FilterCriteria.locationCity:
      return 'locationCity';
    case FilterCriteria.locationState:
      return 'locationState';
    case FilterCriteria.locationCountry:
      return 'locationCountry';
    case FilterCriteria.locationCountryCode:
      return 'locationCountryCode';
    default:
      throw new Error('Unknown filter criteria');
  }
}
