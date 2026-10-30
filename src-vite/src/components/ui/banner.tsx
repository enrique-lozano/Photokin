import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/** Inline notice that sits in the content flow, e.g. inside dialogs or side panels. */
const bannerVariants = cva(
  'flex items-start gap-2 rounded-md border p-3 text-sm [&>svg]:mt-px [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-accent/40 [&>svg]:text-muted-foreground',
        warning: 'border-warning/40 bg-warning/10 [&>svg]:text-warning',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BannerProps extends React.ComponentProps<'div'>, VariantProps<typeof bannerVariants> {
  icon?: React.ReactNode;
}

function Banner({ className, variant, icon, children, ...props }: BannerProps) {
  return (
    <div data-slot="banner" className={cn(bannerVariants({ variant }), className)} {...props}>
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export { Banner, bannerVariants };
