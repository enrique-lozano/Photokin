// Keep first: installs the dev crash screen before any other module evaluates,
// so an error thrown on the way up is shown instead of an empty black window.
import './system/devErrorOverlay';

import { toast } from '@/components/ui/toast';
import { listen } from '@tauri-apps/api/event';
import { platform } from '@tauri-apps/plugin-os';
import ReactDOM from 'react-dom/client';
import { AppEntryPoint } from './App';
import { initImageEditorHost } from './system/imageEditorHost';

import './App.css';
import { TooltipProvider } from './components/ui/tooltip';
import { LightboxImageProvider } from './context/LightboxContext';
import { initSettings } from './hooks/useSettingsSync';
import './styles/components/popover.css';
import './styles/components/scrollbar.css';
import './styles/fonts';
import './styles/normalize.css';
import './styles/variables/colors.css';
import { initAppLocale } from './system/appLocale';
import { WIPE_USER_DATA_EVENT, WipeUserDataPayload, removeAllUserData } from './system/userData';

// Do not declare React components in this file. Vite's React plugin turns any
// module that declares one into a hot-update boundary, which would re-run this
// bootstrap (second React root, duplicate listeners) instead of reloading the
// page when an update reaches the entry.

initSettings();

// Lets CSS adapt the window chrome per OS, e.g. room for the macOS traffic lights.
document.documentElement.dataset.platform = platform();

// Suppress the WebView's own context menu so the app's menus are the only ones.
document.addEventListener('contextmenu', (event) => event.preventDefault());

const isAuxiliaryWindow =
  ['/settings', '/editor', '/components'].includes(window.location.pathname) ||
  window.location.pathname.startsWith('/settings/');

// The main window owns the live database connection, so it performs the wipe
// when the settings window requests it.
if (!isAuxiliaryWindow) {
  initImageEditorHost();
  void listen<WipeUserDataPayload>(WIPE_USER_DATA_EVENT, (event) => {
    removeAllUserData({ deleteAiModels: event.payload?.deleteAiModels === true }).catch((error) => {
      toast.error(`Could not remove user data: ${String(error)}`);
    });
  });
}

// Resolve the OS locale before the first render so localized display names
// (country names) are correct on first paint. Best-effort and quick; a failure
// just falls back to the WebView/persisted language.
void initAppLocale().finally(() => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <TooltipProvider delayDuration={250} skipDelayDuration={300}>
      <LightboxImageProvider>
        <AppEntryPoint isAuxiliaryWindow={isAuxiliaryWindow}></AppEntryPoint>
      </LightboxImageProvider>
    </TooltipProvider>,
  );
});
