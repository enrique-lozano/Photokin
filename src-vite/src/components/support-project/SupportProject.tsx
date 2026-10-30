import { IconHeart, IconHeartFilled } from '@tabler/icons-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { type ReactElement, useId } from 'react';
import { siBuymeacoffee, siLiberapay, siPaypal } from 'simple-icons';
import { SettingsRow } from '../settings/SettingsRow';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { toastOnError } from '../ui/toast';
import './supportProject.css';

// Keep the launch-time choice stable across page changes and component remounts.
const SHOW_DONATE_BADGE = Math.random() < 0.3;

const DONATION_LINKS = [
  {
    label: 'PayPal',
    url: 'https://paypal.me/lozanoelc?country.x=ES&locale.x=es_ES',
    icon: siPaypal,
  },
  {
    label: 'Buy Me a Coffee',
    url: 'https://www.buymeacoffee.com/enrique.lozano',
    icon: siBuymeacoffee,
  },
  {
    label: 'Liberapay',
    url: 'https://liberapay.com/enrique-lozano/donate',
    icon: siLiberapay,
  },
];

export function SupportProjectCard() {
  const titleId = useId();

  return (
    <section className="support-project" aria-labelledby={titleId}>
      <h3 className="support-project__header">
        <span className="support-project__row">
          <SupportProjectHeading titleId={titleId} />
        </span>
      </h3>
      <div className="support-project__body">
        <div className="support-project__platforms">
          {DONATION_LINKS.map(({ label, url, icon }) => (
            <Button key={url} asChild variant="outline" className="support-project__platform">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${label} (opens in your browser)`}
                onClick={(event) => {
                  event.preventDefault();
                  return toastOnError(openUrl(url));
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                  <path d={icon.path} />
                </svg>
                <span>{label}</span>
              </a>
            </Button>
          ))}
        </div>
        <p className="support-project__note">Optional donations · Opens in your browser</p>
      </div>
    </section>
  );
}

function SupportProjectHeading({ titleId }: { titleId?: string }) {
  return (
    <>
      <span className="support-project__heart" aria-hidden="true">
        <IconHeartFilled size={24} />
      </span>
      <span className="support-project__heading">
        <span id={titleId} className="support-project__title">
          Donate a little love
        </span>
        <span className="support-project__copy">Made with care. Kept going by you.</span>
      </span>
    </>
  );
}

/** Opens the platform chooser; nothing reaches the browser until one is picked. */
function DonationPopover({ children }: { children: ReactElement }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="support-project-popover w-[340px] max-w-[calc(100vw-24px)] p-0"
        aria-label="Support Photokin"
      >
        <SupportProjectCard />
      </PopoverContent>
    </Popover>
  );
}

/** Always-available donation row closing the About page. */
export function SupportProjectFooter() {
  return (
    <SettingsRow
      icon={<IconHeart size={18} />}
      label="Donate a little love"
      description="Made with care. Kept going by you."
    >
      <DonationPopover>
        <Button variant="outline" size="sm">
          Donate
        </Button>
      </DonationPopover>
    </SettingsRow>
  );
}

export function DonateBadge() {
  if (!SHOW_DONATE_BADGE) return null;

  return (
    <DonationPopover>
      <Badge asChild variant="outline" className="support-project-badge">
        <button type="button" aria-label="Donate to Photokin">
          <IconHeartFilled size={14} aria-hidden="true" />
          Donate
        </button>
      </Badge>
    </DonationPopover>
  );
}
