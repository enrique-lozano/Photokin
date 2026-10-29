import * as React from 'react';

import { cn } from '@/lib/utils';
import { FieldVariantProps, textareaVariants } from './input';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> &
  FieldVariantProps & {
    autoResize?: boolean;
  };

/** How close to the bottom-right corner a press counts as grabbing the resize grip. */
const RESIZE_GRIP_SIZE = 18;

function isOnResizeGrip(event: React.PointerEvent<HTMLTextAreaElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX > rect.right - RESIZE_GRIP_SIZE && event.clientY > rect.bottom - RESIZE_GRIP_SIZE;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant, autoResize = false, onChange, onPointerDown, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
    React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement);

    // Once the grip is dragged the height belongs to the user, so auto-sizing
    // stops instead of snapping back on the next keystroke.
    const isUserSized = React.useRef(false);

    const resize = React.useCallback(() => {
      const el = innerRef.current;
      if (!autoResize || !el || isUserSized.current) return;

      const styles = getComputedStyle(el);
      // scrollHeight leaves out the border, which `box-sizing: border-box`
      // would then take out of the content area, leaving a permanent scrollbar.
      const borders = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);

      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + borders}px`;
    }, [autoResize]);

    React.useLayoutEffect(resize, [props.value, resize]);

    // Text wraps differently at every width, and the field may well be measured
    // while its container is still collapsed (a closed panel, a hidden tab), so
    // any width change is a reason to measure again. Height changes are ignored
    // to avoid feeding our own writes back in.
    React.useEffect(() => {
      const el = innerRef.current;
      if (!autoResize || !el) return;

      let lastWidth = el.clientWidth;
      const observer = new ResizeObserver(() => {
        if (el.clientWidth === lastWidth) return;
        lastWidth = el.clientWidth;
        resize();
      });
      observer.observe(el);

      return () => observer.disconnect();
    }, [autoResize, resize]);

    return (
      <textarea
        className={cn(textareaVariants({ variant }), className)}
        ref={innerRef}
        onChange={(event) => {
          onChange?.(event);
          resize();
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (autoResize && isOnResizeGrip(event)) {
            isUserSized.current = true;
          }
        }}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
