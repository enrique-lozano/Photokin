import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExternalDependencyStatus } from '@/system/dependencyStatus';
import type { ExiftoolInstallProgress } from '@/system/exiftoolSetup';
import type { ExiftoolSetupCard } from './ExiftoolSetupCard';
import { DependenciesStep } from './DependenciesStep';

const mocks = vi.hoisted(() => ({
  state: [] as unknown[],
  stateIndex: 0,
  dependencies: [] as ExternalDependencyStatus[],
  loading: false,
  error: null as string | null,
  reload: vi.fn(),
  install: vi.fn(),
  locate: vi.fn(),
  openFolder: vi.fn(),
  toast: vi.fn(),
  card: null as ComponentProps<typeof ExiftoolSetupCard> | null,
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = mocks.stateIndex++;
    if (!(index in mocks.state)) mocks.state[index] = initial;
    return [mocks.state[index], (value: unknown) => (mocks.state[index] = value)];
  },
}));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'windows' }));
vi.mock('@/system/useDependencyStatus', () => ({
  useDependencyStatus: () => ({
    dependencies: mocks.dependencies,
    isLoading: mocks.loading,
    error: mocks.error,
    reload: mocks.reload,
  }),
}));
vi.mock('@/system/exiftoolSetup', () => ({
  installExiftool: mocks.install,
  locateExiftool: mocks.locate,
}));
vi.mock('@/system/diskManager', () => ({ openContainingFolder: mocks.openFolder }));
vi.mock('@/components/ui/toast', () => ({ toast: { error: mocks.toast } }));
vi.mock('./ExiftoolSetupCard', async (original) => {
  const { ExiftoolSetupCard: Card } = await original<typeof import('./ExiftoolSetupCard')>();
  return {
    ExiftoolSetupCard: (props: ComponentProps<typeof Card>) => {
      mocks.card = props;
      return <Card {...props} />;
    },
  };
});

function markup() {
  mocks.stateIndex = 0;
  return renderToStaticMarkup(<DependenciesStep goNext={vi.fn()} />);
}

function expectContinueDisabled(html: string, disabled: boolean) {
  const button = html.match(/<button[^>]*>Continue /)?.[0];
  expect(button).toBeDefined();
  expect(button?.includes('disabled=""')).toBe(disabled);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = [];
  mocks.dependencies = [];
  mocks.loading = false;
  mocks.error = null;
  mocks.card = null;
  mocks.reload.mockImplementation(() => {
    mocks.loading = true;
  });
});

describe('welcome setup flow', () => {
  it('introduces photo organization before explaining ExifTool in its setup card', () => {
    const html = markup();
    const introduction = html.indexOf('Browse your photo collection, organize it with albums and tags');
    const card = html.indexOf('aria-label="ExifTool setup"');
    const explanation = html.indexOf('Photokin uses ExifTool to read and edit');
    expect(introduction).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(introduction);
    expect(explanation).toBeGreaterThan(card);
  });

  it('allows browsing without ExifTool but disables Continue while checking', () => {
    expectContinueDisabled(markup(), false);
    mocks.loading = true;
    expectContinueDisabled(markup(), true);
  });

  it('keeps Continue disabled throughout installation and the subsequent status refresh', async () => {
    let complete: (() => void) | undefined;
    let update: ((progress: ExiftoolInstallProgress) => void) | undefined;
    mocks.install.mockImplementation(
      (onProgress: typeof update) =>
        new Promise<void>((resolve) => {
          update = onProgress;
          complete = resolve;
        }),
    );
    markup();
    mocks.card!.onInstall();
    expectContinueDisabled(markup(), true);
    expect(mocks.card!.status).toBe('installing');

    for (const stage of ['downloading', 'unpacking', 'checking'] as const) {
      update!({ stage, version: '13.59', percent: stage === 'checking' ? null : 62 });
      expectContinueDisabled(markup(), true);
      expect(mocks.card!.progress?.stage).toBe(stage);
    }

    complete!();
    await vi.waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
    expectContinueDisabled(markup(), true);
    expect(mocks.card!.status).toBe('checking');

    mocks.loading = false;
    mocks.dependencies = [
      {
        id: 'exiftool',
        displayName: 'ExifTool',
        version: '13.59',
        location: 'C:\\tools\\exiftool.exe',
        available: true,
        error: null,
      },
    ];
    expectContinueDisabled(markup(), false);
    expect(mocks.card!.status).toBe('ready');
    mocks.card!.onOpenFolder();
    await vi.waitFor(() => expect(mocks.openFolder).toHaveBeenCalledWith('C:\\tools\\exiftool.exe'));
  });

  it('surfaces installation failures and retries the installation', async () => {
    mocks.install.mockRejectedValueOnce(new Error('Connection interrupted'));
    markup();
    mocks.card!.onInstall();
    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    const html = markup();
    expectContinueDisabled(html, false);
    expect(html).toContain('Connection interrupted');
    expect(mocks.card!.status).toBe('error');

    mocks.install.mockResolvedValueOnce(undefined);
    mocks.card!.onRetry();
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
    expectContinueDisabled(markup(), true);
  });

  it('rechecks status instead of downloading when a dependency check fails', () => {
    mocks.error = 'Could not check dependencies';
    expect(markup()).toContain('Could not check dependencies');
    mocks.card!.onRetry();
    expect(mocks.reload).toHaveBeenCalledOnce();
    expect(mocks.install).not.toHaveBeenCalled();
    expectContinueDisabled(markup(), true);
  });

  it('restores optional browsing after cancelling manual selection', async () => {
    mocks.locate.mockResolvedValueOnce(false);
    markup();
    mocks.card!.onLocate();
    expectContinueDisabled(markup(), true);
    await vi.waitFor(() => {
      expectContinueDisabled(markup(), false);
    });
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('retries manual selection after an invalid executable, without downloading', async () => {
    mocks.locate.mockRejectedValueOnce(new Error('Select exiftool.exe'));
    markup();
    mocks.card!.onLocate();
    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(markup()).toContain('Select exiftool.exe');

    mocks.locate.mockResolvedValueOnce(true);
    mocks.card!.onRetry();
    await vi.waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
    expect(mocks.locate).toHaveBeenCalledTimes(2);
    expect(mocks.install).not.toHaveBeenCalled();
    expectContinueDisabled(markup(), true);
  });
});
