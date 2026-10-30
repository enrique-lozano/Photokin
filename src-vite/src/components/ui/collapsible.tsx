import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible';
import { IconChevronDown } from '@tabler/icons-react';
import * as React from 'react';

import { cn } from '@/lib/utils';
import './collapsible.css';

/*
 * The app's one expand/collapse primitive. Behaviour and motion only (shared hover,
 * rotating chevron, animated height): typography stays with each caller, so a
 * compact surface like the info panel keeps its smaller text.
 */

type WithClassName<Props> = Omit<Props, 'className'> & { className?: string };

const Collapsible = React.forwardRef<HTMLDivElement, WithClassName<BaseCollapsible.Root.Props>>(
  (props, ref) => <BaseCollapsible.Root ref={ref} {...props} />,
);
Collapsible.displayName = 'Collapsible';

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, WithClassName<BaseCollapsible.Trigger.Props>>(
  ({ className, ...props }, ref) => (
    <BaseCollapsible.Trigger ref={ref} className={cn('expandable-trigger', className)} {...props} />
  ),
);
CollapsibleTrigger.displayName = 'CollapsibleTrigger';

const CollapsiblePanel = React.forwardRef<HTMLDivElement, WithClassName<BaseCollapsible.Panel.Props>>(
  ({ className, ...props }, ref) => (
    <BaseCollapsible.Panel ref={ref} className={cn('collapsible-panel', className)} {...props} />
  ),
);
CollapsiblePanel.displayName = 'CollapsiblePanel';

/** Place inside a trigger; it flips when the panel opens. */
function CollapsibleChevron({ size = 16, className }: { size?: number; className?: string }) {
  return <IconChevronDown size={size} className={cn('expand-chevron', className)} aria-hidden />;
}

export { Collapsible, CollapsibleChevron, CollapsiblePanel, CollapsibleTrigger };
