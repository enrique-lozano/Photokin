import * as React from 'react';

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { IconX } from '@tabler/icons-react';

export interface SearchComboboxOption {
  value: string;
  /** Defaults to `value`; also what the search matches. */
  label?: string;
  /** Identifies the item at a glance: an icon, a face, a color dot… Shown in the list and on chips. */
  leading?: React.ReactNode;
  /** Trailing muted text, e.g. a photo count. */
  hint?: React.ReactNode;
}

interface BaseProps {
  options: readonly (string | SearchComboboxOption)[];
  placeholder?: string;
  emptyText?: string;
  /** Offer the typed text as a value even when no option matches it. */
  allowCustomValue?: boolean;
  /** Max rows rendered at once (keeps long lists snappy). */
  limit?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
}

interface SingleProps extends BaseProps {
  multiple?: false;
  /** `''` means nothing selected. */
  value: string;
  onValueChange: (value: string) => void;
}

interface MultipleProps extends BaseProps {
  multiple: true;
  value: string[];
  onValueChange: (value: string[]) => void;
}

export type SearchComboboxProps = SingleProps | MultipleProps;

/** Picks shown as chips before the rest collapse into "+N more". */
const MAX_VISIBLE_CHIPS = 8;

const toOption = (option: string | SearchComboboxOption): SearchComboboxOption =>
  typeof option === 'string' ? { value: option } : option;

/**
 * The app's one "pick from a long list, with search" control, built on the
 * shadcn (Base UI) combobox. Single mode is an input with a dropdown; multiple
 * mode shows the picks as removable chips in front of the search field.
 */
export function SearchCombobox(props: SearchComboboxProps) {
  const {
    options,
    placeholder = 'Search…',
    emptyText = 'No results found.',
    allowCustomValue = false,
    limit = 100,
    disabled,
    id,
    className,
  } = props;
  const anchor = useComboboxAnchor();
  const [query, setQuery] = React.useState('');
  const [showAllChips, setShowAllChips] = React.useState(false);
  // Inside a modal (e.g. the filter drawer) the popup must render within the
  // dialog: outside it, Radix's modal layer blocks pointer and wheel events.
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const findContainer = React.useCallback((node: HTMLElement | null) => {
    setContainer(node?.closest<HTMLElement>('[role="dialog"]') ?? null);
  }, []);

  const byValue = React.useMemo(
    () => new Map(options.map((o) => [toOption(o).value, toOption(o)])),
    [options],
  );
  const labelOf = React.useCallback((value: string) => byValue.get(value)?.label ?? value, [byValue]);

  const selected = props.multiple ? props.value : props.value ? [props.value] : [];
  const trimmed = query.trim();

  // Selected values stay in the list even when they are not (or no longer) options.
  const items = React.useMemo(() => {
    const values = [...byValue.keys()];
    for (const value of selected) if (!byValue.has(value)) values.unshift(value);
    const typed =
      allowCustomValue && trimmed && !values.some((v) => labelOf(v).toLowerCase() === trimmed.toLowerCase());
    return typed ? [trimmed, ...values] : values;
  }, [byValue, labelOf, allowCustomValue, trimmed, selected.join('\u0000')]);

  const list = (
    <ComboboxContent anchor={props.multiple ? anchor : undefined} container={container ?? undefined}>
      <ComboboxEmpty>{emptyText}</ComboboxEmpty>
      <ComboboxList>
        {(value: string) => {
          const option = byValue.get(value);
          const isTyped = allowCustomValue && value === trimmed && !option;
          return (
            <ComboboxItem key={value} value={value}>
              {option?.leading}
              <span className="min-w-0 flex-1 truncate">{isTyped ? `Use “${value}”` : labelOf(value)}</span>
              {option?.hint !== undefined && (
                <span className="text-xs tabular-nums text-muted-foreground">{option.hint}</span>
              )}
            </ComboboxItem>
          );
        }}
      </ComboboxList>
    </ComboboxContent>
  );

  if (props.multiple) {
    const hiddenCount = showAllChips ? 0 : Math.max(0, props.value.length - MAX_VISIBLE_CHIPS);
    const shownValues = hiddenCount > 0 ? props.value.slice(0, MAX_VISIBLE_CHIPS) : props.value;
    const canCollapse = showAllChips && props.value.length > MAX_VISIBLE_CHIPS;
    const onMultipleChange = props.onValueChange;

    return (
      <div ref={findContainer} className="contents">
        <Combobox
          multiple
          items={items}
          value={props.value}
          onValueChange={(value: string[]) => props.onValueChange(value)}
          inputValue={query}
          onInputValueChange={setQuery}
          itemToStringLabel={labelOf}
          limit={limit}
          disabled={disabled}
          autoHighlight
        >
          <ComboboxChips
            ref={anchor}
            className={cn('w-full', canCollapse && 'max-h-32 overflow-y-auto', className)}
          >
            {shownValues.map((value) => (
              <ComboboxChip key={value} title={labelOf(value)}>
                <span className="flex shrink-0">{byValue.get(value)?.leading}</span>
                <span className="min-w-0 truncate">{labelOf(value)}</span>
              </ComboboxChip>
            ))}
            {(hiddenCount > 0 || canCollapse) && (
              <button
                type="button"
                className="h-5.5 shrink-0 rounded-sm px-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setShowAllChips(hiddenCount > 0)}
              >
                {hiddenCount > 0 ? `+${hiddenCount.toLocaleString()} more` : 'Show less'}
              </button>
            )}
            <ComboboxChipsInput id={id} placeholder={props.value.length ? '' : placeholder} />
            {props.value.length > 1 && (
              <button
                type="button"
                className="ml-auto flex size-5.5 shrink-0 items-center justify-center self-start rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Clear all ${props.value.length.toLocaleString()}`}
                title={`Clear all ${props.value.length.toLocaleString()}`}
                onClick={() => {
                  setShowAllChips(false);
                  onMultipleChange([]);
                }}
              >
                <IconX className="size-3.5" />
              </button>
            )}
          </ComboboxChips>
          {list}
        </Combobox>
      </div>
    );
  }

  return (
    <div ref={findContainer} className="contents">
      <Combobox
        items={items}
        value={props.value || null}
        onValueChange={(value: string | null) => props.onValueChange(value ?? '')}
        onInputValueChange={setQuery}
        itemToStringLabel={labelOf}
        limit={limit}
        disabled={disabled}
        autoHighlight
      >
        <ComboboxInput
          id={id}
          placeholder={placeholder}
          showClear={!!props.value}
          className={cn('w-full', className)}
        />
        {list}
      </Combobox>
    </div>
  );
}
