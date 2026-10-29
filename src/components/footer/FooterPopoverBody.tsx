import { cn } from '@/lib/utils';
import type { ComponentType, ReactNode } from 'react';

interface FooterPopoverBodyProps {
  icon: ComponentType<{ size?: number }>;
  title: string;
  /** Tints the title and icon to match the status that opened the popover. */
  tone?: 'default' | 'warning' | 'destructive';
  children: ReactNode;
}

/** Shared layout for the footer status popovers: icon + title, then the explanation and actions. */
export function FooterPopoverBody({ icon: Icon, title, tone = 'default', children }: FooterPopoverBodyProps) {
  return (
    <div className="space-y-3">
      <p
        className={cn(
          'flex items-center gap-1.5 text-sm font-semibold',
          tone === 'warning' && 'text-warning',
          tone === 'destructive' && 'text-destructive-text',
          tone === 'default' && 'text-foreground',
        )}
      >
        <Icon size={15} />
        {title}
      </p>
      {children}
    </div>
  );
}
