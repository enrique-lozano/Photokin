import { IconSearch, IconX } from '@tabler/icons-react';
import { KeyboardEvent, ReactNode, useEffect, useState } from 'react';
import './searchBar.css';

type SearchBarProps = {
  queryFromUrl: string;
  onSubmit: (query: string) => void;
  /** Docked at the field's right edge, e.g. the library-filter button. */
  trailing?: ReactNode;
};

/**
 * Plain free-text search box. The query is matched semantically (CLIP) plus by
 * filename/person/tag on the results page; advanced structured filtering lives
 * in the filter drawer, so there is no inline parser here.
 */
export function SearchBar({ queryFromUrl, onSubmit, trailing }: SearchBarProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    setValue(queryFromUrl);
  }, [queryFromUrl]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit(value.trim());
    }
  };

  return (
    <div className="toolbar-searchbar">
      <div className={`toolbar-searchbar__input-shell ${isFocused ? 'is-focused' : ''}`}>
        <IconSearch size={16} className="toolbar-searchbar__search-icon" />
        <div className="toolbar-searchbar__chips">
          <input
            id="global-search-input"
            className="toolbar-searchbar__input"
            placeholder="Search photos, e.g. “dog on the beach”"
            title="Describe what you see, or type a file name, person or tag"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            aria-label="Global search"
          />
        </div>
        {value.length > 0 && (
          <button
            type="button"
            className="toolbar-searchbar__search-icon"
            onClick={() => {
              setValue('');
              onSubmit('');
            }}
            aria-label="Clear search"
          >
            <IconX size={16} />
          </button>
        )}
        {trailing}
      </div>
    </div>
  );
}
