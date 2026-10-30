import type { JSX } from 'react';
export function ItemTile({
  leading,
  title,
  titleBadge,
  subtitle,
  trailing,
  classNames,
}: {
  /** Usually an icon */
  leading?: JSX.Element;

  title: string;
  /** Optional element rendered inline, right of the title (e.g. a count chip). */
  titleBadge?: JSX.Element;
  subtitle?: string;
  trailing?: JSX.Element;
  classNames?: string;
}) {
  return (
    <section className={`info-tile ${classNames ?? ''}`.trim()}>
      <div className="info-tile__icon-and-texts">
        {leading && <div className="icon-container">{leading}</div>}
        <div className="info-tile__texts-container">
          <div className="info-tile__title-row">
            <h6 className="text-base font-semibold">{title}</h6>
            {titleBadge}
          </div>
          {subtitle && <span className="text-sm font-normal text-muted-foreground">{subtitle}</span>}
        </div>
      </div>

      {trailing && <div className="info-tile__trailing">{trailing}</div>}
    </section>
  );
}
