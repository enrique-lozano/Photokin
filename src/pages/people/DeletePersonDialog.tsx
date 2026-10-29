import { TagInClient } from '@/db/models/TagDTO';
import { DeleteTagsDialog } from '../tags/DeleteTagsDialog';

type DeletePersonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: TagInClient | null;
};

/** Person removal uses the same write-back path as deleting a person tag. */
export function DeletePersonDialog({ open, onOpenChange, person }: DeletePersonDialogProps) {
  return (
    <DeleteTagsDialog
      open={open}
      onOpenChange={onOpenChange}
      mode="single"
      tag={person}
      entityKind="person"
    />
  );
}
