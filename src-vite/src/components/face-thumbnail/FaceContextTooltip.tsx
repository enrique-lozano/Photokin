import { FaceContextPreview } from '@/components/face-thumbnail/FaceContextPreview';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PersonRegion } from '@/db/models/PersonInfo';
import { ReactNode, useEffect, useRef, useState } from 'react';

/** Grace period before the context preview hides, so leaving the face isn't abrupt. */
const PREVIEW_HIDE_DELAY_MS = 140;

/**
 * The full-photo context preview, bound to a single face crop. Hoverable content
 * is disabled and the open state is controlled so the preview follows the crop
 * only: moving onto the floating photo never keeps it open, and it hides a beat
 * after the pointer leaves the crop. `suppressed` force-closes it (e.g. while the
 * reassign popover is open) so the two never overlap.
 */
export function FaceContextTooltip({
  region,
  suppressed = false,
  children,
}: {
  region: PersonRegion;
  suppressed?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  useEffect(() => clearHideTimer, []);

  useEffect(() => {
    if (suppressed) {
      clearHideTimer();
      setOpen(false);
    }
  }, [suppressed]);

  const handleOpenChange = (next: boolean) => {
    clearHideTimer();
    if (next && !suppressed) setOpen(true);
    else hideTimer.current = setTimeout(() => setOpen(false), PREVIEW_HIDE_DELAY_MS);
  };

  return (
    <Tooltip open={open && !suppressed} onOpenChange={handleOpenChange} disableHoverableContent>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        className="max-w-none border-none bg-transparent p-0 shadow-none"
      >
        <FaceContextPreview region={region} />
      </TooltipContent>
    </Tooltip>
  );
}
