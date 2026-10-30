// Regenerates the README/website screenshots from the real app (Windows only):
// starts it on a fresh demo library, captures every screen in `config.mjs`,
// renders the slides in `slides/` and closes the app again.
//
//   pnpm screenshots            the whole thing (takes a few minutes)
//   pnpm screenshots --slides   only re-render the slides from the last captures
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { resetProfile, startApp, stopApp } from '../dev-profile.mjs';
import {
  APP_URL,
  BASE_SETTINGS,
  CAPTURES_DIR,
  DEBUG_PORT,
  DEMO_DIR,
  EMPTY_ALBUM_DIRS,
  HERO_PHOTOS,
  LOCALE,
  OUTPUT_DIR,
  PROFILE,
  ROOT,
  SHOTS,
  THEMES,
  VIEWPORT,
} from './config.mjs';

// Dev-only and random UI that should never appear in published screenshots.
const HIDE_CSS = `
  .Toastify,
  .support-project-badge,
  button[title^="Open component gallery"] { display: none !important; }
  * { caret-color: transparent !important; }
`;

const log = (message) => console.log(`[screenshots] ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const logDuration = (phase, startedAt) =>
  log(`${phase}: ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);

async function _waitFor(check, { timeoutMs, intervalMs = 1000, what }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check().catch(() => undefined);
    if (result) return result;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

async function _isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => server.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

/** Runs a function of the app's own modules inside the app window (dev build only). */
function _inApp(page, fn, arg) {
  return page.evaluate(fn, arg);
}

async function _applySettings(page, settings) {
  await _inApp(
    page,
    async (values) => {
      const { useSettingsStore } = await import('/src/stores/settingsStore.ts');
      useSettingsStore.setState(values);
    },
    settings,
  );
  await sleep(400);
}

async function _waitUntilIdle(page) {
  let quietChecks = 0;
  await _waitFor(
    async () => {
      const running = await _inApp(page, async () => {
        const { selectActiveProcesses, useProcessStore } = await import('/src/stores/processStore.ts');
        return selectActiveProcesses(useProcessStore.getState().processes).length;
      });
      quietChecks = running === 0 ? quietChecks + 1 : 0;
      return quietChecks >= 4;
    },
    { timeoutMs: 15 * 60_000, what: 'imports and indexing to finish' },
  );
}

async function _settle(page, shot, ms) {
  await page.waitForLoadState('load');
  await page
    .locator(shot.readySelector ?? '#root .photo-open-button')
    .first()
    .waitFor({ timeout: 120_000 });
  await page.addStyleTag({ content: HIDE_CSS });
  await page.waitForFunction(
    () =>
      !document.querySelector('.photo-in-gallery-skeleton, .search-loading') &&
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    null,
    { timeout: 30_000, polling: 250 },
  );
  await page.waitForTimeout(ms);
}

async function captureApp() {
  for (const port of [1420, DEBUG_PORT]) {
    if (!(await _isPortFree(port))) {
      throw new Error(`Port ${port} is in use. Close any running Photokin dev app first.`);
    }
  }
  await mkdir(CAPTURES_DIR, { recursive: true });
  await Promise.all(EMPTY_ALBUM_DIRS.map((folder) => mkdir(folder, { recursive: true })));
  await resetProfile(PROFILE);

  const appLog = join(CAPTURES_DIR, 'app.log');
  log(`Starting the app on a fresh "${PROFILE}" library (log: ${appLog})…`);
  const startupStartedAt = performance.now();
  const app = startApp(PROFILE, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      VITE_PHOTOKIN_LOCALE: LOCALE,
      // `--lang` sets the WebView's default locale, which the app uses for dates and numbers.
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${DEBUG_PORT} --lang=${LOCALE}`,
    },
  });
  const logStream = createWriteStream(appLog);
  app.stdout.pipe(logStream);
  app.stderr.pipe(logStream);

  let browser;
  try {
    await _waitFor(
      async () => {
        if (app.exitCode !== null) throw new Error(`The app exited early, see ${appLog}`);
        return (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok;
      },
      { timeoutMs: 20 * 60_000, intervalMs: 2000, what: 'the app to start (first builds take a while)' },
    );
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
    const page = await _waitFor(
      async () =>
        browser
          .contexts()
          .flatMap((context) => context.pages())
          .find((candidate) => candidate.url().startsWith(APP_URL)),
      { timeoutMs: 60_000, what: 'the main window' },
    );
    await page.waitForFunction(() => document.getElementById('root')?.childElementCount, null, {
      timeout: 60_000,
    });
    logDuration('App startup', startupStartedAt);
    const pageErrors = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
      log(`App error: ${error.message}`);
    });

    const cdp = await page.context().newCDPSession(page);
    const savedSettings = await page.evaluate(() => localStorage.getItem('photokin-settings'));

    try {
      log('Importing demo/showcase…');
      const importStartedAt = performance.now();
      await _inApp(
        page,
        async (folders) => {
          const { AppDataKey, AppDataService } = await import('/src/db/api/services/appData.service.ts');
          const { RootAlbumsService } = await import('/src/db/api/services/rootAlbums.service.ts');
          const { TagsService } = await import('/src/db/api/services/tags.service.ts');
          await AppDataService.set(AppDataKey.OnboardingCompleted, 'true');
          await RootAlbumsService.addDirectories(folders);
          // Favorites live in the library, not in the files.
          const favorites = await TagsService.findByNamesOrPaths([
            'Trips/Japan 2023',
            'Trips/Kenya 2025',
            'Space/Artemis II',
          ]);
          for (const tag of favorites) await TagsService.setFavorite(tag.id, true);
        },
        [DEMO_DIR, ...EMPTY_ALBUM_DIRS],
      );
      await page.goto(`${APP_URL}/albums`);
      await _applySettings(page, BASE_SETTINGS);
      log('Waiting for thumbnails and smart search indexing…');
      await _waitUntilIdle(page);
      logDuration('Import and indexing', importStartedAt);

      const captureStartedAt = performance.now();
      let previousShot;
      for (const shot of SHOTS) {
        pageErrors.length = 0;
        log(`Capturing ${shot.name}…`);
        const url = `${APP_URL}${shot.route}`;
        if (!(shot.theme && previousShot?.theme && previousShot.route === shot.route && page.url() === url)) {
          await page.goto(url);
        }
        await cdp.send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, mobile: false });
        await _applySettings(page, { ...BASE_SETTINGS, ...(shot.theme ? THEMES[shot.theme] : {}) });
        if (shot.prepare) await shot.prepare(page);
        await _settle(page, shot, shot.settleMs ?? 1500);
        if (shot.waitUntilGone) {
          await page.waitForFunction((text) => !document.body.innerText.includes(text), shot.waitUntilGone, {
            timeout: 120_000,
            polling: 500,
          });
          await _settle(page, shot, 1500);
        }
        if (pageErrors.length) throw new Error(`${shot.name}: ${pageErrors.join('; ')}`);
        if (await page.getByText("Smart search isn't working right now", { exact: false }).count()) {
          throw new Error(`${shot.name}: smart search failed; check the search model and CLIP sidecar`);
        }
        // Park the cursor in an empty corner so no hover state is captured.
        await page.mouse.move(VIEWPORT.width - 10, VIEWPORT.height - 60);
        await page.waitForTimeout(400);
        // An explicit CDP clip honors the emulated pixel ratio instead of Windows display scaling.
        const { data } = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height, scale: 1 },
        });
        await writeFile(join(CAPTURES_DIR, `${shot.name}.png`), Buffer.from(data, 'base64'));
        log(`✓ ${shot.name}`);
        previousShot = shot;
      }
      logDuration('App captures', captureStartedAt);
    } finally {
      await page.evaluate((value) => {
        if (value) localStorage.setItem('photokin-settings', value);
      }, savedSettings);
    }
  } finally {
    await browser?.close().catch(() => {});
    stopApp(app);
    logStream.end();
  }
}

const TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

async function toWebp(page, image, squareSize) {
  return Buffer.from(
    await page.evaluate(
      async ({ base64, squareSize }) => {
        const bitmap = await createImageBitmap(
          new Blob([Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))]),
        );
        const canvas = new OffscreenCanvas(squareSize ?? bitmap.width, squareSize ?? bitmap.height);
        const side = Math.min(bitmap.width, bitmap.height);
        if (squareSize) {
          canvas
            .getContext('2d')
            .drawImage(
              bitmap,
              (bitmap.width - side) / 2,
              (bitmap.height - side) / 2,
              side,
              side,
              0,
              0,
              squareSize,
              squareSize,
            );
        } else {
          canvas.getContext('2d').drawImage(bitmap, 0, 0);
        }
        bitmap.close();
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      },
      { base64: image.toString('base64'), squareSize },
    ),
    'base64',
  );
}

async function exportSlides() {
  // Fonts and captures can't be loaded from a file:// page, so serve the repo locally.
  const server = createServer(async (request, response) => {
    const path = normalize(join(ROOT, decodeURIComponent(new URL(request.url, 'http://x').pathname)));
    const file = path.endsWith(sep) ? join(path, 'index.html') : path;
    if (!file.startsWith(ROOT) || !(await stat(file).catch(() => null))?.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/scripts/screenshots/slides/`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every((image) => image.complete));

    await mkdir(OUTPUT_DIR, { recursive: true });
    for (const slide of await page.locator('.slide').all()) {
      const file = await slide.getAttribute('data-file');
      const png = await slide.screenshot({ type: 'png' });
      await writeFile(join(OUTPUT_DIR, `${file}.webp`), await toWebp(page, png));
      log(`✓ ${file}.webp`);
    }

    const appOutput = join(OUTPUT_DIR, 'app');
    await mkdir(appOutput, { recursive: true });
    for (const shot of SHOTS) {
      const png = await readFile(join(CAPTURES_DIR, `${shot.name}.png`));
      await writeFile(join(appOutput, `${shot.name}.webp`), await toWebp(page, png));
      log(`✓ app/${shot.name}.webp`);
    }

    const memoriesOutput = join(ROOT, 'website', '.vitepress', 'theme', 'assets', 'memories');
    await mkdir(memoriesOutput, { recursive: true });
    for (const photo of HERO_PHOTOS) {
      const image = await readFile(join(DEMO_DIR, `${photo}.jpg`));
      await writeFile(join(memoriesOutput, `${photo}.webp`), await toWebp(page, image, 640));
      log(`✓ memories/${photo}.webp`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

if (process.platform !== 'win32') {
  console.error('Screenshots attach to the app through WebView2 remote debugging, which is Windows-only.');
  process.exit(1);
}

try {
  const startedAt = performance.now();
  if (!process.argv.includes('--slides')) await captureApp();
  const exportStartedAt = performance.now();
  await exportSlides();
  logDuration('Slide and image exports', exportStartedAt);
  logDuration('Total', startedAt);
  log(`Done. Slides and unframed app captures are in ${OUTPUT_DIR}`);
} catch (error) {
  console.error(`[screenshots] ${error.message}`);
  process.exit(1);
}
