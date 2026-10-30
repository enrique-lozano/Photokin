import { isIn } from '../../../utils/array.utils';
import { formatDate } from '../../../utils/dateFormatter';
import { NumberOperator } from '../operators/Operators';
import {
  DatePartFilterCriteria,
  DateRangeFilterCriteria,
  FilterCriteria,
  ListFilterCriteria,
  NumberRangeFilterCriteria,
  TextFilterCriteria,
} from './FilterCriteria';
import { SearchFilter } from './FilterTypes';

/** Entity names spelled out before the rest is summarised as `+n`. */
const MAX_LISTED_NAMES = 2;

const COMPARISON_SYMBOL: Record<Exclude<NumberOperator, 'equals'>, string> = {
  notEquals: '≠',
  smallerThan: '<',
  smallerThanOrEquals: '≤',
  greaterThan: '>',
  greaterThanOrEquals: '≥',
};

const CRITERIA_LABEL: Partial<Record<FilterCriteria, string>> = {
  [FilterCriteria.rating]: 'Rating',
  [FilterCriteria.size]: 'Size',
  [FilterCriteria.person_count]: 'People count',
  [FilterCriteria.tag_count]: 'Tag count',
  [FilterCriteria.year]: 'Year',
  [FilterCriteria.month]: 'Month',
  [FilterCriteria.day]: 'Day',
  [FilterCriteria.weekday]: 'Weekday',
  [FilterCriteria.filename]: 'Filename',
  [FilterCriteria.description]: 'Description',
  [FilterCriteria.camera]: 'Camera',
  [FilterCriteria.lens]: 'Lens',
  [FilterCriteria.iso]: 'ISO',
  [FilterCriteria.focalLength]: 'Focal length',
  [FilterCriteria.aperture]: 'Aperture',
  [FilterCriteria.shutterSpeed]: 'Shutter speed',
  [FilterCriteria.location]: 'Location',
  [FilterCriteria.locationCity]: 'City',
  [FilterCriteria.locationState]: 'State',
  [FilterCriteria.locationCountry]: 'Country',
  [FilterCriteria.locationCountryCode]: 'Country code',
};

const LIST_CRITERIA_NOUN: Record<(typeof ListFilterCriteria)[number], { one: string; many: string }> = {
  [FilterCriteria.tag]: { one: 'Tag', many: 'Tags' },
  [FilterCriteria.person]: { one: 'Person', many: 'People' },
  [FilterCriteria.path]: { one: 'Album', many: 'Albums' },
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Matches SQLite's `%w`, where 0 is Sunday. */
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Plain-language summary of a single filter, for chips and other UI telling the
 * user what is narrowing their library. Unlike {@link filterToString} it never
 * shows query syntax, renders entity (tag/person/album) filters, and always
 * returns something readable.
 */
export function describeFilter(filter: SearchFilter): string {
  const { filterCriteria, value } = filter;

  if (isIn(ListFilterCriteria, filterCriteria)) {
    return _describeEntities(filterCriteria, Array.isArray(value) ? value : [value]);
  }

  if (filterCriteria === FilterCriteria.mediaType) {
    return value === 'video' ? 'Videos only' : 'Photos only';
  }

  if (filterCriteria === FilterCriteria.trashed) {
    return value ? 'In Trash' : 'Not in Trash';
  }

  if (filterCriteria === FilterCriteria.rated) {
    return value ? 'Rated' : 'Unrated';
  }

  if (filterCriteria === FilterCriteria.flash) {
    return value ? 'Flash fired' : 'No flash';
  }

  if (isIn(DateRangeFilterCriteria, filterCriteria)) {
    const verb = filterCriteria === FilterCriteria.dateAdded ? 'Added' : 'Taken';
    const date = formatDate(value as Date, { dateStyle: 'medium' });

    switch (filter.operator) {
      case 'greaterThan':
      case 'greaterThanOrEquals':
        return `${verb} after ${date}`;
      case 'smallerThan':
      case 'smallerThanOrEquals':
        return `${verb} before ${date}`;
      case 'notEquals':
        return `${verb} not on ${date}`;
      default:
        return `${verb} on ${date}`;
    }
  }

  // Date parts must be checked before number ranges: they belong to both sets.
  if (isIn(DatePartFilterCriteria, filterCriteria)) {
    const numeric = value as number;
    const named = filter.operator === 'equals' ? _datePartName(filterCriteria, numeric) : undefined;

    return _compare(_label(filterCriteria), filter.operator, named ?? String(numeric));
  }

  if (isIn(NumberRangeFilterCriteria, filterCriteria)) {
    const numeric = value as number;
    const unit =
      filterCriteria === FilterCriteria.size
        ? ' MB'
        : filterCriteria === FilterCriteria.focalLength
          ? ' mm'
          : '';
    const formatted = `${filterCriteria === FilterCriteria.aperture ? 'f/' : ''}${numeric}${unit}`;

    return _compare(_label(filterCriteria), filter.operator, formatted);
  }

  if (isIn(TextFilterCriteria, filterCriteria)) {
    const text = value as string;

    return filter.operator === 'contains'
      ? `${_label(filterCriteria)} contains "${text}"`
      : `${_label(filterCriteria)}: ${text}`;
  }

  return `${_label(filterCriteria)}: ${String(value)}`;
}

function _label(criteria: FilterCriteria): string {
  return CRITERIA_LABEL[criteria] ?? FilterCriteria[criteria];
}

function _compare(label: string, operator: SearchFilter['operator'], value: string): string {
  const symbol = COMPARISON_SYMBOL[operator as Exclude<NumberOperator, 'equals'>];

  return symbol ? `${label} ${symbol} ${value}` : `${label} ${value}`;
}

function _datePartName(criteria: FilterCriteria, value: number): string | undefined {
  if (criteria === FilterCriteria.month) return MONTH_NAMES[value - 1];
  if (criteria === FilterCriteria.weekday) return WEEKDAY_NAMES[value];

  return undefined;
}

/**
 * List filters hold either entities picked in the UI or names typed in the
 * search bar. Album paths carry ids only, so they are counted, not named.
 */
function _describeEntities(criteria: (typeof ListFilterCriteria)[number], values: unknown[]): string {
  const { one, many } = LIST_CRITERIA_NOUN[criteria];
  const names = values.map(_entityName).filter((name): name is string => Boolean(name));

  if (names.length === 0) {
    return `${values.length} ${values.length === 1 ? one.toLowerCase() : many.toLowerCase()}`;
  }

  const listed = names.slice(0, MAX_LISTED_NAMES).join(', ');
  const hidden = names.length - MAX_LISTED_NAMES;
  const noun = names.length === 1 ? one : many;

  return hidden > 0 ? `${noun}: ${listed} +${hidden}` : `${noun}: ${listed}`;
}

function _entityName(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;

  const name = (entry as { name?: unknown } | null)?.name;

  return typeof name === 'string' ? name : undefined;
}
