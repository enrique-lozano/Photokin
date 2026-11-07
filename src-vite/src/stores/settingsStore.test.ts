import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
});

import { DEFAULT_SETTINGS, useSettingsStore } from './settingsStore';
import { DEFAULT_NAVIGATION_PAGES } from '@/common/navigationPages';

beforeEach(() => {
  useSettingsStore.setState(DEFAULT_SETTINGS);
});

describe('navigation settings', () => {
  it('defaults to all main pages in the original order', () => {
    expect(useSettingsStore.getState().navigationPages).toEqual(DEFAULT_NAVIGATION_PAGES);
  });

  it('persists order and visibility across rehydration', async () => {
    const pages = [...DEFAULT_NAVIGATION_PAGES].reverse().map((page) => ({
      ...page,
      visible: page.id !== 'albums',
    }));
    useSettingsStore.getState().setNavigationPages(pages);
    const saved = storage.get('photokin-settings')!;
    expect(JSON.parse(saved).state.navigationPages).toEqual(pages);

    useSettingsStore.setState(DEFAULT_SETTINGS);
    storage.set('photokin-settings', saved);
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().navigationPages).toEqual(pages);
  });

  it('restores defaults for older or malformed saved settings', () => {
    const merge = useSettingsStore.persist.getOptions().merge!;
    for (const persisted of [{ font: 1 }, { navigationPages: null }, { navigationPages: 'invalid' }]) {
      expect(merge(persisted, useSettingsStore.getState()).navigationPages).toEqual(DEFAULT_NAVIGATION_PAGES);
    }
  });

  it('enforces at least one visible page on writes and rehydration', () => {
    const hidden = DEFAULT_NAVIGATION_PAGES.map((page) => ({ ...page, visible: false }));
    useSettingsStore.getState().setNavigationPages(hidden);
    expect(useSettingsStore.getState().navigationPages.filter(({ visible }) => visible)).toHaveLength(1);
    const merge = useSettingsStore.persist.getOptions().merge!;
    expect(
      merge({ navigationPages: hidden }, useSettingsStore.getState()).navigationPages.filter(
        ({ visible }) => visible,
      ),
    ).toHaveLength(1);
  });
});

describe('viewer settings', () => {
  it('defaults to autoplay, no looping, wheel navigation, and visible descriptions', () => {
    expect(useSettingsStore.getState()).toMatchObject({
      autoPlayVideo: true,
      loopVideo: false,
      viewerMouseWheel: 'navigate',
      showPhotoDescription: true,
    });
  });

  it('persists viewer changes and restores them on rehydration', async () => {
    const state = useSettingsStore.getState();
    state.setAutoPlayVideo(false);
    state.setLoopVideo(true);
    state.setViewerMouseWheel('zoom');
    state.setShowPhotoDescription(false);

    const saved = storage.get('photokin-settings')!;
    expect(JSON.parse(saved).state).toMatchObject({
      autoPlayVideo: false,
      loopVideo: true,
      viewerMouseWheel: 'zoom',
      showPhotoDescription: false,
    });

    useSettingsStore.setState(DEFAULT_SETTINGS);
    storage.set('photokin-settings', saved);
    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState()).toMatchObject({
      autoPlayVideo: false,
      loopVideo: true,
      viewerMouseWheel: 'zoom',
      showPhotoDescription: false,
    });
  });

  it('keeps viewer defaults when older saved settings lack them', () => {
    const merge = useSettingsStore.persist.getOptions().merge!;
    expect(merge({ font: 1 }, useSettingsStore.getState())).toMatchObject({
      font: 1,
      autoPlayVideo: true,
      loopVideo: false,
      viewerMouseWheel: 'navigate',
      showPhotoDescription: true,
    });
  });

  it('rejects invalid persisted viewer values', () => {
    const merge = useSettingsStore.persist.getOptions().merge!;
    expect(
      merge(
        {
          autoPlayVideo: 'true',
          loopVideo: 1,
          viewerMouseWheel: 'invalid',
          showPhotoDescription: 'false',
        },
        useSettingsStore.getState(),
      ),
    ).toMatchObject({
      autoPlayVideo: true,
      loopVideo: false,
      viewerMouseWheel: 'navigate',
      showPhotoDescription: true,
    });
  });
});
