import { Slot } from '@radix-ui/react-slot';
import { IconLoader2 } from '@tabler/icons-react';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The shared visual language for every button in the app. The geometry
 * (36px height, 8px radius, 14px horizontal padding) and the `default`
 * (filled) / `outline-primary` (outlined) variants are modeled on the
 * People page "Scan" and "Identify" actions so all buttons read as one set.
 */
const buttonVariants = cva(
  'relative inline-flex items-center gap-2 justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors duration-150 ease-out motion-reduce:transition-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border border-action-border bg-action text-action-foreground hover:bg-action-hover',
        'primary-light': 'bg-primary/10 text-primary hover:bg-primary/20',
        navbar:
          'bg-main-navbar-foreground/8 text-main-navbar-foreground hover:bg-main-navbar-foreground/25 active:bg-main-navbar-foreground/30 data-[state=open]:bg-main-navbar-foreground/25 focus-visible:ring-main-navbar-foreground',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-[color-mix(in_srgb,var(--color-destructive),black_12%)]',
        outline:
          'border border-foreground/16 bg-foreground/4 text-foreground hover:bg-foreground/8 hover:text-foreground',
        'outline-primary':
          'border border-primary/30 bg-primary/6 text-foreground hover:bg-primary/12 [&_svg]:text-primary',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-6 gap-1 rounded-md px-2 text-xs',
        sm: 'h-8 gap-1.5 px-3',
        default: 'h-9 px-3.5 py-2',
        lg: 'h-10 px-6',
        'icon-xs': 'size-6 rounded-md',
        'icon-sm': 'h-8 w-8',
        icon: 'h-9 w-9',
        'icon-lg': 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Shows a leading spinner and disables the button while a background action
   * runs, so it can't be triggered again until the action settles.
   */
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    // `asChild` renders through Radix's Slot, which requires a single child, so
    // the spinner is only injected for plain buttons.
    const content =
      isLoading && !asChild ? (
        <>
          <span className="inline-flex items-center justify-center gap-[inherit] opacity-0">{children}</span>
          <IconLoader2
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 motion-safe:animate-spin"
            size={16}
            aria-hidden
          />
        </>
      ) : (
        children
      );

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
