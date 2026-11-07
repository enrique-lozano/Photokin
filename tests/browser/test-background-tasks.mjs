// Run against an existing Vite dev server: node tests/browser/test-background-tasks.mjs
// Uses the real task UI with in-memory jobs, without opening the library or native sidecars.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:1420';
const browser = await chromium.launch({ channel: 'msedge', headless: true });

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/src/main.tsx*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        import React from '/node_modules/.vite/deps/react.js';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import '/src/App.css?import';
        import '/src/styles/variables/colors.css?import';
        import { ProcessFooterIndicator } from '/src/components/process-center/ProcessFooterIndicator.tsx';
        import { ProcessWarningsDialog } from '/src/components/process-center/ProcessWarningsDialog.tsx';
        import { AppToaster } from '/src/components/ui/toaster.tsx';
        ReactDOM.createRoot(document.getElementById('root')).render(
          React.createElement(React.Fragment, null,
            React.createElement('button', { id: 'outside' }, 'Outside'),
            React.createElement(ProcessFooterIndicator, {
              renderIndicators: (process, notification) => React.createElement('div', {
                style: { position: 'fixed', bottom: 0, left: 16, right: 16, display: 'flex', justifyContent: 'space-between' }
              }, React.createElement('div', null, process), notification)
            }),
            React.createElement(ProcessWarningsDialog),
            React.createElement(AppToaster)
          )
        );
      `,
    }),
  );
  await page.goto(`${url}/components`);
  const chip = () => page.getByRole('button', { name: /^Background tasks/ });
  const currentTask = () => page.getByRole('button', { name: /^Current task:/ });
  const popover = () => page.getByRole('dialog', { name: 'Background tasks', exact: true });

  await chip().focus();
  await page.keyboard.press('Enter');
  await popover().getByText('No recent background tasks').waitFor();
  assert.equal(await popover().evaluate((element) => getComputedStyle(element).padding), '0px');
  await page.keyboard.press('Escape');
  await popover().waitFor({ state: 'hidden' });
  assert.equal(await chip().evaluate((element) => element === document.activeElement), true);
  assert.equal(await chip().locator('.process-footer-indicator-dot').count(), 0);
  console.log('PASS: idle icon, keyboard opening, zero padding, Escape, focus return');

  await page.evaluate(async () => {
    const { trackProcess } = await import('/src/system/processTracker.ts');
    void trackProcess(
      { kind: 'generic', title: 'Test indexing', canPause: true, canStop: true },
      async (reporter) => {
        reporter.setProgress(4, 10, 'photos');
        while (true) {
          await reporter.waitIfPaused();
          await new Promise((resolve) => setTimeout(resolve, 50));
          reporter.throwIfStopped();
        }
      },
    ).catch((error) => {
      if (error.name !== 'ProcessStoppedError') throw error;
    });
  });
  const bellBounds = await chip().boundingBox();
  await currentTask().click();
  await currentTask().waitFor({ state: 'hidden' });
  await popover().waitFor();
  await popover().evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const processOpenedBounds = await popover().boundingBox();
  assert.ok(Math.abs(processOpenedBounds.x + processOpenedBounds.width - bellBounds.x - bellBounds.width) <= 1);
  await popover().getByRole('button', { name: 'Close background tasks' }).click();
  await currentTask().waitFor();
  await chip().click();
  await popover().evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const bellOpenedBounds = await popover().boundingBox();
  assert.ok(Math.abs(processOpenedBounds.x - bellOpenedBounds.x) <= 1);
  assert.ok(Math.abs(processOpenedBounds.y - bellOpenedBounds.y) <= 1);
  await currentTask().waitFor({ state: 'hidden' });
  assert.equal(await popover().getByRole('progressbar').getAttribute('aria-valuenow'), '4');
  await popover().getByRole('button', { name: 'Pause Test indexing' }).click();
  await popover().getByRole('button', { name: 'Resume Test indexing' }).waitFor();
  await popover().getByRole('button', { name: 'Close background tasks' }).click();
  await page.getByRole('button', { name: /^Current task: Paused/ }).waitFor();
  await chip().click();
  for (const name of ['Resume Test indexing', 'Cancel Test indexing']) {
    const control = popover().getByRole('button', { name });
    assert.equal(await control.innerText(), '');
    assert.ok(await control.getAttribute('title'));
  }
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press('Tab');
    assert.equal(await popover().evaluate((element) => element.contains(document.activeElement)), true);
  }
  await popover().getByRole('button', { name: 'Resume Test indexing' }).click();
  await page.evaluate(async () => {
    const { trackProcess } = await import('/src/system/processTracker.ts');
    await trackProcess(
      { kind: 'generic', title: 'Test completed task', successMessage: 'Search indexing complete' },
      async () => undefined,
    );
  });
  const completedRow = popover().getByRole('listitem').filter({ hasText: 'Test completed task' });
  await completedRow.getByRole('button', { name: 'Dismiss Test completed task' }).waitFor();
  assert.equal(await completedRow.getByRole('progressbar').count(), 0);
  await completedRow.getByText('Search indexing complete', { exact: true }).waitFor();
  const completedLayout = await completedRow.evaluate((element) => {
    const heading = element.querySelector('.process-task__heading');
    const state = element.querySelector('.process-task__state');
    const headingRect = heading.getBoundingClientRect();
    const stateRect = state.getBoundingClientRect();
    return {
      inline: stateRect.top >= headingRect.top && stateRect.bottom <= headingRect.bottom,
      height: element.getBoundingClientRect().height,
    };
  });
  assert.equal(completedLayout.inline, true);
  assert.ok(completedLayout.height <= 70, `Finished row should fit two compact lines: ${JSON.stringify(completedLayout)}`);
  await popover().getByRole('button', { name: 'Clear finished' }).click();
  await completedRow.waitFor({ state: 'hidden' });
  await page.locator('.Toastify__toast--success').getByText('Test completed task').waitFor({ state: 'hidden' });
  await popover().getByRole('button', { name: 'Pause Test indexing' }).waitFor();
  await popover().getByRole('button', { name: 'Cancel Test indexing' }).click();
  await popover().locator('.process-task__state').filter({ hasText: 'Stopped' }).waitFor();
  assert.equal(await popover().getByRole('progressbar').count(), 0);
  await page.keyboard.press('Escape');
  await popover().waitFor({ state: 'hidden' });
  assert.equal(await chip().getByRole('progressbar').count(), 0);
  assert.equal(await currentTask().count(), 0);
  assert.equal(await chip().locator('.process-footer-indicator-dot').count(), 1);
  console.log('PASS: live counts, Pause/Resume/Cancel, focus trapping, compact finished state');

  await page.evaluate(async () => {
    const { trackProcess } = await import('/src/system/processTracker.ts');
    await trackProcess(
      { kind: 'generic', title: 'Test partial import', getWarnings: () => ['Test file was unreadable'] },
      async () => undefined,
    );
  });
  await page.locator('.Toastify__toast--warning').getByRole('button', { name: 'View details' }).waitFor();
  await chip().click();
  await popover().getByRole('button', { name: 'View 1 skipped item' }).click();
  const warningDialog = page.getByRole('dialog', { name: 'Test partial import', exact: true });
  await warningDialog.getByText('Test file was unreadable').waitFor();
  await popover().waitFor({ state: 'hidden' });
  assert.equal(await warningDialog.evaluate((element) => element.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await warningDialog.waitFor({ state: 'hidden' });
  assert.equal(await chip().evaluate((element) => element === document.activeElement), true);
  console.log('PASS: warning notification, detail dialog, no competing popover focus trap');

  await page.evaluate(async () => {
    const { trackProcess } = await import('/src/system/processTracker.ts');
    await trackProcess(
      { kind: 'generic', title: 'Test failing sync', successMessage: false },
      async () => {
        throw new Error('Test disk unavailable');
      },
    ).catch((error) => {
      if (error.message !== 'Test disk unavailable') throw error;
    });
  });
  await page.locator('.Toastify__toast--error').getByText('Error: Test disk unavailable').waitFor();
  console.log('PASS: failure toast even when ordinary success notifications are disabled');

  await page.evaluate(async () => {
    const { trackProcess } = await import('/src/system/processTracker.ts');
    await trackProcess(
      {
        kind: 'generic',
        title: 'Test metadata edit',
        getSuccessAction: () => ({
          label: 'Undo test edit',
          onClick: () => document.body.setAttribute('data-undo-count', String(
            Number(document.body.getAttribute('data-undo-count') ?? 0) + 1,
          )),
        }),
      },
      async () => undefined,
    );
  });
  await page.locator('.Toastify__toast--success').getByRole('button', { name: 'Undo test edit' }).waitFor();
  await chip().click();
  await popover().getByRole('button', { name: 'Undo test edit' }).click();
  await popover().getByRole('button', { name: 'Undo test edit' }).waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await popover().waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Undo test edit' }).waitFor({ state: 'hidden' });
  assert.equal(await page.locator('body').getAttribute('data-undo-count'), '1');

  await chip().click();
  await popover().getByRole('button', { name: 'Dismiss Test metadata edit' }).click();
  await popover().getByText('Test metadata edit', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await popover().getByRole('progressbar').count(), 0);
  await page.setViewportSize({ width: 320, height: 640 });
  assert.equal(await popover().evaluate((element) => element.scrollWidth <= element.clientWidth), true);
  await popover().getByRole('button', { name: 'Clear finished' }).click();
  await popover().getByText('No recent background tasks').waitFor();
  await page.locator('.Toastify__toast--error').getByText('Error: Test disk unavailable').waitFor({ state: 'hidden' });
  assert.equal(await popover().getByRole('progressbar').count(), 0);
  await page.keyboard.press('Escape');
  await popover().waitFor({ state: 'hidden' });
  assert.equal(await chip().locator('.process-footer-indicator-dot').count(), 0);
  await page.evaluate(async () => {
    const { trackProcess } = await import('/src/system/processTracker.ts');
    const now = Date.now();
    const originalNow = Date.now;
    try {
      for (const [index, seconds] of [15, 60, 120, 3600, 86400, 604800, 2764800, 31536000].entries()) {
        Date.now = () => now - seconds * 1000;
        await trackProcess(
          { kind: 'generic', title: `Time example ${index}`, successMessage: false },
          async () => undefined,
        );
      }
    } finally {
      Date.now = originalNow;
    }
  });
  await chip().click();
  for (const [index, expected] of ['15s ago', '1min ago', '2min ago', '1h ago', '1d ago', '1w ago', '1mo ago', '1y ago'].entries()) {
    const row = popover().getByRole('listitem').filter({ hasText: `Time example ${index}` });
    const timestamp = row.locator('.process-task__state');
    await timestamp.waitFor();
    assert.ok((await timestamp.textContent()).endsWith(expected), `Expected timestamp: ${expected}`);
  }
  await popover().getByRole('button', { name: 'Clear finished' }).click();
  await page.keyboard.press('Escape');
  await popover().waitFor({ state: 'hidden' });
  await chip().click();
  await popover().evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await page.mouse.click(15, 100);
  await popover().waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('PASS: single-use Undo, dismiss one, clear finished without stopping active work, dot resets, no finished progress bars, outside-click dismissal, no browser errors');
} finally {
  await browser.close();
}
