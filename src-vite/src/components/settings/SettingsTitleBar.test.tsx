import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsTitleBar } from './SettingsTitleBar';

const platformMock = vi.hoisted(() => vi.fn(() => 'windows'));

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn(() => ({})) }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: platformMock }));

describe('SettingsTitleBar', () => {
  afterEach(() => {
    platformMock.mockReturnValue('windows');
  });

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

  it('hides the custom close button on macOS, which has native traffic lights', () => {
    platformMock.mockReturnValue('macos');
    const html = renderToStaticMarkup(<SettingsTitleBar title="Components" />);
    expect(html).not.toContain('Close components');
  });
});
