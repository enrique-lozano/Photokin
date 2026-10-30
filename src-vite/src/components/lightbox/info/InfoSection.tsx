import { IconChevronDown } from '@tabler/icons-react';
import { KeyboardEvent, ReactNode, type JSX } from 'react';
import { AccordionContent, AccordionItem } from '../../ui/accordion';
import { ItemTile } from '../ItemTile';

interface InfoSectionProps {
  /** Stable id used as the accordion value. */
  id: string;
  title: string;
  /** Icon shown in the header leading slot. */
  icon: JSX.Element;
  /** Optional element rendered inline next to the title (e.g. a count chip). */
  badge?: JSX.Element;
  isOpen: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
  standalone?: boolean;
}

function handleHeaderKeyDown(event: KeyboardEvent<HTMLDivElement>, onActivate: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onActivate();
  }
}

/**
 * A single collapsible metadata section: a clickable header row (icon + title +
 * chevron) over animated accordion content. Designed to live
 * inside a controlled `<Accordion type="multiple">`.
 */
export function InfoSection({
  id,
  title,
  icon,
  badge,
  isOpen,
  onToggle,
  children,
  standalone,
}: InfoSectionProps) {
  if (standalone)
    return (
      <section className="info-surface people-card">
        <div className="info-row">
          <h5 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h5>
          {badge}
        </div>
        {children}
      </section>
    );
  return (
    <AccordionItem value={id} className="info-card">
      <div
        className="clickable-tile accordion-header-button"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => onToggle(id)}
        onKeyDown={(event) => handleHeaderKeyDown(event, () => onToggle(id))}
      >
        <ItemTile
          title={title}
          titleBadge={badge}
          leading={icon}
          trailing={<IconChevronDown size={18} className="toggle-accordion-icon" aria-hidden />}
        />
      </div>

      <AccordionContent>{children}</AccordionContent>
    </AccordionItem>
  );
}
