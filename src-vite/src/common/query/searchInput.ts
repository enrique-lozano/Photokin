import { strToFilter } from './filters/FilterParser';
import { SearchFilter } from './filters/FilterTypes';
import { decodeQueryValue, lexQuery, QueryToken } from './queryLexer';
import { getFilterCriteria } from './searchKeywords';

export interface ParsedSearchInput {
  filters: SearchFilter[];
  freeText: string;
  /** Original non-filter tokens, for removing filters without changing text meaning. */
  textQuery: string;
  filterTokens: QueryToken[];
  notices: string[];
}

/** Only valid, explicit filters constrain results. Everything else is search text. */
export function parseSearchBarInput(input: string): ParsedSearchInput {
  const filters: SearchFilter[] = [];
  const filterTokens: QueryToken[] = [];
  const freeWords: string[] = [];
  const textTokens: string[] = [];
  const notices: string[] = [];

  for (const token of lexQuery(input)) {
    const known =
      token.key && (getFilterCriteria(token.key.text) !== undefined || /^(has|no)$/i.test(token.key.text));
    if (!token.quoted && known) {
      try {
        const parsed = strToFilter(token.text);
        if (parsed?.length) {
          filters.push(...parsed);
          filterTokens.push(token);
          continue;
        }
      } catch (error) {
        notices.push(
          `${token.text} is being searched as text, not used as a filter. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    textTokens.push(token.text);
    freeWords.push(token.quoted && token.complete ? decodeQueryValue(token.text) : token.text);
  }

  return { filters, freeText: freeWords.join(' '), textQuery: textTokens.join(' '), filterTokens, notices };
}
