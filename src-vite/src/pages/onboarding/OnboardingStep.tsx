import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

export type OnboardingStepProps = {
  /** Moves to the next step, or finishes onboarding on the last one. */
  goNext: () => void;
  /** Undefined on the first step. */
  goBack?: () => void;
};

/** Shared frame of every step: a centered body and a footer pinned to the bottom. */
export function OnboardingStep({
  start,
  end,
  onBack,
  children,
}: {
  start: ReactNode;
  end: ReactNode;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="onboarding__body">{children}</div>
      <footer className="onboarding__footer">
        <div className="onboarding__footer-start">{start}</div>
        <div className="onboarding__footer-end">
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              Back
            </Button>
          )}
          {end}
        </div>
      </footer>
    </>
  );
}

export function OnboardingHeading({
  icon,
  title,
  subtitle,
}: {
  icon?: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="onboarding__heading">
      {icon && <div className="onboarding__logo-tile">{icon}</div>}
      <h1 className="onboarding__title">{title}</h1>
      <p className="onboarding__subtitle">{subtitle}</p>
    </header>
  );
}
