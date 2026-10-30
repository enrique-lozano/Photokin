import { strToFilter } from './filters/FilterParser';
import { SearchFilter } from './filters/FilterTypes';
import { findSearchIntent, SearchIntent } from './searchIntents';

/**
 * What the search bar text means, split by how confident we are about it.
 *
 * The split exists because the two halves are answered by different engines:
 * structured filters narrow the candidate set in SQL, while {@link freeText} is
 * ranked semantically (CLIP). A query made only of `key:value` tokens therefore
 * never reaches the semantic pass.
 */
export interface ParsedSearchInput {
  /** Filters from explicit `key:value` tokens. Never guessed. */
  filters: SearchFilter[];
  /** Intents inferred from bare words such as "videos". */
  intents: SearchIntent[];
  /** The words the semantic pass should rank on. */
  freeText: string;
  /**
   * Everything the user typed except the explicit `key:value` tokens, including
   * the words consumed as intents. Used to retry semantically when the filters
   * match nothing, so a guess never leaves the user on an empty page.
   */
  fallbackText: string;
}

interface Token {
  text: string;
  /**
   * The token is a quoted phrase, so it is always literal text: no keyword and
   * no intent lookup. Only a quote that *opens* the token counts, which keeps
   * `person:"Ana Lopez"` a keyword while `"videos"` escapes the intent.
   */
  quoted: boolean;
}

/**
 * Split on whitespace, keeping double-quoted spans together as one token and
 * dropping the quotes themselves.
 */
function _tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let text = '';
  let quoted = false;
  let inQuote = false;

  const push = () => {
    if (text) tokens.push({ text, quoted });
    text = '';
    quoted = false;
  };

  for (const char of input) {
    if (char === '"') {
      inQuote = !inQuote;
      if (inQuote && !text) quoted = true;
    } else if (!inQuote && /\s/.test(char)) {
      push();
    } else {
      text += char;
    }
  }
  push();

  return tokens;
}

/**
 * Parse what the user typed in the search bar.
 *
 * Each token is resolved by decreasing confidence: a quoted span is literal
 * text, a token whose key is a known keyword (`rating>4`, `person:"Ana"`)
 * becomes a filter, a bare word matching the intent vocabulary ("videos")
 * becomes a guessed filter, and anything left over is free text. Tokens that
 * look like keywords but are not (`foo:bar`, or a filename with a colon) fall
 * back to free text rather than failing the whole query.
 */
export function parseSearchBarInput(input: string): ParsedSearchInput {
  const filters: SearchFilter[] = [];
  const intents: SearchIntent[] = [];
  const freeWords: string[] = [];
  const fallbackWords: string[] = [];

  for (const token of _tokenize(input)) {
    if (!token.quoted) {
      let parsed: SearchFilter[] | undefined;
      try {
        parsed = strToFilter(token.text);
      } catch {
        // Unknown keyword or unparseable value: treat it as plain text.
      }

      if (parsed?.length) {
        filters.push(...parsed);
        continue;
      }

      const intent = findSearchIntent(token.text);
      if (intent) {
        if (!intents.some((entry) => entry.id === intent.id)) intents.push(intent);
        fallbackWords.push(token.text);
        continue;
      }
    }

    freeWords.push(token.text);
    fallbackWords.push(token.text);
  }

  return {
    filters,
    intents,
    freeText: freeWords.join(' '),
    fallbackText: fallbackWords.join(' '),
  };
}

/** Every filter the input implies, explicit tokens and guessed intents alike. */
export function parsedSearchFilters(parsed: ParsedSearchInput): SearchFilter[] {
  return [...parsed.filters, ...parsed.intents.flatMap((intent) => intent.filters)];
}
