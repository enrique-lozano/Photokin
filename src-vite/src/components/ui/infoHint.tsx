import { cn } from '@/lib/utils';
import { IconInfoCircle } from '@tabler/icons-react';
import { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

interface InfoHintProps {
  /** Explanation revealed on hover/focus. */
  children: ReactNode;
  /** Side the tooltip appears on. Defaults to `top`. */
  side?: TooltipSide;
  /** Icon size in px. Defaults to 14. */
  size?: number;
  /** Extra classes for the trigger button. */
  className?: string;
  /** Accessible label for the trigger. Defaults to "More information". */
  label?: string;
}

/**
 * Small "ⓘ" affordance: a muted info icon that reveals a longer explanation on
 * hover or keyboard focus. It is a regular tab stop, otherwise its explanation
 * would be reachable with a mouse only.
 */
export function InfoHint({
  children,
  side = 'top',
  size = 14,
  className,
  label = 'More information',
}: InfoHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(event) => event.preventDefault()}
          className={cn(
            'inline-flex shrink-0 cursor-help items-center justify-center text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-hidden',
            className,
          )}
        >
          <IconInfoCircle size={size} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side}>{children}</TooltipContent>
    </Tooltip>
  );
}
