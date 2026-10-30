import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LightboxFilmstrip } from './LightboxFilmstrip';

const mocks = vi.hoisted(() => ({
  effect: vi.fn(),
  setSrc: vi.fn(),
  revision: 0,
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: mocks.effect,
  useState: (initial: unknown) => [initial, mocks.setSrc],
}));
vi.mock('@/db/api/services/assets.service', () => ({
  AssetsService: { getByUUID: async (id: string) => ({ id }) },
}));
vi.mock('@/media/thumbnails/thumbnail', () => ({
  resolveThumbnailPath: async () => 'thumbnail.jpg',
}));
vi.mock('@/system/diskManager', () => ({
  pathToImageSrc: (path: string) => `asset://localhost/${path}`,
}));
vi.mock('@/hooks/useHorizontalWheelScroll', () => ({ useHorizontalWheelScroll: vi.fn() }));
vi.mock('@/stores/appState', () => ({
  useAppStore: (selector: (state: { assetRevisions: Record<string, number> }) => unknown) =>
    selector({ assetRevisions: { original: mocks.revision } }),
}));

function _renderAndRunEffects() {
  renderToStaticMarkup(
    <LightboxFilmstrip assetIds={['original']} currentId="original" onSelect={() => {}} />,
  );
  for (const [effect] of mocks.effect.mock.calls) effect();
}

describe('filmstrip thumbnail refresh after replacing an original', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revision = 0;
  });

  it('versions the thumbnail URL using the existing per-asset revision', async () => {
    _renderAndRunEffects();
    await vi.waitFor(() =>
      expect(mocks.setSrc).toHaveBeenLastCalledWith('asset://localhost/thumbnail.jpg?v=0'),
    );
  });

  it('re-resolves the same thumbnail path when the edited asset revision changes', async () => {
    mocks.revision = 1;
    _renderAndRunEffects();
    expect(mocks.effect).toHaveBeenCalledWith(expect.any(Function), ['original', 1]);
    await vi.waitFor(() =>
      expect(mocks.setSrc).toHaveBeenLastCalledWith('asset://localhost/thumbnail.jpg?v=1'),
    );
  });
});
