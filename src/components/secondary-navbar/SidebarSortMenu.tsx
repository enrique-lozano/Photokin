import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconArrowsSort } from '@tabler/icons-react';
import { ReactNode } from 'react';

export type SidebarSortOption<T extends string> = { value: T; label: string };

/**
 * The compact "Most photos ▾" style sort control that rides on the right of a
 * sidebar section label (count · TITLE ·········· sort). Kept generic so every
 * list sidebar (People, Tags, Albums) drives it with its own option set.
 */
export function SidebarSortMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel = 'Sort list',
  trigger,
}: {
  value: T;
  options: SidebarSortOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  /** Replaces the compact sidebar trigger, e.g. with a page toolbar button. */
  trigger?: ReactNode;
}) {
  const active = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="sidebar-sort hover:text-secondary-navbar-foreground"
            aria-label={ariaLabel}
            title={ariaLabel}
          >
            <IconArrowsSort size={14} />
            <span className="sidebar-sort__label">{active?.label ?? 'Sort'}</span>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
