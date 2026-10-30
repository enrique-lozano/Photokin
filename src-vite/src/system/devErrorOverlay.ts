/**
 * Dev-only crash screen.
 *
 * An uncaught error (module evaluation, React render, rejected promise) leaves
 * the WebView with an empty `#root`, which reads as a black window with no clue
 * about what broke because there is no visible console. This paints the error
 * and its stack on top of the app instead. Installed as an import side effect
 * so it is listening before the rest of the module graph evaluates.
 */

const OVERLAY_ID = 'dev-error-overlay';
const MAX_ENTRIES = 10;

function _button(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  button.style.cssText =
    'font:inherit;padding:2px 10px;border:1px solid #f87171;border-radius:4px;background:#7f1d1d;color:#fff;cursor:pointer;';
  button.addEventListener('click', onClick);
  return button;
}

function _overlayBody(): HTMLElement {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) return existing.lastElementChild as HTMLElement;

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;background:#180b0b;color:#fecaca;font:12px/1.6 ui-monospace,Consolas,monospace;';

  const header = document.createElement('div');
  header.style.cssText =
    'display:flex;align-items:center;gap:8px;padding:10px 12px;background:#450a0a;color:#fee2e2;font-weight:600;';
  const title = document.createElement('span');
  title.textContent = 'Photokin crashed (dev build)';
  title.style.cssText = 'flex:1;';
  header.append(
    title,
    _button('Reload', () => location.reload()),
    _button('Dismiss', () => overlay.remove()),
  );

  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow:auto;padding:12px;user-select:text;';

  overlay.append(header, body);
  document.body.append(overlay);
  return body;
}

function _describe(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  return String(value);
}

function _report(kind: string, value: unknown): void {
  const body = _overlayBody();
  if (body.childElementCount >= MAX_ENTRIES) return;

  const entry = document.createElement('pre');
  entry.style.cssText = 'margin:0 0 14px;white-space:pre-wrap;word-break:break-word;';
  entry.textContent = `${kind}\n${_describe(value)}`;
  body.append(entry);
}

if (import.meta.env.DEV) {
  window.addEventListener('error', (event) => {
    // Benign browser notice (a layout change inside a ResizeObserver callback,
    // e.g. popup positioning); nothing is lost, so it is not a crash.
    if (event.message.startsWith('ResizeObserver loop')) return;
    _report('Uncaught error', event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => _report('Unhandled rejection', event.reason));
}
