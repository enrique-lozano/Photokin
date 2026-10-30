import { type ComponentType, type ReactNode } from 'react';
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from './context-menu';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from './dropdown-menu';

/**
 * Radix menu primitives behind a common shape, so a menu body can be written
 * once and rendered as either a right-click context menu or a click-triggered
 * dropdown.
 */
export interface MenuPrimitives {
  Item: ComponentType<{
    className?: string;
    children?: ReactNode;
    onSelect?: (event: Event) => void;
    disabled?: boolean;
    title?: string;
  }>;
  Separator: ComponentType<{ className?: string }>;
  Sub: ComponentType<{ children?: ReactNode }>;
  SubTrigger: ComponentType<{ className?: string; children?: ReactNode; disabled?: boolean; title?: string }>;
  SubContent: ComponentType<{ className?: string; children?: ReactNode }>;
}

export const CONTEXT_MENU_COMPONENTS: MenuPrimitives = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
};

export const DROPDOWN_MENU_COMPONENTS: MenuPrimitives = {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
};
