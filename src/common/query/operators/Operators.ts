export const NumberOperators = [
  'notEquals',
  'equals',
  'smallerThanOrEquals',
  'smallerThan',
  'greaterThanOrEquals',
  'greaterThan',
] as const;
export type NumberOperator = (typeof NumberOperators)[number];

export const StringOperators = ['equals', 'contains'] as const;
export type StringOperator = (typeof StringOperators)[number];

export const ArrayOperators = ['contains'] as const;
export type ArrayOperator = (typeof ArrayOperators)[number];

export function numberOperatorToDBOperator(operator: NumberOperator) {
  switch (operator) {
    case 'notEquals':
      return '!=';
    case 'equals':
      return '=';
    case 'greaterThan':
      return '>';
    case 'smallerThan':
      return '<';
    case 'greaterThanOrEquals':
      return '>=';
    case 'smallerThanOrEquals':
      return '<=';
  }
}

export const numberOperators: Record<NumberOperator, string | string[]> = {
  greaterThan: '>',
  greaterThanOrEquals: '>=',
  smallerThan: '<',
  smallerThanOrEquals: '<=',
  equals: ['=', ':'],
  notEquals: '!=',
};

export const stringOperators: Record<StringOperator, string | string[]> = {
  equals: numberOperators.equals,
  contains: ['~', '~='],
};
