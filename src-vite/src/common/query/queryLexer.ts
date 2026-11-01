export interface QuerySpan {
  start: number;
  end: number;
  text: string;
}

export interface QueryToken extends QuerySpan {
  quoted: boolean;
  complete: boolean;
  key?: QuerySpan;
  operator?: QuerySpan;
  value?: QuerySpan;
}

/** Split only outside quotes, retaining offsets for native input replacement. */
export function splitQuerySpans(input: string, separator: RegExp, offset = 0): QuerySpan[] {
  const spans: QuerySpan[] = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    if (quoted && input[i] === '\\' && /["\\]/.test(input[i + 1] ?? '')) {
      i++;
    } else if (input[i] === '"') {
      quoted = !quoted;
    } else if (!quoted && separator.test(input[i])) {
      spans.push({ start: offset + start, end: offset + i, text: input.slice(start, i) });
      start = i + 1;
    }
  }
  spans.push({ start: offset + start, end: offset + input.length, text: input.slice(start) });
  return spans;
}

export function lexQuery(input: string): QueryToken[] {
  return splitQuerySpans(input, /\s/)
    .filter((span) => span.text.length > 0)
    .map((span) => {
      let inQuote = false;
      for (let i = 0; i < span.text.length; i++) {
        if (inQuote && span.text[i] === '\\' && /["\\]/.test(span.text[i + 1] ?? '')) i++;
        else if (span.text[i] === '"') inQuote = !inQuote;
      }
      const token: QueryToken = { ...span, quoted: span.text.startsWith('"'), complete: !inQuote };
      if (token.quoted) return token;
      const match = /^([^!<>=~:"]+)(!=|>=|<=|~=|[><~=:])/.exec(span.text);
      if (!match) return token;
      const valueStart = span.start + match[0].length;
      return {
        ...token,
        key: { start: span.start, end: span.start + match[1].length, text: match[1] },
        operator: {
          start: span.start + match[1].length,
          end: valueStart,
          text: match[2],
        },
        value: { start: valueStart, end: span.end, text: input.slice(valueStart, span.end) },
      };
    });
}

export function decodeQueryValue(value: string): string {
  let quoted = false;
  let decoded = '';
  for (let i = 0; i < value.length; i++) {
    if (quoted && value[i] === '\\' && /["\\]/.test(value[i + 1] ?? '')) decoded += value[++i];
    else if (value[i] === '"') quoted = !quoted;
    else decoded += value[i];
  }
  return decoded;
}

export function quoteQueryValue(value: string): string {
  return /[\s,:!<>=~"\\]/.test(value) ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : value;
}
