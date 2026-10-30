import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { SplitButtonMenu } from '@/components/ui/split-button';
import type { BulkOutcome } from '@/system/bulkOutcome';
import clsx from 'clsx';
import { ReactNode } from 'react';

export type UnselectedFacesOption<T extends string> = {
  value: T;
  label: string;
  hint: string;
  icon: ReactNode;
  destructive?: boolean;
};

type UnselectedFacesMenuProps<T extends string> = {
  options: UnselectedFacesOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  unselectedCount: number;
};

/**
 * Chevron of a review modal's split button: picks what happens to the faces
 * left unselected, while the main button acts on the selection. Choosing only
 * sets the mode; the main button runs it.
 */
export function UnselectedFacesMenu<T extends string>({
  options,
  value,
  onValueChange,
  unselectedCount,
}: UnselectedFacesMenuProps<T>) {
  return (
    <SplitButtonMenu
      tooltip="Choose what happens to unselected faces"
      ariaLabel="Choose what happens to unselected faces"
      side="top"
      contentClassName="w-[22rem]"
    >
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        {unselectedCount === 0
          ? 'Faces you unselect'
          : unselectedCount === 1
            ? 'The unselected face'
            : `The ${unselectedCount.toLocaleString()} unselected faces`}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup value={value} onValueChange={(next) => onValueChange(next as T)}>
        {options.map((option) => (
          <DropdownMenuRadioItem
            key={option.value}
            value={option.value}
            className={clsx(
              'items-start gap-2',
              option.destructive && 'text-destructive-text focus:text-destructive-text',
            )}
          >
            <span className="mt-0.5 shrink-0">{option.icon}</span>
            <span className="flex flex-col">
              {option.label}
              <span className="text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </SplitButtonMenu>
  );
}

/** One undo and one tally for the selection step and the unselected step together. */
export function mergeOutcomes(outcomes: BulkOutcome[]): BulkOutcome {
  const undos = outcomes.map((outcome) => outcome.undo);
  return {
    total: outcomes.reduce((sum, outcome) => sum + outcome.total, 0),
    fileCount: outcomes.reduce((sum, outcome) => sum + outcome.fileCount, 0),
    fileFailures: outcomes.flatMap((outcome) => outcome.fileFailures),
    undo: undos.every(Boolean)
      ? async () => {
          for (const undo of [...undos].reverse()) await undo!();
        }
      : undefined,
  };
}
