import { IconCheck } from '@tabler/icons-react';
import clsx from 'clsx';

export function OnboardingStepper({ count, current }: { count: number; current: number }) {
  return (
    <ol className="onboarding__stepper" aria-label="Setup progress">
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className={clsx(
            'onboarding__stepper-item',
            index < current && 'onboarding__stepper-item--done',
            index === current && 'onboarding__stepper-item--current',
          )}
          aria-current={index === current ? 'step' : undefined}
        >
          <span className="onboarding__stepper-dot">
            {index < current ? <IconCheck size={14} /> : index + 1}
          </span>
        </li>
      ))}
    </ol>
  );
}
