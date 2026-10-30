import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Small non-interactive pill for statuses, counts and labels. `info`, `success`,
 * `warning` and `destructive` are tinted so several can sit side by side
 * without shouting.
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive/15 text-destructive-text [a&]:hover:bg-destructive/25',
        info: 'border-transparent bg-primary/15 text-primary [a&]:hover:bg-primary/25',
        success: 'border-transparent bg-success/15 text-success [a&]:hover:bg-success/25',
        warning: 'border-transparent bg-warning/15 text-warning [a&]:hover:bg-warning/25',
        outline: 'border-border text-foreground [a&]:hover:bg-accent',
        ghost: 'border-transparent [a&]:hover:bg-accent',
        link: 'border-transparent text-primary underline-offset-4 [a&]:hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : 'span';

  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
