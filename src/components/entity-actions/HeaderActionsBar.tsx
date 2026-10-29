import { ReactNode } from 'react';
import { IconDotsVertical } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EntityAction, visibleActions } from './entityAction.model';
import { renderDropdownActionItems } from './EntityActionItems';

/**
 * Standardized ⋮ overflow menu for page headers. Always uses the same trigger
 * (outline icon button + vertical dots), so every page reads identically.
 */
export function EntityOverflowMenu({ actions, menuLabel }: { actions: EntityAction[]; menuLabel: string }) {
  const items = visibleActions(actions);
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="outline" title={menuLabel} aria-label={menuLabel}>
          <IconDotsVertical size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{renderDropdownActionItems(items)}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The right-side action cluster for a page header: `primary` actions as outline
 * buttons, everything else in a single ⋮ overflow menu. `leading` renders
 * before the buttons (e.g. a "N suggestions" badge).
 *
 * Pass the SAME `actions` list to {@link EntityOverflowMenu} for the compact
 * (scrolled) header, so all verbs collapse into the ⋮ there.
 */
export function HeaderActionsBar({
  actions,
  menuLabel,
  leading,
}: {
  actions: EntityAction[];
  menuLabel: string;
  leading?: ReactNode;
}) {
  const items = visibleActions(actions);
  const primary = items.filter((action) => action.primary);
  const overflow = items.filter((action) => !action.primary);

  return (
    <>
      {leading}
      {primary.map((action) => (
        <Button
          key={action.id}
          variant="outline"
          disabled={action.disabled}
          onClick={action.onSelect}
          title={action.label}
        >
          {action.icon}
          {action.buttonLabel ?? action.label}
        </Button>
      ))}
      <EntityOverflowMenu actions={overflow} menuLabel={menuLabel} />
    </>
  );
}
