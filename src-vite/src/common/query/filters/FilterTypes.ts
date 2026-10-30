import { AlbumDTO } from '../../../db/models/AlbumDTO';
import { TagDTO } from '../../../db/models/TagDTO';
import { ArrayOperator, NumberOperator, StringOperator } from '../operators/Operators';
import {
  DateRangeFilterCriteria,
  FilterCriteria,
  ListFilterCriteria,
  MediaTypeFilterCriteria,
  NumberRangeFilterCriteria,
  TextFilterCriteria,
} from './FilterCriteria';

interface BaseFilter<ValueType, Operator, FilterCr extends FilterCriteria> {
  filterCriteria: FilterCr;
  operator: Operator;
  value: ValueType;
}

export type NumberRangeFilter = BaseFilter<
  number,
  NumberOperator,
  (typeof NumberRangeFilterCriteria)[number]
>;

export type DateRangeFilter = BaseFilter<Date, NumberOperator, (typeof DateRangeFilterCriteria)[number]>;

export type TextFilter = BaseFilter<string, StringOperator, (typeof TextFilterCriteria)[number]>;

export type ListFilter<
  SearchType,
  Key extends (typeof ListFilterCriteria)[number] = (typeof ListFilterCriteria)[number],
> = BaseFilter<Array<SearchType>, ArrayOperator, Key>;

export type PathFilter = ListFilter<Pick<AlbumDTO, 'id'>, FilterCriteria.path>;
export type TagFilter = ListFilter<TagDTO, FilterCriteria.tag | FilterCriteria.person>;
/** Names parsed from typed `tag:`/`person:` input before entity resolution. */
export type UnresolvedTagFilter = ListFilter<string, FilterCriteria.tag | FilterCriteria.person>;
export type MediaTypeFilter = BaseFilter<
  'video' | 'photo',
  'equals',
  (typeof MediaTypeFilterCriteria)[number]
>;
/** `true` matches only trashed assets, `false` only live (non-trashed) ones. */
export type TrashedFilter = BaseFilter<boolean, 'equals', FilterCriteria.trashed>;
export type RatedFilter = BaseFilter<boolean, 'equals', FilterCriteria.rated>;
/** `true` matches photos whose flash fired, `false` those with a flash tag saying it did not. */
export type FlashFilter = BaseFilter<boolean, 'equals', FilterCriteria.flash>;

export type SearchFilter =
  | TextFilter
  | DateRangeFilter
  | NumberRangeFilter
  | TagFilter
  | UnresolvedTagFilter
  | PathFilter
  | MediaTypeFilter
  | RatedFilter
  | FlashFilter
  | TrashedFilter;
