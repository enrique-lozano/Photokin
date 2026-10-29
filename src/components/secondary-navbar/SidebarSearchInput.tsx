import { inputVariants } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { IconSearch, IconX } from '@tabler/icons-react';
import { useRef } from 'react';

type SidebarSearchInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  className?: string;
};

/**
 * The filter field that opens the items zone of a list sidebar (People, Tags,
 * Albums, Places). It is deliberately quiet — the look lives in
 * `.sidebar-search-input`. A clear control appears once the field has text.
 */
export function SidebarSearchInput({
  value,
  onValueChange,
  placeholder,
  className,
}: SidebarSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasText = value.length > 0;

  return (
    <div className={cn('sidebar-search-input-wrap', className)}>
      <IconSearch size={18} className="sidebar-search-input__icon" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && hasText) {
            event.stopPropagation();
            onValueChange('');
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          inputVariants(),
          'sidebar-search-input focus-visible:ring-0 focus-visible:ring-offset-0',
          hasText && 'sidebar-search-input--filled',
        )}
      />
      {hasText && (
        <button
          type="button"
          aria-label="Clear filter"
          className="sidebar-search-input__clear"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onValueChange('');
            inputRef.current?.focus();
          }}
        >
          <IconX size={14} />
        </button>
      )}
    </div>
  );
}
