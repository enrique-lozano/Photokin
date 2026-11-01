import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SearchDiscovery, SearchExamplePlaceholder } from './SearchDiscovery';
vi.mock('@/media/smartSearch/modelDownload', () => ({ useModelDownloads: vi.fn() }));
vi.mock('@/utils/openSettingsWindow', () => ({ openSettingsWindow: vi.fn() }));

describe('search discovery', () => {
  it('explains on-device AI only when ready', () => {
    const markup = renderToStaticMarkup(
      <SearchDiscovery ready loading={false} error={null} retry={vi.fn()} />,
    );
    expect(markup).toContain('AI-powered, on your device');
    expect(markup).not.toContain('Enable smart search');
  });
  it('offers setup when unavailable, not a false AI promise', () => {
    const markup = renderToStaticMarkup(
      <SearchDiscovery ready={false} loading={false} error={null} retry={vi.fn()} />,
    );
    expect(markup).toContain('Enable smart search');
    expect(markup).not.toContain('AI-powered, on your device');
  });
  it('shows check errors and retry explicitly', () => {
    const markup = renderToStaticMarkup(
      <SearchDiscovery ready={false} loading={false} error="Check failed" retry={vi.fn()} />,
    );
    expect(markup).toContain('Check failed');
    expect(markup).toContain('Retry');
    expect(markup).not.toContain('Enable smart search');
  });
  it('keeps animated examples outside the accessible input and actual query', () => {
    const markup = renderToStaticMarkup(<SearchExamplePlaceholder />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('Describe a photo: dog on the beach');
    expect(markup).toContain('toolbar-searchbar__example-line');
    expect(markup).not.toContain('is-incoming');
    expect(markup).not.toContain('is-outgoing');
    expect(markup).not.toContain('<input');
  });
});
