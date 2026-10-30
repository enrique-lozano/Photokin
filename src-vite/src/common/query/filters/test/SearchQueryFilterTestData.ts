import { FilterCriteria } from '../FilterCriteria';
import { SearchFilter } from '../FilterTypes';

export interface SearchQueryFilterTestData {
  queryStr: string;
  filter: SearchFilter;
}

export const dateCommonFilters: SearchQueryFilterTestData[] = [
  {
    queryStr: 'date>2020-08-15',
    filter: {
      filterCriteria: FilterCriteria.date,
      operator: 'greaterThan',
      value: new Date(2020, 7, 15),
    },
  },
  {
    queryStr: 'date<2020-08-15',
    filter: {
      filterCriteria: FilterCriteria.date,
      operator: 'smallerThan',
      value: new Date(2020, 7, 15),
    },
  },
  {
    queryStr: 'after:2020-08-15',
    filter: {
      filterCriteria: FilterCriteria.date,
      operator: 'greaterThanOrEquals',
      value: new Date(2020, 7, 15),
    },
  },
  {
    queryStr: 'before:2020-08-15',
    filter: {
      filterCriteria: FilterCriteria.date,
      operator: 'smallerThanOrEquals',
      value: new Date(2020, 7, 15),
    },
  },
  {
    queryStr: 'date=2020-08-15',
    filter: {
      filterCriteria: FilterCriteria.date,
      operator: 'equals',
      value: new Date(2020, 7, 15),
    },
  },
];

export const listCommonFilters: SearchQueryFilterTestData[] = [
  {
    queryStr: 'tag:Yosemite,Hiking',
    filter: {
      filterCriteria: FilterCriteria.tag,
      operator: 'contains',
      // Parsed search-bar values are names; drawer filters use TagDTO objects.
      value: ['Yosemite', 'Hiking'],
    } as SearchFilter,
  },
  {
    queryStr: 'person:"Ana Lopez"',
    filter: {
      filterCriteria: FilterCriteria.person,
      operator: 'contains',
      value: ['Ana Lopez'],
    } as SearchFilter,
  },
];

export const numberCommonFilters: SearchQueryFilterTestData[] = [
  {
    queryStr: 'person_count>3',
    filter: {
      filterCriteria: FilterCriteria.person_count,
      operator: 'greaterThan',
      value: 3,
    },
  },
  {
    queryStr: 'tag_count<10',
    filter: {
      filterCriteria: FilterCriteria.tag_count,
      operator: 'smallerThan',
      value: 10,
    },
  },
  {
    queryStr: 'person_count>=3',
    filter: {
      filterCriteria: FilterCriteria.person_count,
      operator: 'greaterThanOrEquals',
      value: 3,
    },
  },
  {
    queryStr: 'size<=10',
    filter: {
      filterCriteria: FilterCriteria.size,
      operator: 'smallerThanOrEquals',
      value: 10,
    },
  },
  {
    queryStr: 'rating=5',
    filter: {
      filterCriteria: FilterCriteria.rating,
      operator: 'equals',
      value: 5,
    },
  },
];
