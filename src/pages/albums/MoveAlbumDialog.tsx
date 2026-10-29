import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { AlbumsService } from '@/db/api/services/albums.service';
import { AlbumInClient } from '@/db/models/AlbumDTO';
import { ProcessKind } from '@/stores/processStore';
import { trackProcess } from '@/system/processTracker';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';

interface MoveAlbumDialogProps {
  source: AlbumInClient | null;
  target: AlbumInClient | null;
  error: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MoveAlbumDialog({ source, target, error, open, onOpenChange }: MoveAlbumDialogProps) {
  const [isMoving, setIsMoving] = useState(false);
  const rootName = source?.rootPath.split(/[/\\]/).filter(Boolean).at(-1) ?? 'library';
  const targetIsRoot = !target || target.isAtTheRootLevel;
  const destination = targetIsRoot ? `the top level of "${rootName}"` : `"${target.fullPath}"`;

  const handleConfirm = async () => {
    if (!source || error) return;
    setIsMoving(true);

    try {
      await trackProcess(
        {
          kind: ProcessKind.Generic,
          title: `Moving album · ${source.name}`,
          successMessage: `Moved "${source.name}" into ${destination}`,
        },
        () => AlbumsService.move(source, target),
      );
      onOpenChange(false);
    } catch {
      // trackProcess already surfaced the failure.
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(value) => !isMoving && onOpenChange(value)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Move album &quot;{source?.name ?? ''}&quot; into {destination}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This reorganizes the real folder on disk, not only the Photokin sidebar.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogBody className="flex flex-col gap-3">
          {error && !isMoving && (
            <Banner variant="warning" icon={<IconAlertTriangle size={18} />}>
              {error}
            </Banner>
          )}
          <Banner variant="warning" icon={<IconAlertTriangle size={18} />}>
            The folder, all nested folders, and every file inside will move. Links to their old locations in
            other apps may stop working.
          </Banner>
          <p className="text-xs text-muted-foreground">
            Photokin updates its catalog paths, but does not rewrite photo or video metadata during this move.
          </p>
        </AlertDialogBody>

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMoving}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            isLoading={isMoving}
            disabled={!source || Boolean(error)}
          >
            Move album
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
