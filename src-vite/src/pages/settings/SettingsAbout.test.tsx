import type { ButtonHTMLAttributes } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import packageInfo from '../../../../package.json';
import { SettingsAbout } from './SettingsAbout';
import { SettingsExternalLink } from './SettingsExternalLink';

const mocks = vi.hoisted(() => ({
  openUrl: vi.fn(),
  writeText: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  buttons: [] as ButtonHTMLAttributes<HTMLButtonElement>[],
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: () => 'windows',
  arch: () => 'x86_64',
  version: () => '10.0.26300',
}));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: mocks.openUrl }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: mocks.writeText }));
vi.mock('./SettingsUpdates', () => ({ SettingsUpdates: () => <section>Updates</section> }));
vi.mock('@/components/ui/toast', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
  toastOnError: vi.fn(),
}));
vi.mock('@/components/ui/button', () => ({
  buttonVariants: () => '',
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => {
    mocks.buttons.push(props);
    return <button type="button">{props.children}</button>;
  },
}));

function renderAbout() {
  return renderToStaticMarkup(<SettingsAbout />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buttons.length = 0;
  mocks.openUrl.mockResolvedValue(undefined);
  mocks.writeText.mockResolvedValue(undefined);
});

describe('About Photokin', () => {
  it('shows the version once, in the header, plus the license and system', () => {
    const html = renderAbout();
    expect(html.split(`>${packageInfo.version}<`)).toHaveLength(2);
    expect(html).toContain('AGPL-3.0-only');
    expect(html).toContain('Windows 10.0.26300 · x86_64');
    expect(html).not.toContain('Preparing for the first public release');
  });

  it('copies system info for bug reports', async () => {
    renderAbout();
    const copy = mocks.buttons.find((button) => button['aria-label'] === 'Copy system info');
    await copy?.onClick?.({} as never);
    expect(mocks.writeText).toHaveBeenCalledWith(
      `Photokin ${packageInfo.version}\nWindows 10.0.26300 · x86_64`,
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('System info copied');
  });

  it('links to the license, project pages, and privacy notice', () => {
    const hrefs = [...renderAbout().matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        'https://github.com/enrique-lozano/Photokin/blob/main/LICENSE',
        'https://github.com/enrique-lozano/Photokin',
        'https://github.com/enrique-lozano/Photokin#readme',
        'https://github.com/enrique-lozano/Photokin/issues',
        'https://github.com/enrique-lozano/Photokin/blob/main/docs/PRIVACY_POLICY.md',
      ]),
    );
  });

  it('closes the page with the donation line', () => {
    const html = renderAbout();
    expect(html.indexOf('Donate a little love')).toBeGreaterThan(
      html.indexOf('Everything stays on this computer.'),
    );
  });
});

describe('external links', () => {
  function clickLink() {
    const link = SettingsExternalLink({ href: 'https://example.com', label: 'Example' });
    const preventDefault = vi.fn();
    expect(link.props).toMatchObject({
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': 'Example (opens in your browser)',
    });
    return { done: link.props.onClick({ preventDefault }), preventDefault };
  }

  it('open in the system browser only when clicked', async () => {
    const { done, preventDefault } = clickLink();
    await done;
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(mocks.openUrl).toHaveBeenCalledWith('https://example.com');
  });

  it('report a browser launch failure without an unhandled rejection', async () => {
    mocks.openUrl.mockRejectedValue(new Error('Browser unavailable'));
    await clickLink().done;
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Could not open the link in your browser: Error: Browser unavailable',
    );
  });
});
