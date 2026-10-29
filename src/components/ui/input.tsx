import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Chrome shared by every text field, so placeholder, focus and disabled states
 * are defined once instead of per surface. `filled` is the flatter, tinted
 * treatment used by the lightbox info panel.
 */
const FIELD_STATES =
  'w-full placeholder:text-muted-foreground focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50';

const FIELD_SURFACE = {
  default:
    'rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  filled:
    'rounded-lg border border-border bg-muted/35 px-3 py-[9px] text-sm text-foreground transition-colors focus-visible:border-ring focus-visible:bg-muted/55',
};

export const inputVariants = cva([FIELD_STATES, 'flex'], {
  variants: {
    variant: {
      default: `h-9 ${FIELD_SURFACE.default} file:border-0 file:bg-transparent file:text-sm file:font-medium`,
      filled: FIELD_SURFACE.filled,
    },
  },
  defaultVariants: { variant: 'default' },
});

export const textareaVariants = cva([FIELD_STATES, 'resize-y'], {
  variants: {
    variant: {
      default: `min-h-20 ${FIELD_SURFACE.default}`,
      filled: `min-h-16 leading-[1.4] ${FIELD_SURFACE.filled}`,
    },
  },
  defaultVariants: { variant: 'default' },
});

export type FieldVariantProps = VariantProps<typeof inputVariants>;

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & FieldVariantProps;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, ...props }, ref) => {
    return <input type={type} className={cn(inputVariants({ variant }), className)} ref={ref} {...props} />;
  },
);
Input.displayName = 'Input';

export { Input };
