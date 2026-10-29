import { SettingsButtonRow, SettingsGroup, SettingsRow } from '@/components/settings/SettingsRow';
import { SupportProjectFooter } from '@/components/support-project/SupportProject';
import { toast } from '@/components/ui/toast';
import {
  IconBook,
  IconBug,
  IconCode,
  IconCopy,
  IconFileText,
  IconInfoCircle,
  IconLock,
} from '@tabler/icons-react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { arch, platform, version } from '@tauri-apps/plugin-os';
import packageInfo from '../../../package.json';
import { SettingsExternalLink } from './SettingsExternalLink';
import { SettingsUpdates } from './SettingsUpdates';
import './settingsSection.css';

const REPOSITORY_URL = 'https://github.com/enrique-lozano/Photokin';
const PLATFORM_NAMES: Record<string, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

const PROJECT_LINKS = [
  { label: 'Source code', href: REPOSITORY_URL, Icon: IconCode },
  { label: 'Documentation', href: `${REPOSITORY_URL}#readme`, Icon: IconBook },
  { label: 'Report an issue', href: `${REPOSITORY_URL}/issues`, Icon: IconBug },
];

export function SettingsAbout() {
  const system = `${PLATFORM_NAMES[platform()] ?? platform()} ${version()} · ${arch()}`;

  const copySystemInfo = async () => {
    try {
      await writeText(`Photokin ${packageInfo.version}\n${system}`);
      toast.success('System info copied');
    } catch (error) {
      toast.error(`Could not copy system info: ${String(error)}`);
    }
  };

  return (
    <>
      <header className="settings-about-header">
        <img src="/photokin-app-icon.svg" alt="" className="settings-about-logo" draggable={false} />
        <div className="min-w-0">
          <h2 className="settings-about-name">
            Photokin <span className="settings-about-version">{packageInfo.version}</span>
          </h2>
          <p className="settings-about-description">
            An open-source photo gallery for organizing and exploring your collection.
          </p>
        </div>
      </header>

      <SettingsUpdates />

      <SettingsGroup title="This build">
        <SettingsRow icon={<IconFileText size={18} />} label="License" description={packageInfo.license}>
          <SettingsExternalLink
            href={`${REPOSITORY_URL}/blob/main/LICENSE`}
            label="Read license"
            appearance="button"
          />
        </SettingsRow>
        <SettingsButtonRow
          icon={<IconInfoCircle size={18} />}
          label="System"
          description={system}
          buttonLabel="Copy"
          buttonIcon={<IconCopy size={16} />}
          buttonAriaLabel="Copy system info"
          onAction={() => void copySystemInfo()}
        />
      </SettingsGroup>

      <SettingsGroup title="Project">
        {PROJECT_LINKS.map(({ label, href, Icon }) => (
          <SettingsRow key={href} icon={<Icon size={18} />} label={label}>
            <SettingsExternalLink href={href} label={label} appearance="icon" />
          </SettingsRow>
        ))}
        <SettingsRow
          icon={<IconLock size={18} />}
          label="Private by design"
          description="Everything stays on this computer."
        >
          <SettingsExternalLink
            href={`${REPOSITORY_URL}/blob/main/docs/PRIVACY_POLICY.md`}
            label="Privacy policy"
            appearance="icon"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Support">
        <SupportProjectFooter />
      </SettingsGroup>
    </>
  );
}
