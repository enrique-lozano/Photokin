import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SettingsTitleBar } from './SettingsTitleBar';

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn(() => ({})) }));

describe('SettingsTitleBar', () => {
  it('keeps the plain title for windows without breadcrumbs', () => {
    const html = renderToStaticMarkup(<SettingsTitleBar title="Components" />);
    expect(html).toContain('Components');
    expect(html).toContain('Close components');
    expect(html).not.toContain('aria-label="Breadcrumb"');
  });

  it('renders clickable parents and a noninteractive current page', () => {
    const html = renderToStaticMarkup(
      <SettingsTitleBar
        title="Settings"
        breadcrumbs={[
          { label: 'Settings', onClick: vi.fn() },
          { label: 'System', onClick: vi.fn() },
          { label: 'Smart search models' },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).toContain('<span aria-current="page">Smart search models</span>');
    expect(html.indexOf('Settings</button>')).toBeLessThan(html.indexOf('System</button>'));
    expect(html).toContain('Close settings');
  });
});
