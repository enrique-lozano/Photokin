import { ContentSubHeader } from '@/components/page-content/ContentSubHeader';
import { GalleryLayoutControl } from '@/components/page-content/GalleryLayoutControl';
import { HeroBreadcrumb } from '@/components/page-content/HeroBreadcrumb';
import { HeroIcon } from '@/components/page-content/HeroIcon';
import { PageHero } from '@/components/page-content/PageHero';
import { ScrollablePageContent } from '@/components/page-content/ScrollablePageContent';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import './secondaryTitleAndScrollableContent.css';

type SecondaryTitleAndScrollableContentProps = {
  /** Explicit cover node (image / thumbnail / colored badge). Takes precedence over `icon`. */
  cover?: ReactNode;
  /** Convenience: an icon rendered inside a colored `HeroIcon` badge. */
  icon?: ReactNode;
  /** Render the cover as a circle (people). */
  roundCover?: boolean;
  title: ReactNode;
  /**
   * Tooltip for the parent trail above the title (taken from the app
   * breadcrumb), e.g. the album's full folder path on disk.
   */
  breadcrumbTitle?: string;
  /** Meta content below the title, e.g. a summary and inline person details. */
  subtitle?: ReactNode;
  /** Reduced meta shown in the pinned compact hero. Defaults to `subtitle`. */
  compactSubtitle?: ReactNode;
  /** Right-aligned hero actions (primary action, 3-dot menu, …). */
  actions?: ReactNode;
  /**
   * Reduced action cluster shown in the pinned compact bar once the full hero
   * scrolls away (typically the primary action + a `⋮`). Must never carry a
   * command the full hero doesn't. Omit to leave the compact bar action-free.
   */
  compactActions?: ReactNode;
  /** Sub-header filter chips (left side). */
  filters?: ReactNode;
  /** Sub-header right-side toggles (Include sub-albums, Group by year, …). */
  subHeaderActions?: ReactNode;
  /**
   * Show the gallery layout menu at the right edge of the sub-header;
   * `'disabled'` keeps it in place for a view without a photo grid.
   */
  galleryLayout?: boolean | 'disabled';
  /**
   * Block shown under the hero but above the sticky sub-header (e.g. a person's
   * "about" strip). Scrolls away with the hero.
   */
  heroBelow?: ReactNode;
  content: ReactNode;
};

/**
 * The single, reusable main-content layout: a tall page hero (cover, title,
 * parent trail, meta and actions), an optional sticky sub-header (filter chips +
 * view toggles) and a scrollable body. Every page that shows a selected item
 * routes through this component so the main content looks identical everywhere.
 */
export function SecondaryTitleAndScrollableContent({
  cover,
  icon,
  roundCover,
  title,
  breadcrumbTitle,
  subtitle,
  compactSubtitle,
  actions,
  compactActions,
  filters,
  subHeaderActions,
  galleryLayout = false,
  heroBelow,
  content,
}: SecondaryTitleAndScrollableContentProps) {
  const coverNode = cover ?? (icon ? <HeroIcon icon={icon} /> : undefined);
  const titleText = typeof title === 'string' ? title : undefined;
  const heroTitle = (
    <span className="page-hero__title-text" title={titleText}>
      {title}
    </span>
  );

  const hasFilters = Array.isArray(filters) ? filters.length > 0 : Boolean(filters);
  const compactMeta = compactSubtitle ?? subtitle;
  const resolvedActions =
    subHeaderActions || galleryLayout ? (
      <>
        {subHeaderActions}
        {galleryLayout && <GalleryLayoutControl disabled={galleryLayout === 'disabled'} />}
      </>
    ) : undefined;
  const resolvedSubHeader =
    hasFilters || resolvedActions ? (
      <ContentSubHeader filters={filters} actions={resolvedActions} />
    ) : undefined;

  // Slim variant of the hero that pins once the full hero scrolls away, so the
  // user can always answer "which item am I inside?" (icon + name + meta).
  const compactHero = (
    <div className="compact-hero">
      {coverNode && (
        <span className={clsx('compact-hero__icon', roundCover && 'compact-hero__icon--round')}>
          {coverNode}
        </span>
      )}
      <span className="compact-hero__title" title={titleText}>
        <HeroBreadcrumb maxVisible={1} className="compact-hero__breadcrumb" />
        {title}
      </span>
      {compactMeta && <span className="compact-hero__meta">{compactMeta}</span>}
      {compactActions && <div className="compact-hero__actions">{compactActions}</div>}
    </div>
  );

  return (
    <ScrollablePageContent
      hero={
        <PageHero
          cover={coverNode}
          roundCover={roundCover}
          eyebrow={<HeroBreadcrumb title={breadcrumbTitle} />}
          title={heroTitle}
          meta={subtitle}
          actions={actions}
        />
      }
      compactHero={compactHero}
      heroBelow={heroBelow}
      subHeader={resolvedSubHeader}
    >
      {content}
    </ScrollablePageContent>
  );
}
