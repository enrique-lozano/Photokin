import { IconGitMerge, IconHeart, IconHeartFilled, IconPencil, IconTrash } from '@tabler/icons-react';
import { EntityAction } from '@/components/entity-actions/entityAction.model';
import { toast } from '@/components/ui/toast';
import { TagsService } from '@/db/api/services/tags.service';
import { TagInClient } from '@/db/models/TagDTO';

/** Flips a tag's favorite flag, reporting a write failure to the user. */
export function toggleTagFavorite(tag: TagInClient): void {
  TagsService.setFavorite(tag.id, tag.isFavorite !== 1).catch((error) => toast.error(String(error)));
}

export interface TagActionHandlers {
  onRename: (tag: TagInClient) => void;
  onMerge: (tag: TagInClient) => void;
  onToggleFavorite: (tag: TagInClient) => void;
  onDelete: (tag: TagInClient) => void;
}

/**
 * The single source of truth for a tag's object verbs. Consumed by the tag
 * detail header (buttons + ⋮) and the tags sidebar right-click menu, so both
 * surfaces expose exactly the same actions.
 */
export function buildTagActions(tag: TagInClient, handlers: TagActionHandlers): EntityAction[] {
  const isFavorite = tag.isFavorite === 1;

  return [
    {
      id: 'rename',
      label: 'Edit tag…',
      buttonLabel: 'Edit tag',
      icon: <IconPencil size={16} className="text-muted-foreground" />,
      primary: true,
      onSelect: () => handlers.onRename(tag),
    },
    {
      id: 'merge',
      label: 'Merge…',
      icon: <IconGitMerge size={16} className="text-muted-foreground" />,
      primary: true,
      onSelect: () => handlers.onMerge(tag),
    },
    {
      id: 'favorite',
      label: isFavorite ? 'Remove from favorites' : 'Add to favorites',
      icon: isFavorite ? (
        <IconHeartFilled size={16} className="text-muted-foreground" />
      ) : (
        <IconHeart size={16} className="text-muted-foreground" />
      ),
      onSelect: () => handlers.onToggleFavorite(tag),
    },
    {
      id: 'delete',
      label: 'Delete tag',
      icon: <IconTrash size={16} />,
      destructive: true,
      onSelect: () => handlers.onDelete(tag),
    },
  ];
}
