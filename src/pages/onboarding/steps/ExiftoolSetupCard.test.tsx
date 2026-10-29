import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ExiftoolSetupCard } from './ExiftoolSetupCard';

function markup(overrides: Partial<ComponentProps<typeof ExiftoolSetupCard>> = {}) {
  return renderToStaticMarkup(
    <ExiftoolSetupCard
      status="missing"
      progress={null}
      error={null}
      canAutoInstall
      onInstall={vi.fn()}
      onLocate={vi.fn()}
      onRetry={vi.fn()}
      onOpenFolder={vi.fn()}
      {...overrides}
    />,
  );
}

describe('onboarding ExifTool card', () => {
  it('explains the optional dependency and offers both setup methods on Windows', () => {
    const html = markup();
    expect(html).toContain('Photokin uses ExifTool to read and edit the details stored inside your photos');
    expect(html).toContain('Browse photos without it');
    expect(html).toContain('Not found');
    expect(html).toContain('Install automatically');
    expect(html).toContain('Locate manually');
  });

  it('does not offer automatic installation on other platforms', () => {
    expect(markup({ canAutoInstall: false })).not.toContain('Install automatically');
  });

  it('keeps a busy card while checking, without setup actions', () => {
    const html = markup({ status: 'checking' });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Checking ExifTool');
    expect(html).not.toContain('Install automatically');
    expect(html).not.toContain('Locate manually');
  });

  it('shows the real download percentage and all three installation stages', () => {
    const html = markup({
      status: 'installing',
      progress: { stage: 'downloading', version: '13.59', percent: 62 },
    });
    expect(html).toContain('Installing ExifTool v13.59');
    expect(html).toContain('aria-valuenow="62"');
    expect(html).toContain('width:62%');
    expect(html).toContain('Downloading · 62%');
    expect(html).toContain('Unpacking');
    expect(html).toContain('Checking');
    expect(html).not.toContain('Install automatically');
    expect(html).not.toContain('Locate manually');
  });

  it.each(['unpacking', 'checking'] as const)('marks preceding stages done during %s', (stage) => {
    const html = markup({ status: 'installing', progress: { stage, version: '13.59', percent: null } });
    expect(html.match(/data-done="true"/g)).toHaveLength(stage === 'checking' ? 2 : 1);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-valuenow');
    expect(html).toContain('data-indeterminate="true"');
  });

  it('shows the available version, full-path tooltip and folder action', () => {
    const path = 'C:\\Users\\photographer\\AppData\\Local\\com.photokin.app\\exiftool\\exiftool.exe';
    const html = markup({
      status: 'ready',
      dependency: {
        id: 'exiftool',
        displayName: 'ExifTool',
        version: '13.59',
        location: path,
        available: true,
        error: null,
      },
    });
    expect(html).toContain('Available');
    expect(html).toContain('v13.59');
    expect(html).toContain(`title="${path}"`);
    expect(html).toContain('Open folder');
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain('Install automatically');
  });

  it('keeps failures visible and offers recovery in the same card', () => {
    const html = markup({ status: 'error', error: 'Download interrupted' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Download interrupted');
    expect(html).toContain('Try again');
    expect(html).toContain('Locate manually');
    expect(html).not.toContain('Available');
  });
});
