import {
  IconAdjustmentsHorizontal,
  IconBox,
  IconEye,
  IconFileDescription,
  IconFolder,
  IconInfoCircle,
} from '@tabler/icons-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import clsx from 'clsx';
import { useEffect } from 'react';
import { useNavigate, useOutlet } from 'react-router-dom';
import { AppRoutes } from '@/router';
import { SettingsTitleBar } from '../../components/settings/SettingsTitleBar';
import { Button } from '../../components/ui/button';
import { AppToaster } from '../../components/ui/toaster';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { SettingsTab, useSettingsStore } from '../../stores/settingsStore';
import { SettingsAbout } from './SettingsAbout';
import { SettingsGeneral } from './SettingsGeneral';
import { SettingsLibrary } from './SettingsLibrary';
import { SettingsMetadata } from './SettingsMetadata';
import { SettingsSystem } from './SettingsSystem';
import { SettingsViewer } from './SettingsViewer';
import './settings.css';

const SETTINGS_TABS = [
  { tab: SettingsTab.General, label: 'General', Icon: IconAdjustmentsHorizontal, Page: SettingsGeneral },
  { tab: SettingsTab.Viewer, label: 'Viewer', Icon: IconEye, Page: SettingsViewer },
  { tab: SettingsTab.Library, label: 'Library', Icon: IconFolder, Page: SettingsLibrary },
  { tab: SettingsTab.Metadata, label: 'Metadata', Icon: IconFileDescription, Page: SettingsMetadata },
  { tab: SettingsTab.System, label: 'System', Icon: IconBox, Page: SettingsSystem },
  { tab: SettingsTab.About, label: 'About', Icon: IconInfoCircle, Page: SettingsAbout },
] as const;

export function SettingsPage() {
  const tabIndex = useSettingsStore((state) => state.tabIndex);
  const setTabIndex = useSettingsStore((state) => state.setTabIndex);
  const outlet = useOutlet();
  const navigate = useNavigate();
  // Sub-pages (the model list) live under System.
  const activeTab =
    SETTINGS_TABS.find((tab) => tab.tab === (outlet ? SettingsTab.System : tabIndex)) ?? SETTINGS_TABS[0];

  const openTab = (tab: SettingsTab) => {
    setTabIndex(tab);
    if (outlet) navigate(AppRoutes.settings);
  };

  useEffect(() => {
    const appWindow = getCurrentWindow();
    void appWindow.show();
    void appWindow.setFocus();

    const preventWindowScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('scroll', preventWindowScroll);
    return () => window.removeEventListener('scroll', preventWindowScroll);
  }, []);

  return (
    <div className="settings-page">
      <AppToaster />
      <SettingsTitleBar
        title="Settings"
        breadcrumbs={[
          { label: 'Settings', onClick: () => openTab(SettingsTab.General) },
          { label: activeTab.label, onClick: () => openTab(activeTab.tab) },
          ...(outlet ? [{ label: 'Smart search models' }] : []),
        ]}
      />

      <div className="settings-body">
        <nav className="settings-sidebar" aria-label="Settings sections">
          {SETTINGS_TABS.map(({ tab, label, Icon }) => (
            <Tooltip key={tab}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className={clsx(
                    'settings-tab-button justify-start gap-2.5 px-2.5',
                    activeTab.tab === tab && 'settings-tab-button-active',
                  )}
                  aria-label={label}
                  aria-current={activeTab.tab === tab ? 'page' : undefined}
                  onClick={() => openTab(tab)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="settings-tab-label">{label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="settings-tab-tooltip">
                {label}
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>

        <main className="settings-content">
          <div className="settings-content__inner">{outlet ?? <activeTab.Page />}</div>
        </main>
      </div>
    </div>
  );
}
