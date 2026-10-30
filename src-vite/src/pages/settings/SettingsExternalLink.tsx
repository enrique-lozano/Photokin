import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import { IconExternalLink } from '@tabler/icons-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import './settingsSection.css';

type SettingsExternalLinkProps = {
  href: string;
  label: string;
  /** Inline text link, a small outlined button, or an icon-only button. */
  appearance?: 'link' | 'button' | 'icon';
};

/** Link that opens in the system browser, never inside the app window. */
export function SettingsExternalLink({ href, label, appearance = 'link' }: SettingsExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens in your browser)`}
      title={appearance === 'icon' ? label : undefined}
      className={cn(
        appearance === 'link' && 'settings-external-link',
        appearance === 'button' && buttonVariants({ variant: 'outline', size: 'sm' }),
        appearance === 'icon' && buttonVariants({ variant: 'outline', size: 'icon-sm' }),
      )}
      onClick={async (event) => {
        event.preventDefault();
        try {
          await openUrl(href);
        } catch (error) {
          toast.error(`Could not open the link in your browser: ${String(error)}`);
        }
      }}
    >
      {appearance === 'link' ? (
        <>
          {label}
          <IconExternalLink size={13} aria-hidden />
        </>
      ) : (
        <>
          <IconExternalLink size={16} aria-hidden />
          {appearance === 'button' && label}
        </>
      )}
    </a>
  );
}
