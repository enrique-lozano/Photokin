import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Photos imported into the screenshot library. They carry all their metadata. */
export const DEMO_DIR = join(ROOT, 'demo', 'showcase');

export const HERO_PHOTOS = ['japan-fushimi-inari', 'kenya-giraffes', 'iceland-puffin', 'norway-reine'];

/** Raw app captures and the app log. Regenerated on every run, never committed. */
export const CAPTURES_DIR = join(ROOT, 'node_modules', '.cache', 'photokin-screenshots');

/** Empty real folders imported only into the screenshot profile. */
export const EMPTY_ALBUM_DIRS = ['Family', 'Projects', 'Weekends', 'To organize'].map((name) =>
  join(CAPTURES_DIR, 'albums', name),
);

/** Promotional slides, with unframed website captures in the `app` subfolder. */
export const OUTPUT_DIR = join(ROOT, 'website', 'public', 'screenshots');

export const PROFILE = 'screenshots';
export const DEBUG_PORT = 9222;
export const APP_URL = 'http://localhost:1420';
export const LOCALE = 'en-US';

/** Logical size of the captured window; `deviceScaleFactor` keeps text crisp in the slides. */
export const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };

/** Settings applied before capturing (see `stores/settingsStore.ts`). */
export const BASE_SETTINGS = {
  appearance: 1,
  lightTheme: 0,
  darkTheme: 0,
  scale: 1,
  font: 0,
  timelineGroupBy: 'month',
};

/** Theme variants for the "themes" slide. Indexes match `THEME_OPTIONS` in `utils/theme.ts`. */
export const THEMES = {
  'theme-photokin-light': { appearance: 0, lightTheme: 0 },
  'theme-photokin-dark': { appearance: 1, darkTheme: 0 },
  'theme-slack-light': { appearance: 0, lightTheme: 1 },
  'theme-slack-dark': { appearance: 1, darkTheme: 1 },
  'theme-spotify-light': { appearance: 0, lightTheme: 4 },
  'theme-spotify-dark': { appearance: 1, darkTheme: 4 },
};

const openFirstPhoto = async (page) => {
  await page.locator('.photo-open-button').first().click();
  await page.keyboard.press('i');
};

/**
 * Screens to capture. `route` is opened first, then `prepare` (if any) runs;
 * `readySelector` overrides the default gallery-photo readiness check.
 * `theme` applies one of {@link THEMES} for that capture.
 */
export const SHOTS = [
  { name: 'albums', route: '/albums' },
  { name: 'people', route: '/people/all', readySelector: '.face-card img' },
  {
    name: 'places',
    route: '/places',
    // Map pins load real map tiles, so give them time to arrive.
    prepare: (page) => page.locator('.places-map').getByRole('button', { name: 'Map', exact: true }).click(),
    readySelector: '.places-map .photo-map-pin',
    settleMs: 6000,
  },
  {
    name: 'search',
    route: `/search?q=${encodeURIComponent('safari animals')}`,
    waitUntilGone: 'Searching',
  },
  { name: 'tags', route: '/tags/all', readySelector: '.tag-card__main .tag-cover__img' },
  { name: 'calendar', route: '/calendar' },
  {
    name: 'viewer',
    route: `/search?q=${encodeURIComponent('filename~japan-fushimi-inari')}`,
    prepare: openFirstPhoto,
  },
  ...Object.keys(THEMES).map((theme) => ({ name: theme, route: '/albums', theme })),
];
