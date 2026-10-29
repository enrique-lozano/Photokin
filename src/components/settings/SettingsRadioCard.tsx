import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './settingsRow.css';

type SettingsRadioCardProps = {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  children: ReactNode;
};

export function SettingsRadioCard({
  name,
  value,
  checked,
  onChange,
  disabled,
  children,
}: SettingsRadioCardProps) {
  return (
    <label
      data-disabled={disabled || undefined}
      className={cn('settings-radio-card', checked && 'settings-radio-card--selected')}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only focus-visible:outline-none"
      />
      <div className="settings-radio-card__body">{children}</div>
      <span className="settings-radio-card__bullet" aria-hidden="true">
        <span className="settings-radio-card__bullet-dot" />
      </span>
    </label>
  );
}
