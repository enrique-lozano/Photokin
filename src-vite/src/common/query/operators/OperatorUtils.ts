export function operatorToString<T extends string | number>(params: {
  operator: T;
  operatorMap: Record<T, string | string[]>;
}) {
  return Array.isArray(params.operatorMap[params.operator])
    ? params.operatorMap[params.operator][0]
    : (params.operatorMap[params.operator] as string);
}

function _resolveOperatorOrNull<T extends string | number>(params: {
  symbol: string;
  operatorMap: Record<T, string | string[]>;
}): T | null {
  for (const [operator, allowedSymbols] of Object.entries(params.operatorMap)) {
    if (Array.isArray(allowedSymbols) && allowedSymbols.includes(params.symbol)) {
      return operator as T;
    }

    if ((allowedSymbols as string) == params.symbol) {
      return operator as T;
    }
  }

  return null;
}

export function resolveOperatorOrThrow<T extends string | number>(params: {
  symbol: string;
  operatorMap: Record<T, string | string[]>;
}): T {
  const toReturn = _resolveOperatorOrNull(params);

  if (!toReturn) {
    throw Error(`Operator ${params.symbol} can not be parsed`);
  }

  return toReturn;
}
