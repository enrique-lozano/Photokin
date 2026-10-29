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
import { TagsService } from '@/db/api/services/tags.service';
import { TagInClient } from '@/db/models/TagDTO';
import { ProcessKind } from '@/stores/processStore';
import { trackProcess } from '@/system/processTracker';
import { IconAlertTriangle, IconHierarchy } from '@tabler/icons-react';
import { useState } from 'react';
import { TagWriteBackNote } from './TagWriteBackNote';

interface MoveTagDialogProps {
  source: TagInClient | null;
  target: TagInClient | null;
  error: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MoveTagDialog({ source, target, error, open, onOpenChange }: MoveTagDialogProps) {
  const [isMoving, setIsMoving] = useState(false);
  const destination = target ? `"${target.fullPath}"` : 'the top level';

  const handleConfirm = async () => {
    if (!source || error) return;
    setIsMoving(true);

    try {
      await trackProcess(
        {
          kind: ProcessKind.Generic,
          title: `Moving tag · ${source.name}`,
          progress: 0,
          successMessage: `Moved "${source.name}" into ${destination}`,
          getWarnings: (result: { warnings: string[] }) => result.warnings,
        },
        (reporter) =>
          TagsService.move(source.id, target?.id ?? null, (processed, total) =>
            reporter.setProgress(processed, total),
          ),
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
            Move tag &quot;{source?.name ?? ''}&quot; into {destination}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This changes the tag&apos;s full path. Every tag nested below it moves with it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogBody className="flex flex-col gap-3">
          {error && !isMoving && (
            <Banner variant="warning" icon={<IconAlertTriangle size={18} />}>
              {error}
            </Banner>
          )}
          <Banner icon={<IconHierarchy size={18} />}>
            <strong>{source?.fullPath ?? ''}</strong> will become{' '}
            <strong>{target ? `${target.fullPath}/${source?.name ?? ''}` : (source?.name ?? '')}</strong>.
          </Banner>
          <TagWriteBackNote />
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
            Move tag
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
