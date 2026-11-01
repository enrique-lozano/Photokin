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
import { decodeQueryValue, lexQuery, quoteQueryValue, splitQuerySpans } from '../queryLexer';

export function filterToString(filter: SearchFilter): string {
  const { filterCriteria, value } = filter;
  let valueStr = '';
  let keywordStr = '';
  let operatorStr = '';

  if (isIn(TextFilterCriteria, filterCriteria)) {
    valueStr = quoteQueryValue(value as string);
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
  const tokens = lexQuery(filterStr);
  const token = tokens[0];
  if (!token?.key || !token.operator || !token.value || token.quoted) {
    return undefined;
  }
  if (tokens.length !== 1 || !token.complete) {
    throw Error('Use closed quotes around values with spaces.');
  }
  const key = token.key.text;
  const operator = token.operator.text;
  const rawValue = token.value.text;
  const value = decodeQueryValue(rawValue);
  if (!value.trim()) throw Error('Enter a value after the operator.');
  const normalizedKey = key.toLowerCase();
  if (normalizedKey === 'has' || normalizedKey === 'no') {
    if (![':', '='].includes(operator) || !['tag', 'person'].includes(value.toLowerCase())) {
      throw Error('Use has:tag, no:tag, has:person or no:person.');
    }
    return [
      {
        filterCriteria:
          value.toLowerCase() === 'tag' ? FilterCriteria.tag_count : FilterCriteria.person_count,
        operator: normalizedKey === 'has' ? 'greaterThan' : 'equals',
        value: 0,
      },
    ];
  }
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
        value,
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

      const parts = value.split('..');
      const [min, max] = parts.map(Number);
      if (
        parts.length !== 2 ||
        parts.some((part) => !part.trim()) ||
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        min > max
      ) {
        throw Error('Enter a valid range, with the smaller number first.');
      }

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
      if (!Number.isFinite(Number(value))) throw Error('Enter a finite number.');
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Use YYYY-MM-DD.');
    const splittedDateStr = value.split('-');

    const [year, month, day] = splittedDateStr;

    const date = new Date(0);
    date.setHours(0, 0, 0, 0);
    date.setFullYear(Number(year), Number(month) - 1, Number(day));
    if (
      date.getFullYear() !== Number(year) ||
      date.getMonth() !== Number(month) - 1 ||
      date.getDate() !== Number(day)
    )
      throw Error('Enter a valid calendar date.');
    resolveOperatorOrThrow({ symbol: operator, operatorMap: numberOperators });

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
    if (![':', '='].includes(operator)) throw Error('Use : or = for people and tags.');
    const members = splitQuerySpans(rawValue, /,/).map((span) => decodeQueryValue(span.text));
    if (members.some((member) => !member.trim())) throw Error('Enter a name for each list member.');
    return [
      {
        filterCriteria,
        operator: 'contains',
        value: members,
      },
    ];
  }

  throw new Error(`Unhandled filter criteria: ${FilterCriteria[filterCriteria]}`);
}

function _serializeListFilterValue(values: unknown[]): string {
  return values.map(_listFilterItemToString).filter(Boolean).map(quoteQueryValue).join(',');
}

function _listFilterItemToString(entry: unknown): string {
  if (typeof entry === 'string') return entry;

  const record = entry as { name?: unknown; id?: unknown } | null;
  if (typeof record?.name === 'string' && record.name) return record.name;
  if (typeof record?.id === 'string') return record.id;

  return String(entry ?? '');
}
