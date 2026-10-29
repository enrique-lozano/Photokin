import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LastUpdateCheck } from '@/system/appUpdater';
import { SettingsUpdates } from './SettingsUpdates';

const mocks = vi.hoisted(() => ({ lastCheck: null as LastUpdateCheck | null }));

vi.mock('@/system/appUpdater', () => ({
  RELEASES_URL: 'https://github.com/enrique-lozano/Photokin/releases',
  getLastUpdateCheck: () => mocks.lastCheck,
  checkForAppUpdate: vi.fn(),
  requestAppUpdateInstall: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));

beforeEach(() => {
  mocks.lastCheck = null;
});

describe('updates line', () => {
  it('starts as not checked', () => {
    const html = renderToStaticMarkup(<SettingsUpdates />);
    expect(html).toContain('Not checked yet');
    expect(html).toContain('Check when Photokin starts');
  });

  it('remembers an up-to-date answer with its time', () => {
    mocks.lastCheck = { checkedAt: Date.now(), version: null, releasedAt: null };
    const html = renderToStaticMarkup(<SettingsUpdates />);
    expect(html).toContain('You’re up to date');
    expect(html).toContain('Last checked today,');
  });

  it('offers a pending update with its release notes', () => {
    mocks.lastCheck = { checkedAt: Date.now(), version: '0.1.0', releasedAt: '2026-10-21T12:00:00Z' };
    const html = renderToStaticMarkup(<SettingsUpdates />);
    expect(html).toContain('Version 0.1.0 is available');
    expect(html).toContain('Released ');
    expect(html).toContain('href="https://github.com/enrique-lozano/Photokin/releases/tag/v0.1.0"');
    expect(html).toContain('Install and restart');
  });
});
