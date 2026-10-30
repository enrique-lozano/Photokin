import * as React from 'react';

import { cn } from '@/lib/utils';
import { FieldVariantProps, inputVariants } from './input';

import type { JSX } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, FieldVariantProps {
  startIcon?: JSX.Element;
  endIcon?: JSX.Element;
}

const InputWithIcon = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, startIcon, endIcon, type, variant, ...props }, ref) => {
    const StartIcon = startIcon;
    const EndIcon = endIcon;

    return (
      <div className="w-full relative">
        {StartIcon && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
            <StartIcon.type className={cn('h-[18px] w-[18px]')} {...startIcon.props} />
          </div>
        )}
        <input
          type={type}
          className={cn(
            inputVariants({ variant }),
            startIcon ? 'pl-10' : '',
            endIcon ? 'pr-10' : '',
            className,
          )}
          ref={ref}
          {...props}
        />
        {EndIcon && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <EndIcon.type className={cn('h-[18px] w-[18px]')} {...endIcon.props} />
          </div>
        )}
      </div>
    );
  },
);
InputWithIcon.displayName = 'InputWithIcon';

export { InputWithIcon };
