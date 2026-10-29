import { ReactNode } from 'react';

/**
 * A single object verb for an entity (a tag, person, album, …). One list of
 * `EntityAction`s is the single source of truth for every surface that can act
 * on that entity, so the page-header buttons/⋮ menu and the sidebar right-click
 * menu never drift out of parity.
 *
 * Placement rules:
 * - Page header: `primary` actions render as outline buttons; the rest collapse
 *   into a standardized ⋮ overflow menu. In the compact (scrolled) header every
 *   action collapses into the ⋮.
 * - Sidebar right-click: every (non-hidden) action is shown, regardless of
 *   `primary`, so the context menu is always a superset of the header.
 */
export interface EntityAction {
  /** Stable identifier, also used as the React key. */
  id: string;
  label: string;
  /** Shorter label used when the action renders as a header button (falls back to `label`). */
  buttonLabel?: string;
  /** Optional secondary line for rich rows (e.g. album maintenance actions). */
  description?: string;
  icon?: ReactNode;
  /** Trailing adornment, e.g. a keyboard-shortcut hint. */
  trailing?: ReactNode;
  onSelect: () => void;
  /** Destructive actions render with danger styling and are grouped last. */
  destructive?: boolean;
  /** Surface as a header button (otherwise it lives in the ⋮ overflow menu). */
  primary?: boolean;
  disabled?: boolean;
  /** When true the action is omitted from every surface. */
  hidden?: boolean;
}

/** Drop hidden actions and keep authoring order (destructive grouping is handled at render time). */
export function visibleActions(actions: EntityAction[]): EntityAction[] {
  return actions.filter((action) => !action.hidden);
}
