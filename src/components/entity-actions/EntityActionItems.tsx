import { Fragment, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ContextMenuLabel, ContextMenuSeparator } from '@/components/ui/context-menu';
import {
  CONTEXT_MENU_COMPONENTS,
  DROPDOWN_MENU_COMPONENTS,
  type MenuPrimitives,
} from '@/components/ui/menuPrimitives';
import { EntityAction, visibleActions } from './entityAction.model';
import './entityActions.css';

/** The inner layout of a single action row, shared by both menu surfaces. */
function EntityActionBody({ action }: { action: EntityAction }) {
  if (action.description) {
    return (
      <div className="entity-action">
        {action.icon && <span className="entity-action__icon">{action.icon}</span>}
        <span className="entity-action__text">
          <span className="entity-action__title">{action.label}</span>
          <span className="entity-action__desc">{action.description}</span>
        </span>
        {action.trailing && <span className="entity-action__trailing">{action.trailing}</span>}
      </div>
    );
  }

  return (
    <>
      {action.icon}
      <span>{action.label}</span>
      {action.trailing && <span className="entity-action__trailing-inline">{action.trailing}</span>}
    </>
  );
}

/** Insert a separator before the first destructive action in an already-visible list. */
function needsLeadingSeparator(action: EntityAction, previous: EntityAction | undefined): boolean {
  return Boolean(action.destructive && previous && !previous.destructive);
}

const dangerClass = 'text-destructive-text focus:text-destructive-text';

function renderActionItems(actions: EntityAction[], { Item, Separator }: MenuPrimitives): ReactNode {
  const items = visibleActions(actions);
  return items.map((action, index) => (
    <Fragment key={action.id}>
      {needsLeadingSeparator(action, items[index - 1]) && <Separator />}
      <Item
        disabled={action.disabled}
        className={cn(action.destructive && dangerClass)}
        onSelect={action.onSelect}
      >
        <EntityActionBody action={action} />
      </Item>
    </Fragment>
  ));
}

/** Render actions as `DropdownMenu` items (click-triggered ⋮ menus). */
export function renderDropdownActionItems(actions: EntityAction[]): ReactNode {
  return renderActionItems(actions, DROPDOWN_MENU_COMPONENTS);
}

/** Render actions as `ContextMenu` items (right-click menus), with an optional heading. */
export function EntityContextMenuContent({ label, actions }: { label?: ReactNode; actions: EntityAction[] }) {
  return (
    <>
      {label && (
        <>
          <ContextMenuLabel className="max-w-[240px] truncate">{label}</ContextMenuLabel>
          <ContextMenuSeparator />
        </>
      )}
      {renderActionItems(actions, CONTEXT_MENU_COMPONENTS)}
    </>
  );
}
