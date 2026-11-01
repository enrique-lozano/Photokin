import { QueryToken } from '@/common/query/queryLexer';
import { parseSearchBarInput } from '@/common/query/searchInput';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';
import { useRecentSearchesStore } from '@/stores/recentSearchesStore';
import {
  IconAdjustmentsHorizontal,
  IconAperture,
  IconBolt,
  IconCalendar,
  IconCalendarPlus,
  IconCamera,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconExposure,
  IconFile,
  IconFileDescription,
  IconFilter,
  IconFocusCentered,
  IconHeart,
  IconList,
  IconMapPin,
  IconMinus,
  IconPhoto,
  IconRuler,
  IconSearch,
  IconStar,
  IconSunHigh,
  IconTag,
  IconUsers,
  IconVideo,
  IconX,
} from '@tabler/icons-react';
import {
  Fragment,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SearchDiscovery, SearchExamplePlaceholder, useSearchAvailability } from './SearchDiscovery';
import {
  applyCompletion,
  completionContext,
  fieldHelp,
  operatorSuggestions,
  QuerySuggestion,
  recentSearchSuggestions,
  replaceTypedOperator,
} from './queryCompletion';
import './searchBar.css';
import { useQuerySuggestions } from './useQuerySuggestions';

type SearchBarProps = {
  queryFromUrl: string;
  onSubmit: (query: string) => void;
  trailing?: ReactNode;
};

export const FIELD_ICONS: Record<string, typeof IconSearch> = {
  type: IconPhoto,
  person: IconUsers,
  person_count: IconUsers,
  tag: IconTag,
  tag_count: IconTag,
  rating: IconStar,
  date: IconCalendar,
  after: IconCalendar,
  before: IconCalendar,
  year: IconCalendar,
  month: IconCalendar,
  day: IconCalendar,
  weekday: IconCalendar,
  added: IconCalendarPlus,
  filename: IconFile,
  description: IconFileDescription,
  size: IconFile,
  camera: IconCamera,
  lens: IconAperture,
  aperture: IconAperture,
  iso: IconCamera,
  focal: IconRuler,
  shutter: IconClock,
  whitebalance: IconSunHigh,
  flashvalue: IconBolt,
  exposureprogram: IconExposure,
  metering: IconFocusCentered,
  location: IconMapPin,
  has: IconCheck,
  no: IconMinus,
};

export function SearchSuggestionContent({ item, fieldKey }: { item: QuerySuggestion; fieldKey: string }) {
  const key = item.kind === 'field' ? item.text : fieldKey;
  const Icon =
    item.kind === 'recent'
      ? IconClock
      : item.kind === 'more'
        ? IconList
        : item.id === 'favorites'
          ? IconHeart
          : item.kind === 'operator'
            ? IconAdjustmentsHorizontal
            : item.text === 'video'
              ? IconVideo
              : item.kind === 'token' && item.text.startsWith('no:')
                ? IconMinus
                : item.kind === 'token' && item.text.startsWith('has:')
                  ? IconCheck
                  : (FIELD_ICONS[key] ?? IconFilter);
  return (
    <>
      <Icon size={16} stroke={1.75} aria-hidden="true" className="toolbar-searchbar__option-icon" />
      <span className="toolbar-searchbar__option-copy">
        <span className="toolbar-searchbar__option-label">{item.label}</span>
        {item.kind === 'value' && <span className="toolbar-searchbar__option-detail">{item.detail}</span>}
      </span>
      {item.kind === 'operator' && <span className="toolbar-searchbar__option-symbol">{item.text}</span>}
      {item.kind === 'more' && (
        <IconChevronRight size={14} aria-hidden="true" className="toolbar-searchbar__option-icon" />
      )}
    </>
  );
}

export function SearchQueryContent({ value, tokens }: { value: string; tokens: QueryToken[] }) {
  const parts: ReactNode[] = [];
  let start = 0;
  for (const token of tokens) {
    if (!token.value) continue;
    parts.push(value.slice(start, token.value.start));
    parts.push(
      <span key={token.value.start} className="toolbar-searchbar__filter-value">
        {token.value.text}
      </span>,
    );
    start = token.value.end;
  }
  parts.push(value.slice(start));
  return <>{parts}</>;
}

