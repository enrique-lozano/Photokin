import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/utils';

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, 'aria-label': ariaLabel, 'aria-valuetext': ariaValueText, ...props }, ref) => {
  // Radix needs one thumb per value: a plain slider has one, a range has two.
  const thumbCount = Math.max(props.value?.length ?? props.defaultValue?.length ?? 1, 1);

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn('relative flex touch-none select-none items-center', className)}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary"
      >
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {/* The thumb is the element with `role="slider"`, so the name belongs on it. */}
      {Array.from({ length: thumbCount }, (_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          data-slot="slider-thumb"
          aria-label={_thumbLabel(ariaLabel, index, thumbCount)}
          aria-valuetext={ariaValueText}
          className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow-sm transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  );
});

Slider.displayName = SliderPrimitive.Root.displayName;

/** A range's thumbs are the ends of the named range; a lone thumb *is* the control. */
function _thumbLabel(name: string | undefined, index: number, thumbCount: number) {
  if (!name || thumbCount === 1) return name;

  return `${name} ${index === 0 ? 'minimum' : 'maximum'}`;
}

export { Slider };
