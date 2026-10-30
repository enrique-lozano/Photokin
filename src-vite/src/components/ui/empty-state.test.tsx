import { IconTag } from '@tabler/icons-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './empty-state';

vi.mock('@/components/page-content/ImportStatus', () => ({ useImportStatus: () => null }));

describe('EmptyState', () => {
  it('renders the icon, title, description and actions of a page', () => {
    const markup = renderToStaticMarkup(
      <EmptyState
        icon={IconTag}
        title="No tags yet"
        description="Create one to get started."
        action={<button type="button">New tag</button>}
      />,
    );

    expect(markup).toContain('data-size="page"');
    expect(markup).toContain('icon-tag');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('No tags yet');
    expect(markup).toContain('Create one to get started.');
    expect(markup).toContain('New tag');
    expect(markup).toContain('min-h-[min(28rem,60vh)]');
    expect(markup).toContain('bg-primary/10');
  });

  it('controls the icon size centrally per variant', () => {
    const page = renderToStaticMarkup(<EmptyState icon={IconTag} title="Empty" />);
    const panel = renderToStaticMarkup(
      <EmptyState icon={IconTag} title="Empty" description="Nothing yet." size="panel" />,
    );

    expect(page).toContain('width="26"');
    expect(panel).toContain('width="20"');
    expect(panel).toContain('data-size="panel"');
    expect(panel).not.toContain('min-h-');
    expect(panel).toContain('text-xs');
  });

  it('leaves out the description and action rows when not given', () => {
    const markup = renderToStaticMarkup(<EmptyState icon={IconTag} title="Nothing here" />);

    expect(markup).toContain('Nothing here');
    expect(markup).not.toContain('<p class');
    expect(markup).not.toContain('flex-wrap');
  });
});
