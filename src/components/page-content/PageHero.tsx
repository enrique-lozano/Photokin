import clsx from 'clsx';
import type { ReactNode } from 'react';
import './pageContent.css';

interface PageHeroProps {
  /** Large cover block: a representative thumbnail, a `HeroIcon` badge, … */
  cover?: ReactNode;
  /** Render the cover as a circle (people). */
  roundCover?: boolean;
  /** Small line above the title, e.g. the parent trail. May render nothing. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Inline meta line (photo count, size, date range, …). */
  meta?: ReactNode;
  /** Right-aligned actions: toggles, a single primary action and the 3-dot menu. */
  actions?: ReactNode;
}

/**
 * Big content header used at the top of a page's scroll area: a prominent cover,
 * a large title with a meta subtitle and an optional action cluster. Unlike the
 * old fixed header, this scrolls together with the content below it.
 */
export function PageHero({ cover, roundCover, eyebrow, title, meta, actions }: PageHeroProps) {
  return (
    <header className="page-hero">
      {cover && (
        <div className={clsx('page-hero__cover', roundCover && 'page-hero__cover--round')}>{cover}</div>
      )}

      <div className="page-hero__info">
        {eyebrow}
        <h2 className="page-hero__title">{title}</h2>
        {meta && <div className="page-hero__meta">{meta}</div>}
      </div>

      {actions && <div className="page-hero__actions">{actions}</div>}
    </header>
  );
}
