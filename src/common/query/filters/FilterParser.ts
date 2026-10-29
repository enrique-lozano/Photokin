import { isIn } from '../../../utils/array.utils';
import { toYYYYMMdd } from '../../../utils/dateFormatter';
import { operatorToString, resolveOperatorOrThrow } from '../operators/OperatorUtils';
import { getFilterCriteria } from '../searchKeywords';
import { NumberOperator, StringOperator, numberOperators, stringOperators } from '../operators/Operators';
import {
  DateRangeFilterCriteria,
  FilterCriteria,
  ListFilterCriteria,
  MediaTypeFilterCriteria,
  NumberRangeFilterCriteria,
  TextFilterCriteria,
} from './FilterCriteria';
import { SearchFilter } from './FilterTypes';

export function filterToString(filter: SearchFilter): string {
  const { filterCriteria, value } = filter;
  let valueStr = '';
  let keywordStr = '';
  let operatorStr = '';

  if (isIn(TextFilterCriteria, filterCriteria)) {
    valueStr = value as string;
    keywordStr = FilterCriteria[filterCriteria];

    operatorStr = operatorToString({
      operator: filter.operator as StringOperator,
      operatorMap: stringOperators,
    });
  } else if (isIn(NumberRangeFilterCriteria, filterCriteria)) {
    const numberValue = value as number;

    valueStr = numberValue.toString();

    keywordStr = FilterCriteria[filterCriteria];

    operatorStr = operatorToString({
      operator: filter.operator as NumberOperator,
      operatorMap: numberOperators,
    });
  } else if (isIn(DateRangeFilterCriteria, filterCriteria)) {
    valueStr = toYYYYMMdd(value as Date);

    if (filterCriteria === FilterCriteria.dateAdded && filter.operator === 'greaterThanOrEquals') {
      keywordStr = `added`;
      operatorStr = '>=';
    } else if (filterCriteria === FilterCriteria.dateAdded && filter.operator === 'smallerThanOrEquals') {
      keywordStr = `added`;
      operatorStr = '<=';
    } else if (filterCriteria === FilterCriteria.dateAdded) {
      keywordStr = `added`;
      operatorStr = operatorToString({
        operator: filter.operator as NumberOperator,
        operatorMap: numberOperators,
      });
    } else if (filter.operator === 'greaterThanOrEquals') {
      keywordStr = `after`;
      operatorStr = ':';
    } else if (filter.operator === 'smallerThanOrEquals') {
      keywordStr = `before`;
      operatorStr = ':';
    } else {
      keywordStr = `date`;

      operatorStr = operatorToString({
        operator: filter.operator as NumberOperator,
        operatorMap: numberOperators,
      });
    }
  } else if (isIn(MediaTypeFilterCriteria, filterCriteria)) {
    keywordStr = 'type';
    operatorStr = ':';
    valueStr = value as string;
  } else if (isIn(ListFilterCriteria, filterCriteria)) {
    keywordStr = FilterCriteria[filterCriteria];
    operatorStr = ':';
    valueStr = _serializeListFilterValue(Array.isArray(value) ? value : [value]);
  }

  return `${keywordStr}${operatorStr}${valueStr}`;
}

