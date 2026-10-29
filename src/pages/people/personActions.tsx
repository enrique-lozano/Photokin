import { IconEdit, IconTrash, IconUser, IconUserOff } from '@tabler/icons-react';
import { EntityAction } from '@/components/entity-actions/entityAction.model';

export interface PersonActionHandlers {
  onEditDetails: () => void;
  onSetHidden: (hidden: boolean) => void;
  isHidden: boolean;
  onRemove: () => void;
}

/**
 * The single source of truth for a person's object verbs. Consumed by the
 * person detail header (button + ⋮) and the people sidebar right-click menu.
 */
export function buildPersonActions(handlers: PersonActionHandlers): EntityAction[] {
  return [
    {
      id: 'edit',
      label: 'Edit details',
      icon: <IconEdit size={16} className="text-muted-foreground" />,
      primary: true,
      onSelect: handlers.onEditDetails,
    },
    {
      id: 'visibility',
      label: handlers.isHidden ? 'Show person' : 'Hide person',
      icon: handlers.isHidden ? <IconUser size={16} /> : <IconUserOff size={16} />,
      onSelect: () => handlers.onSetHidden(!handlers.isHidden),
    },
    {
      id: 'remove',
      label: 'Remove person',
      icon: <IconTrash size={16} />,
      destructive: true,
      onSelect: handlers.onRemove,
    },
  ];
}
