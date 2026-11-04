import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SearchBar, SearchQueryContent, SearchSuggestionContent } from './SearchBar';
import { FIELD_ICONS } from '@/components/page-content/SearchFilterIcon';
import { parseSearchBarInput } from '@/common/query/searchInput';
import { SEARCH_KEYWORDS } from '@/common/query/searchKeywords';
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('./SearchDiscovery', () => ({
  useSearchAvailability: () => ({ ready: false, loading: true, error: null, retry: vi.fn() }),
  SearchDiscovery: () => null,
  SearchExamplePlaceholder: () => null,
}));

vi.mock('./useQuerySuggestions', () => ({
  useQuerySuggestions: () => ({
    items: [],
    dynamic: false,
    loading: false,
    error: null,
    truncated: false,
    retry: vi.fn(),
  }),
}));

describe('query editor presentation', () => {
  it('keeps a native labeled combobox without a submit or empty clear button', () => {
    const markup = renderToStaticMarkup(<SearchBar queryFromUrl="" onSubmit={vi.fn()} />);
    expect(markup).toContain('<input');
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-autocomplete="list"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('aria-label="Search"');
    expect(markup).not.toContain('aria-label="Clear search"');
    expect(markup).toContain('Press Enter to search.');
    expect(markup).toContain('Search photos or videos.');
    expect(markup).not.toContain('contenteditable');
    expect(markup).not.toContain('aria-activedescendant');
  });

  it('initializes from the submitted query without a blank first render', () => {
    const markup = renderToStaticMarkup(
      <SearchBar queryFromUrl={'person:"Ana Lopez" beach'} onSubmit={vi.fn()} />,
    );
    expect(markup).toContain('value="person:&quot;Ana Lopez&quot; beach"');
    expect(markup).toContain('aria-label="Clear search"');
    expect(markup).toContain('has-highlight');
    expect(markup).toContain('class="toolbar-searchbar__highlight" aria-hidden="true"');
    expect(markup).toContain('class="toolbar-searchbar__filter-value">&quot;Ana Lopez&quot;</span>');
  });

  it('highlights only valid filter values, preserving exact query text and spacing', () => {
    const value = '  beach person:"Ana Lopez"  rating>=4 tag:Travel,Family has:person ';
    const markup = renderToStaticMarkup(
      <SearchQueryContent value={value} tokens={parseSearchBarInput(value).filterTokens} />,
    );
    expect(markup).toBe(
      '  beach person:<span class="toolbar-searchbar__filter-value">&quot;Ana Lopez&quot;</span>  rating&gt;=<span class="toolbar-searchbar__filter-value">4</span> tag:<span class="toolbar-searchbar__filter-value">Travel,Family</span> has:<span class="toolbar-searchbar__filter-value">person</span> ',
    );
  });

  it('does not imply that unknown, invalid, unfinished or quoted filters constrain results', () => {
    const value = 'unknown:Ana rating:abc person: person:"Ana "rating:4"';
    const markup = renderToStaticMarkup(<SearchBar queryFromUrl={value} onSubmit={vi.fn()} />);
    expect(markup).not.toContain('has-highlight');
    expect(markup).not.toContain('class="toolbar-searchbar__highlight"');
  });

  it('escapes filter values as text rather than rendering query markup', () => {
    const value = 'description:"<img src=x>"';
    const markup = renderToStaticMarkup(
      <SearchQueryContent value={value} tokens={parseSearchBarInput(value).filterTokens} />,
    );
    expect(markup).toContain('&lt;img src=x&gt;');
    expect(markup).not.toContain('<img');
  });

  it('preserves the separate library filter control', () => {
    const markup = renderToStaticMarkup(
      <SearchBar queryFromUrl="" onSubmit={vi.fn()} trailing={<button>Library filters</button>} />,
    );
    expect(markup).toContain('Library filters');
  });

  it('renders compact icon-led filter rows without verbose secondary text', () => {
    const markup = renderToStaticMarkup(
      <SearchSuggestionContent
        fieldKey=""
        item={{
          id: 'person',
          kind: 'field',
          text: 'person',
          label: 'Person',
          detail: 'person: - Confirmed, named people',
        }}
      />,
    );
    expect(markup).toContain('<svg');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('Person');
    expect(markup).not.toContain('Confirmed, named people');
    expect(markup).not.toContain('option-detail');
  });

  it('keeps value detail visible with a field icon', () => {
    const markup = renderToStaticMarkup(
      <SearchSuggestionContent
        fieldKey="person"
        item={{
          id: 'ana',
          kind: 'value',
          text: 'Family/Ana',
          label: 'Ana',
          detail: 'Family/Ana',
        }}
      />,
    );
    expect(markup).toContain('<svg');
    expect(markup).toContain('option-detail');
    expect(markup).toContain('Family/Ana');
  });

  it('uses a compact clock-led row for recent queries', () => {
    const markup = renderToStaticMarkup(
      <SearchSuggestionContent
        fieldKey=""
        item={{ id: 'recent:beach', kind: 'recent', label: 'beach', text: 'beach', detail: 'beach' }}
      />,
    );
    expect(markup).toContain('tabler-icon-clock');
    expect(markup).toContain('beach');
    expect(markup).not.toContain('option-detail');
  });
});

describe('FIELD_ICONS', () => {
  it('has a dedicated icon for every search keyword', () => {
    expect(SEARCH_KEYWORDS.filter(({ key }) => !FIELD_ICONS[key]).map(({ key }) => key)).toEqual([]);
  });
});