export function strToFilter(filterStr: string): SearchFilter[] | undefined {
  const filterKeyValueArray = filterStr.split(/([>~<]=?|[~=:])/);

  // No operator means this is free text (`beach`), not a `key:value` filter.
  // The search bar relies on `undefined` here so the token can become CLIP input.
  if (filterKeyValueArray.length <= 1) {
    return undefined;
  }

  if (filterKeyValueArray.length > 3) {
    throw Error('Multiple operators found within the same filter');
  }

  const [key, operator, value] = filterKeyValueArray;
  const normalizedKey = key.toLowerCase();
  const filterCriteria = getFilterCriteria(normalizedKey);

  if (filterCriteria === undefined) {
    throw new Error(`Unknown filter criteria: ${key}`);
  }

  if (isIn(TextFilterCriteria, filterCriteria)) {
    const parsedOperator = resolveOperatorOrThrow({
      symbol: operator,
      operatorMap: stringOperators,
    });

    return [
      {
        filterCriteria,
        operator: parsedOperator,
        value: _unquoteFilterValue(value),
      },
    ];
  }

  if (isIn(NumberRangeFilterCriteria, filterCriteria)) {
    const parsedOperator = resolveOperatorOrThrow({
      symbol: operator,
      operatorMap: numberOperators,
    });

    if (value.includes('..')) {
      if (parsedOperator !== 'equals') {
        throw Error(`Operator ${operator} can not be used with the range syntax`);
      }

      const [min, max] = value.split('..').map(Number);

      return [
        {
          filterCriteria,
          operator: 'greaterThanOrEquals',
          value: min,
        },
        {
          filterCriteria,
          operator: 'smallerThanOrEquals',
          value: max,
        },
      ];
    } else {
      return [
        {
          filterCriteria,
          operator: parsedOperator,
          value: Number(value),
        },
      ];
    }
  }

  if (isIn(DateRangeFilterCriteria, filterCriteria)) {
    const splittedDateStr = value.split('-');

    if (splittedDateStr.length !== 3) {
      throw Error('Error parsing date string');
    }

    const [year, month, day] = splittedDateStr;

    const date = new Date(Number(year), Number(month) - 1, Number(day));

    const getDateOperator: () => NumberOperator = () => {
      if (normalizedKey == 'before') {
        return 'smallerThanOrEquals';
      }

      if (normalizedKey == 'after') {
        return 'greaterThanOrEquals';
      }

      if (normalizedKey === 'added' || normalizedKey === 'dateadded' || normalizedKey === 'date_added') {
        return resolveOperatorOrThrow({
          symbol: operator,
          operatorMap: numberOperators,
        });
      }

      // key == "date". This key can have any operator.
      // For example date<2020-03-03 or date:2020-07-03

      return resolveOperatorOrThrow({
        symbol: operator,
        operatorMap: numberOperators,
      });
    };

    return [
      {
        filterCriteria,
        operator: getDateOperator(),
        value: date,
      },
    ];
  } else if (isIn(MediaTypeFilterCriteria, filterCriteria)) {
    if (operator !== ':' && operator !== '=') {
      throw new Error(`Invalid operator for media type: ${operator}`);
    }

    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue !== 'video' && normalizedValue !== 'photo') {
      throw new Error(`Unsupported media type: ${value}`);
    }

    return [
      {
        filterCriteria,
        operator: 'equals',
        value: normalizedValue,
      },
    ];
  } else if (isIn(ListFilterCriteria, filterCriteria)) {
    if (filterCriteria === FilterCriteria.path) {
      throw new Error('Path filters can only be created from album selections');
    }
    const unquoted = _unquoteFilterValue(value);
    return [
      {
        filterCriteria,
        operator: 'contains',
        value: unquoted.split(','),
      },
    ];
  }

  throw new Error(`Unhandled filter criteria: ${FilterCriteria[filterCriteria]}`);
}

/** Strip wrapping quotes so `filename:"foo bar"` and `person:"Ana Lopez"` keep inner spaces. */
function _unquoteFilterValue(value: string): string {
  return value.startsWith('"') && value.endsWith('"') && value.length >= 2 ? value.slice(1, -1) : value;
}

function _serializeListFilterValue(values: unknown[]): string {
  const joined = values.map(_listFilterItemToString).filter(Boolean).join(',');
  return /[\s:]/.test(joined) ? `"${joined}"` : joined;
}

function _listFilterItemToString(entry: unknown): string {
  if (typeof entry === 'string') return entry;

  const record = entry as { name?: unknown; id?: unknown } | null;
  if (typeof record?.name === 'string' && record.name) return record.name;
  if (typeof record?.id === 'string') return record.id;

  return String(entry ?? '');
}
