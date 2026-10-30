import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconLoader2,
  type Icon,
} from '@tabler/icons-react';
import clsx from 'clsx';

/**
 * Visual tone shared by regular toasts and process notifications. Both surfaces
 * render the leading icon through {@link ToastStatusIcon} so a toast and a
 * process notification with the same outcome look identical.
 */
export type ToastTone = 'loading' | 'success' | 'error' | 'warning' | 'info';

const TONE_ICON: Record<ToastTone, Icon> = {
  loading: IconLoader2,
  success: IconCircleCheck,
  error: IconAlertCircle,
  warning: IconAlertTriangle,
  info: IconInfoCircle,
};

/**
 * Single source of truth for a toast's leading status icon. The `loading` tone
 * spins; the rest are tinted via their `app-toast-status-icon--*` class (see
 * `toast.css`). Colors resolve against the toast container's design tokens, so
 * this works for both regular toasts and the process center.
 */
export function ToastStatusIcon({ tone }: { tone: ToastTone }) {
  const Icon = TONE_ICON[tone];
  return (
    <Icon
      size={20}
      className={clsx(
        'app-toast-status-icon',
        tone === 'loading' ? 'app-toast__spinner' : `app-toast-status-icon--${tone}`,
      )}
    />
  );
}