export function SearchBar({ queryFromUrl, onSubmit, trailing }: SearchBarProps) {
  const [value, setValue] = useState(queryFromUrl);
  const [selection, setSelection] = useState({ start: value.length, end: value.length });
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [more, setMore] = useState(false);
  const [compositionActive, setCompositionActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const pendingSelection = useRef<number | null>(null);
  const pendingHighlight = useRef(false);
  const availability = useSearchAvailability(focused);
  const showExamples = focused && !value && availability.ready;
  const context = useMemo(() => completionContext(value, selection.start, selection.end), [value, selection]);
  const suggestions = useQuerySuggestions(open && focused ? context : null, more);
  const recentQueries = useRecentSearchesStore((state) => state.queries);
  const removeRecent = useRecentSearchesStore((state) => state.remove);
  const clearRecent = useRecentSearchesStore((state) => state.clear);
  const recentItems = !more ? recentSearchSuggestions(recentQueries, value) : [];
  const items = [...recentItems, ...suggestions.items];
  const { notices, filterTokens } = useMemo(() => parseSearchBarInput(value), [value]);
  const showHighlight = filterTokens.length > 0 && !compositionActive;
  const help = context?.kind === 'value' ? fieldHelp(context.key) : null;
  const popupOpen =
    open && focused && (items.length > 0 || suggestions.dynamic || (!!context && context.kind !== 'field'));
  const suggestionKey = items.map((item) => item.id).join('\0');

  useEffect(() => {
    setHighlight(pendingHighlight.current && items.length ? 0 : -1);
    pendingHighlight.current = false;
  }, [suggestionKey]);

  useEffect(() => {
    setValue(queryFromUrl);
    setSelection({ start: queryFromUrl.length, end: queryFromUrl.length });
    setOpen(false);
    setHighlight(-1);
    setMore(false);
  }, [queryFromUrl]);

  useEffect(() => {
    const caret = pendingSelection.current;
    if (caret !== null) {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
      pendingSelection.current = null;
    }
  }, [value, selection]);

  useLayoutEffect(() => {
    if (highlightRef.current && inputRef.current)
      highlightRef.current.scrollLeft = inputRef.current.scrollLeft;
  }, [value, selection, showHighlight]);

  useEffect(() => {
    if (highlight >= 0)
      document.getElementById(`query-option-${highlight}`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const readSelection = (input: HTMLInputElement) => {
    const next = { start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 };
    if (next.start !== selection.start || next.end !== selection.end) {
      setSelection(next);
      setHighlight(-1);
    }
  };
  const edit = (next: string, caret: number, nextOpen: boolean) => {
    const input = inputRef.current;
    if (!input || composing.current) return;
    input.focus();
    if (input.value !== next) {
      let start = 0;
      let oldEnd = input.value.length;
      let newEnd = next.length;
      while (start < oldEnd && start < newEnd && input.value[start] === next[start]) start++;
      while (oldEnd > start && newEnd > start && input.value[oldEnd - 1] === next[newEnd - 1]) {
        oldEnd--;
        newEnd--;
      }
      input.setSelectionRange(start, oldEnd);
      // Chromium/WebKit's edit command preserves native undo; assigning value does not.
      if (!document.execCommand('insertText', false, next.slice(start, newEnd))) {
        toast.error('Could not edit the search. Please type your change instead.');
        return;
      }
    }
    pendingSelection.current = caret;
    setValue(next);
    setSelection({ start: caret, end: caret });
    setHighlight(-1);
    setMore(false);
    setOpen(nextOpen);
  };
  const accept = (suggestion: QuerySuggestion) => {
    if (composing.current) return;
    if (suggestion.kind === 'recent') {
      edit(suggestion.text, suggestion.text.length, false);
      return;
    }
    if (!context) return;
    if (suggestion.kind === 'more') {
      setMore(true);
      setHighlight(-1);
      return;
    }
    const result = applyCompletion(value, context, suggestion);
    edit(result.value, result.caret, result.open);
  };
  const submit = () => {
    if (composing.current) return;
    setOpen(false);
    setHighlight(-1);
    onSubmit(value.trim());
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (composing.current || event.nativeEvent.isComposing) return;
    if (!event.ctrlKey && !event.metaKey && !event.altKey && selection.start === selection.end) {
      const replacement = replaceTypedOperator(value, selection.start, event.key);
      if (replacement) {
        event.preventDefault();
        edit(replacement.value, replacement.caret, true);
        return;
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setHighlight(-1);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!context && !recentItems.length) return;
      event.preventDefault();
      setOpen(true);
      if (!popupOpen) pendingHighlight.current = true;
      if (items.length) {
        setHighlight((index) =>
          event.key === 'ArrowDown' ? Math.min(index + 1, items.length - 1) : Math.max(index - 1, 0),
        );
      }
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const item = popupOpen && highlight >= 0 ? items[highlight] : undefined;
      if (item) {
        event.preventDefault();
        accept(item);
      } else if (event.key === 'Tab' && !event.shiftKey && popupOpen && recentItems.length > 0) {
        event.preventDefault();
        popupRef.current
          ?.querySelector<HTMLButtonElement>('.toolbar-searchbar__recent-heading button')
          ?.focus();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    }
  };

  return (
    <Popover
      open={popupOpen}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setHighlight(-1);
      }}
    >
      <div className="toolbar-searchbar">
        <PopoverAnchor asChild>
          <div className={`toolbar-searchbar__input-shell ${focused ? 'is-focused' : ''}`}>
            <IconSearch size={16} className="toolbar-searchbar__search-icon" />
            <div className="toolbar-searchbar__field">
              <input
                ref={inputRef}
                id="global-search-input"
                className={`toolbar-searchbar__input${showHighlight ? ' has-highlight' : ''}`}
                placeholder={showExamples ? '' : 'Search photos or videos.'}
                title="Describe a photo, or choose a filter. Press Enter to search."
                value={value}
                role="combobox"
                aria-label="Global search"
                aria-autocomplete="list"
                aria-expanded={popupOpen}
                aria-controls={popupOpen ? 'query-suggestions' : undefined}
                aria-activedescendant={popupOpen && highlight >= 0 ? `query-option-${highlight}` : undefined}
                aria-describedby="query-editor-hint"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setHighlight(-1);
                  setValue(event.target.value);
                  readSelection(event.target);
                  setMore(false);
                  setOpen(!composing.current);
                }}
                onSelect={(event) => readSelection(event.currentTarget)}
                onScroll={(event) => {
                  if (highlightRef.current) highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
                }}
                onClick={() => setOpen(true)}
                onFocus={(event) => {
                  setFocused(true);
                  setHighlight(-1);
                  readSelection(event.target);
                  setOpen(true);
                }}
                onBlur={(event) => {
                  if (popupRef.current?.contains(event.relatedTarget)) return;
                  setFocused(false);
                  setOpen(false);
                  setHighlight(-1);
                }}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => {
                  composing.current = true;
                  setCompositionActive(true);
                  setOpen(false);
                }}
                onCompositionEnd={(event) => {
                  composing.current = false;
                  setCompositionActive(false);
                  readSelection(event.currentTarget);
                  setOpen(true);
                }}
              />
              {showHighlight && (
                <div ref={highlightRef} className="toolbar-searchbar__highlight" aria-hidden="true">
                  <SearchQueryContent value={value} tokens={filterTokens} />
                </div>
              )}
              {showExamples && <SearchExamplePlaceholder />}
            </div>
            <div className="toolbar-searchbar__controls">
              {value.length > 0 && (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="toolbar-searchbar__action"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => edit('', 0, true)}
                  aria-label="Clear search"
                >
                  <IconX size={16} />
                </Button>
              )}
              {trailing}
            </div>
          </div>
        </PopoverAnchor>
        <span id="query-editor-hint" className="sr-only">
          Describe a photo, or choose a filter. Press Enter to search.
          {value !== queryFromUrl ? ' Press Enter to apply.' : ''}
        </span>
        {focused && notices.length > 0 && !popupOpen && (
          <span className="toolbar-searchbar__notice" role="status">
            {notices[0]}
          </span>
        )}
      </div>
      <PopoverContent
        ref={popupRef}
        align="start"
        className="toolbar-searchbar__popup p-1 w-80 rounded-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget) || event.relatedTarget === inputRef.current)
            return;
          setFocused(false);
          setOpen(false);
          setHighlight(-1);
        }}
        onInteractOutside={(event) => {
          if (event.target instanceof Node && inputRef.current?.contains(event.target))
            event.preventDefault();
        }}
        onEscapeKeyDown={() => {
          setOpen(false);
          setHighlight(-1);
        }}
      >
        {context?.kind === 'field' && !context.query && !more && <SearchDiscovery {...availability} />}
        {recentItems.length > 0 && (
          <div className="toolbar-searchbar__recent-heading">
            <span>Recent searches</span>
            <Button
              variant="link"
              size="xs"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                clearRecent();
                inputRef.current?.focus();
              }}
            >
              Clear history
            </Button>
          </div>
        )}
        {(help || more) && (
          <div className="toolbar-searchbar__popup-heading" title={help?.[1]}>
            {help ? help[0] : 'All filters'}
            {help && <span>{help[1]}</span>}
          </div>
        )}
        {context?.kind === 'value' && (
          <div className="toolbar-searchbar__operators" aria-label="Available operators">
            {operatorSuggestions(context.key)
              .filter((item) => item.text !== '=' && item.text !== '~=')
              .map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant="ghost"
                  aria-pressed={
                    context.token?.operator?.text === item.text ||
                    (item.text === ':' && context.token?.operator?.text === '=') ||
                    (item.text === '~' && context.token?.operator?.text === '~=')
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (context.token?.operator) {
                      const result = applyCompletion(
                        value,
                        { ...context, span: context.token.operator },
                        item,
                      );
                      edit(result.value, result.caret, true);
                    }
                  }}
                >
                  {item.label} <span className="font-mono">{item.text}</span>
                </Button>
              ))}
          </div>
        )}
        {context?.kind === 'value' &&
          context.token?.operator &&
          !context.token.value?.text &&
          selection.start === selection.end &&
          selection.start === context.token.operator.end && (
            <div className="toolbar-searchbar__section-label">Type a new operator or a value</div>
          )}
        <div
          id="query-suggestions"
          role="listbox"
          aria-label="Search suggestions"
          className="toolbar-searchbar__options"
        >
          {items.map((item, index) => (
            <Fragment key={item.id}>
              {recentItems.length > 0 && index === recentItems.length && (
                <div className="toolbar-searchbar__section-label" role="presentation">
                  {context?.kind === 'value'
                    ? 'Values'
                    : context?.kind === 'operator'
                      ? 'Operators'
                      : 'Filters'}
                </div>
              )}
              <div className={item.kind === 'recent' ? 'toolbar-searchbar__recent-row' : undefined}>
                <div
                  id={`query-option-${index}`}
                  role="option"
                  aria-selected={index === highlight}
                  title={item.detail}
                  className={`toolbar-searchbar__option ${index === highlight ? 'is-active' : ''}`}
                  onMouseMove={() => setHighlight(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => accept(item)}
                >
                  <SearchSuggestionContent item={item} fieldKey={context?.key ?? ''} />
                </div>
                {item.kind === 'recent' && (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="toolbar-searchbar__remove-recent"
                    aria-label={`Remove recent search: ${item.text}`}
                    title="Remove recent search"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      removeRecent(item.text);
                      inputRef.current?.focus();
                    }}
                  >
                    <IconX size={14} />
                  </Button>
                )}
              </div>
            </Fragment>
          ))}
        </div>
        <div className="toolbar-searchbar__popup-status" role="status">
          {suggestions.loading ? (
            'Loading values...'
          ) : suggestions.error ? (
            <>
              Couldn&apos;t load values.{' '}
              <Button
                variant="link"
                size="sm"
                onMouseDown={(event) => event.preventDefault()}
                onClick={suggestions.retry}
              >
                Retry
              </Button>
            </>
          ) : suggestions.dynamic &&
            suggestions.items.filter((item) => item.kind === 'value').length === 0 ? (
            'No matching values. You can still type a value.'
          ) : null}
          {suggestions.truncated && 'Keep typing to narrow the list.'}
          {notices.length > 0 && <p>{notices[0]}</p>}
        </div>
        <div className="toolbar-searchbar__popup-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Navigate
          </span>
          <span>
            <kbd>↵</kbd> {highlight >= 0 ? 'Insert' : 'Search'}
          </span>
          <span>
            <kbd>esc</kbd> Close
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
