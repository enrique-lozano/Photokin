import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DependencyStatusCards } from './DependencyStatusCards';
import type { ExternalDependencyStatus } from '@/system/dependencyStatus';

vi.mock('@/system/diskManager', () => ({ openContainingFolder: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/system/exiftoolSetup', () => ({ installExiftool: vi.fn(), locateExiftool: vi.fn() }));

const exiftool: ExternalDependencyStatus = {
  id: 'exiftool',
  displayName: 'ExifTool',
  version: '13.59',
  location: 'C:\\Tools\\ExifTool\\exiftool.exe',
  available: true,
  error: null,
};

function render(props: Parameters<typeof DependencyStatusCards>[0]) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <DependencyStatusCards {...props} />
    </TooltipProvider>,
  );
}

describe('photo tool settings', () => {
  it('shows name, version and purpose without success labels or redundant folder actions', () => {
    const html = render({ dependencies: [exiftool], isLoading: false, error: null, onRecheck: vi.fn() });
    expect(html).toContain('ExifTool');
    expect(html).toContain('Version 13.59 · Reads and updates your photo details.');
    expect(html).not.toContain('Ready');
    expect(html).not.toContain('text-success');
    expect(html).not.toContain('Open ExifTool folder');
    expect(html).toContain('aria-label="Check again"');
    expect(html).not.toContain(exiftool.location);
  });

  it('keeps missing-tool errors visible', () => {
    const html = render({
      dependencies: [
        { ...exiftool, available: false, location: null, error: 'ExifTool could not be found.' },
      ],
      isLoading: false,
      error: null,
    });
    expect(html).toContain('Not found');
    expect(html).toContain('role="alert"');
    expect(html).toContain('ExifTool could not be found.');
    expect(html).toContain('Photokin can’t read or write metadata.');
    expect(html).toContain('Install');
    expect(html).toContain('Choose file…');
    expect(html).not.toContain('Open ExifTool folder');
  });

  it('offers an explicit tested-version install without hiding the current working version', () => {
    const html = render({
      dependencies: [{ ...exiftool, recommendedVersion: '13.60' }],
      isLoading: false,
      error: null,
    });
    expect(html).toContain('Version 13.59');
    expect(html).toContain('Install tested version');
    expect(html).toContain('Your system copy is not changed.');
    expect(html).toContain('Choose file…');
  });

  it('does not offer an unnecessary version update but keeps manual selection available', () => {
    const html = render({
      dependencies: [{ ...exiftool, version: '13.60', recommendedVersion: '13.60' }],
      isLoading: false,
      error: null,
    });
    expect(html).not.toContain('Install tested version');
    expect(html).toContain('Choose file…');
  });

  it('announces loading and probe failures without showing stale tool rows', () => {
    const loading = render({ dependencies: [exiftool], isLoading: true, error: null });
    expect(loading).toContain('role="status"');
    expect(loading).toContain('Checking photo tools');
    expect(loading).not.toContain('Version 13.59');

    const failure = render({ dependencies: [exiftool], isLoading: false, error: 'Probe failed' });
    expect(failure).toContain('role="alert"');
    expect(failure).toContain('Probe failed');
    expect(failure).not.toContain('Version 13.59');
  });

  it('provides an explicit empty state', () => {
    const html = render({ dependencies: [], isLoading: false, error: null });
    expect(html).toContain('No photo tools found.');
  });
});
