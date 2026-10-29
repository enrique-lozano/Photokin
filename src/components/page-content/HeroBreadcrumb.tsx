import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BreadcrumbItem, useAppStore } from '@/stores/appState';
import { IconChevronRight } from '@tabler/icons-react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';

function follow(item: BreadcrumbItem, navigate: (to: string) => void): void {
  if (item.onClick) item.onClick();
  else if (item.to) navigate(item.to);
}

/**
 * The parents of the current page (`Albums › demo`), shown above the hero title.
 * Pages publish the full trail through `appStore.breadcrumb`; its last item is
 * the page itself, which the title already names, so it's left out. Renders
 * nothing for top-level pages.
 *
 * Past `maxVisible` parents, the middle ones collapse into a `…` that jumps
 * straight to a single hidden level or opens a menu of several.
 */
export function HeroBreadcrumb({
  maxVisible = 3,
  title,
  className,
}: {
  maxVisible?: number;
  /** Tooltip for the whole trail, e.g. the album's folder on disk. */
  title?: string;
  className?: string;
}) {
  const breadcrumb = useAppStore((state) => state.breadcrumb);
  const navigate = useNavigate();
  const parents = breadcrumb.slice(0, -1);

  if (parents.length === 0) return null;

  // Keep the root (the section) and the nearest parents; hide what's between.
  const collapsed = parents.length > maxVisible;
  const headCount = maxVisible > 1 ? 1 : 0;
  const tailStart = parents.length - (maxVisible - headCount);
  const head = collapsed ? parents.slice(0, headCount) : parents;
  const hidden = collapsed ? parents.slice(headCount, tailStart) : [];
  const tail = collapsed ? parents.slice(tailStart) : [];

  const renderItem = (item: BreadcrumbItem, key: string) => (
    <span className="hero-breadcrumb__segment" key={key}>
      {item.onClick || item.to ? (
        <button type="button" className="hero-breadcrumb__link" onClick={() => follow(item, navigate)}>
          {item.label}
        </button>
      ) : (
        <span className="hero-breadcrumb__label">{item.label}</span>
      )}
      <IconChevronRight size={12} className="hero-breadcrumb__separator" />
    </span>
  );

  return (
    <nav className={clsx('hero-breadcrumb', className)} aria-label="Breadcrumb" title={title}>
      {head.map((item, index) => renderItem(item, `head-${index}`))}
      {hidden.length > 0 && (
        <span className="hero-breadcrumb__segment">
          {hidden.length === 1 ? (
            <button
              type="button"
              className="hero-breadcrumb__link"
              title={hidden[0].label}
              aria-label={hidden[0].label}
              onClick={() => follow(hidden[0], navigate)}
            >
              …
            </button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="hero-breadcrumb__link"
                aria-label="Show the collapsed levels"
                title={hidden.map((item) => item.label).join(' › ')}
              >
                …
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {hidden.map((item, index) => (
                  <DropdownMenuItem
                    key={`${item.label}-${index}`}
                    disabled={!item.onClick && !item.to}
                    onSelect={() => follow(item, navigate)}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <IconChevronRight size={12} className="hero-breadcrumb__separator" />
        </span>
      )}
      {tail.map((item, index) => renderItem(item, `tail-${index}`))}
    </nav>
  );
}
