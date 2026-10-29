import clsx from 'clsx';
import type { ReactNode } from 'react';
import './pageContent.css';

interface HeroToggleProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon?: ReactNode;
}

/** Compact pressed button used for an optional gallery scope. */
export function HeroToggle({ label, checked, onCheckedChange, icon }: HeroToggleProps) {
  return (
    <button
      type="button"
      className={clsx('hero-toggle', checked && 'hero-toggle--active')}
      aria-label={label}
      aria-pressed={checked}
      title={label}
      onClick={() => onCheckedChange(!checked)}
    >
      {icon && <span className="hero-toggle__icon">{icon}</span>}
      <span className="hero-toggle__label">{label}</span>
    </button>
  );
}
