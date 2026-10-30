import { IconDeviceFloppy } from '@tabler/icons-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button loading feedback', () => {
  it('keeps its content in the layout while showing an overlaid spinner', () => {
    const markup = renderToStaticMarkup(
      <Button isLoading>
        <IconDeviceFloppy size={16} />
        Save
      </Button>,
    );

    expect(markup).toContain('gap-[inherit] opacity-0');
    expect(markup).toContain('icon-device-floppy');
    expect(markup).toContain('Save');
    expect(markup).toContain('absolute');
    expect(markup).toContain('motion-safe:animate-spin');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
  });

  it('renders idle content without a spinner or busy state', () => {
    const markup = renderToStaticMarkup(<Button>Save</Button>);

    expect(markup).toContain('Save');
    expect(markup).not.toContain('opacity-0');
    expect(markup).not.toContain('animate-spin');
    expect(markup).not.toContain('aria-busy');
    expect(markup).not.toContain('active:scale');
  });

  it('does not inject a wrapper or spinner into slotted content', () => {
    const markup = renderToStaticMarkup(
      <Button asChild isLoading>
        <a href="/settings">Settings</a>
      </Button>,
    );

    expect(markup).toContain('href="/settings"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain('<span');
    expect(markup).not.toContain('<svg');
  });
});
