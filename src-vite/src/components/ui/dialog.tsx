import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { IconX } from '@tabler/icons-react';

import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  modalBodyClass,
  modalContentClass,
  modalFooterClass,
  modalHeaderClass,
} from '@/components/ui/modalLayout';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // z-1000000 keeps modals above the fullscreen lightbox (z-index 999999)
      // so dialogs opened from the photo detail view aren't hidden behind it.
      'fixed inset-0 z-1000000 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /** Drops the top-right close button, for modals that own their dismissal. */
  hideCloseButton?: boolean;
};

/**
 * Expects `DialogHeader` / `DialogBody` / `DialogFooter` as children: only the
 * body scrolls, so the title and the actions are always reachable.
 */
const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, hideCloseButton, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(modalContentClass, 'w-[min(80vw,64rem)]', className)}
        {...props}
      >
        {children}
        {!hideCloseButton && (
          <DialogPrimitive.Close
            className="absolute right-4 top-5 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close"
          >
            <IconX size={16} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

// `pr-12` keeps long titles from running under the close button.
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn(modalHeaderClass, 'pr-12', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn(modalBodyClass, className)} {...props} />,
);
DialogBody.displayName = 'DialogBody';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn(modalFooterClass, className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

const DialogAction = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => (
  <Button ref={ref} {...props} />
));
DialogAction.displayName = 'DialogAction';

const DialogCancel = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'outline', ...props }, ref) => <Button ref={ref} variant={variant} {...props} />,
);
DialogCancel.displayName = 'DialogCancel';

export {
  Dialog,
  DialogAction,
  DialogBody,
  DialogCancel,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
