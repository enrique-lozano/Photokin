import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSelectionShortcuts } from './useSelectionShortcuts';
import type { SelectionActionsApi } from './useSelectionActions';

const mocks = vi.hoisted(() => ({
  effect: vi.fn(),
  state: { comparisonPair: null as object | null, galleryContext: 'default' },
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: mocks.effect,
}));
vi.mock('@/stores/appState', () => ({
  useAppStore: { getState: () => mocks.state },
}));

const api = {
  comparePhotos: vi.fn(),
  moveToFolder: vi.fn(),
  copyImage: vi.fn(),
  rename: vi.fn(),
  openInExternalApp: vi.fn(),
  editTags: vi.fn(),
  removeTags: vi.fn(),
  rate: vi.fn(),
  toggleFavorite: vi.fn(),
  editDate: vi.fn(),
  editLocation: vi.fn(),
  reloadMetadata: vi.fn(),
  writeMetadata: vi.fn(),
  detectFaces: vi.fn(),
  recognizeFaces: vi.fn(),
  removeFaceData: vi.fn(),
  rotate: vi.fn(),
  trash: vi.fn(),
  restore: vi.fn(),
  deletePermanently: vi.fn(),
} satisfies SelectionActionsApi;

function _subscribe() {
  function Probe() {
    useSelectionShortcuts(api, true);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return mocks.effect.mock.lastCall?.[0]();
}

function _key(key: string, ctrlKey = false) {
  window.dispatchEvent(Object.assign(new Event('keydown'), { key, ctrlKey }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.comparisonPair = null;
  mocks.state.galleryContext = 'default';
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

describe('selection shortcut isolation during comparison', () => {
  it('blocks destructive and editing shortcuts even before the old effect is disposed', () => {
    const cleanup = _subscribe();
    mocks.state.comparisonPair = {};
    for (const key of ['Delete', 'Backspace', 'f']) _key(key);
    for (const key of ['d', 'g', 'm', 't']) _key(key, true);
    for (const action of Object.values(api)) expect(action).not.toHaveBeenCalled();
    cleanup?.();
  });

  it('resumes normal gallery actions after comparison closes', () => {
    const cleanup = _subscribe();
    mocks.state.comparisonPair = {};
    _key('Delete');
    mocks.state.comparisonPair = null;
    _key('Delete');
    _key('f');
    _key('t', true);
    expect(api.trash).toHaveBeenCalledOnce();
    expect(api.toggleFavorite).toHaveBeenCalledOnce();
    expect(api.editTags).toHaveBeenCalledOnce();
    cleanup?.();
  });

  it('preserves the original Trash shortcut behavior outside comparison', () => {
    mocks.state.galleryContext = 'trash';
    const cleanup = _subscribe();
    _key('Delete');
    expect(api.deletePermanently).toHaveBeenCalledOnce();
    expect(api.trash).not.toHaveBeenCalled();
    cleanup?.();
  });
});
