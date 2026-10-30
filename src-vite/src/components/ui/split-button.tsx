import { IconChevronDown } from '@tabler/icons-react';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * A split button reads as a single control: a wide primary action on the left
 * and a trailing chevron that opens an action menu.
 *
 * It shares the `Button` visual language — same height, radius and the
 * `default` (filled) / `outline-primary` (outlined) palettes — so the People
 * "Scan" / "Identify" actions and any future split actions stay consistent.
 *
 * Per-variant hover and divider colors are exposed as the `--sb-hover` and
 * `--sb-divider` CSS variables on the container so the inner buttons can pick
 * them up without duplicating variant logic.
 */
const splitButtonVariants = cva(
  'inline-flex items-stretch overflow-hidden rounded-lg border text-sm font-medium',
  {
    variants: {
      variant: {
        default:
          'border-action-border bg-action text-action-foreground [--sb-divider:0_0%_100%/0.22] [--sb-hover:0_0%_0%/0.12]',
        destructive:
          'border-destructive bg-destructive text-destructive-foreground [--sb-divider:0_0%_100%/0.22] [--sb-hover:0_0%_0%/0.14]',
        'outline-primary':
          'border-primary/30 bg-primary/6 text-foreground [--sb-divider:var(--primary)/0.3] [--sb-hover:var(--primary)/0.12] [&_svg]:text-primary',
      },
      size: {
        default: 'h-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

interface SplitButtonContextValue {
  disabled?: boolean;
}

const SplitButtonContext = React.createContext<SplitButtonContextValue>({});

export interface SplitButtonProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'>, VariantProps<typeof splitButtonVariants> {
  disabled?: boolean;
}

const SplitButton = React.forwardRef<HTMLDivElement, SplitButtonProps>(
  ({ className, variant, size, disabled, children, ...props }, ref) => (
    <SplitButtonContext.Provider value={{ disabled }}>
      <div
        ref={ref}
        className={cn(splitButtonVariants({ variant, size }), disabled && 'opacity-55', className)}
        {...props}
      >
        {children}
      </div>
    </SplitButtonContext.Provider>
  ),
);
SplitButton.displayName = 'SplitButton';

const splitButtonInteractiveClasses =
  'transition-colors enabled:hover:bg-[hsl(var(--sb-hover))] disabled:cursor-default';

export interface SplitButtonMainProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip?: React.ReactNode;
  tooltipSide?: React.ComponentProps<typeof TooltipContent>['side'];
}

const SplitButtonMain = React.forwardRef<HTMLButtonElement, SplitButtonMainProps>(
  ({ className, tooltip, tooltipSide = 'bottom', disabled, children, ...props }, ref) => {
    const { disabled: groupDisabled } = React.useContext(SplitButtonContext);
    const isDisabled = disabled ?? groupDisabled;

    const button = (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        className={cn('inline-flex items-center gap-2 px-3.5', splitButtonInteractiveClasses, className)}
        {...props}
      >
        {children}
      </button>
    );

    if (!tooltip) return button;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
      </Tooltip>
    );
  },
);
SplitButtonMain.displayName = 'SplitButtonMain';

export interface SplitButtonMenuProps {
  /** Dropdown body containing secondary actions. */
  children?: React.ReactNode;
  tooltip?: React.ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  contentClassName?: string;
  side?: React.ComponentProps<typeof DropdownMenuContent>['side'];
  align?: React.ComponentProps<typeof DropdownMenuContent>['align'];
}

const SplitButtonMenu = React.forwardRef<HTMLButtonElement, SplitButtonMenuProps>(
  ({ children, tooltip, ariaLabel, disabled, contentClassName, side = 'bottom', align = 'end' }, ref) => {
    const { disabled: groupDisabled } = React.useContext(SplitButtonContext);
    const isDisabled = disabled ?? groupDisabled;

    const trigger = (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        disabled={isDisabled}
        className={cn(
          'inline-flex w-[30px] items-center justify-center border-l border-l-[hsl(var(--sb-divider))]',
          splitButtonInteractiveClasses,
        )}
      >
        <IconChevronDown size={15} />
      </button>
    );

    return (
      <DropdownMenu>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild disabled={isDisabled}>
                {trigger}
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{tooltip}</TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenuTrigger asChild disabled={isDisabled}>
            {trigger}
          </DropdownMenuTrigger>
        )}
        <DropdownMenuContent side={side} align={align} className={contentClassName}>
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);
SplitButtonMenu.displayName = 'SplitButtonMenu';

export { SplitButton, SplitButtonMain, SplitButtonMenu, splitButtonVariants };
