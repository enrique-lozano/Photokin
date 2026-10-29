import type { ReactNode } from 'react';
import { type Id, toast as toastify, type TypeOptions } from 'react-toastify';
import { Button } from './button';
import { ToastStatusIcon, type ToastTone } from './toastIcons';

/**
 * Loading glyph shared by `toast.loading` and `toast.promise`. Uses the same
 * Tabler spinner the process notifications render so every "in progress" toast
 * looks identical, instead of react-toastify's built-in ring spinner.
 */
const LOADING_ICON = <ToastStatusIcon tone="loading" />;

/** Toast types that carry a status icon; `default` intentionally has none. */
const TYPE_TONE: Partial<Record<TypeOptions, ToastTone>> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

/**
 * Status icon for a toast type, or `undefined` for `default` (no icon) and to
 * let `react-toastify` fall back to its own behaviour when appropriate.
 */
function iconForType(type: TypeOptions) {
  const tone = TYPE_TONE[type];
  return tone ? <ToastStatusIcon tone={tone} /> : undefined;
}

/** Inline action button rendered inside a toast, e.g. an "Undo". */
export interface AppToastAction {
  /** Button label, e.g. "Undo". */
  label: ReactNode;
  /** Invoked on click; the toast is dismissed automatically afterwards. */
  onClick: () => void;
}

/**
 * Options accepted by the app-wide toast helpers. Intentionally mirrors the
 * subset of the `sonner` API the codebase relied on so call sites only need to
 * swap their import, not their usage.
 */
export interface AppToastOptions {
  /** Stable id; calling again with the same id updates the existing toast. */
  id?: Id;
  /** Secondary line rendered under the title. */
  description?: ReactNode;
  /** Auto-dismiss delay in ms. Pass `false` to keep it open. */
  duration?: number | false;
  /** Optional inline action button (e.g. "Undo"); dismisses the toast on click. */
  action?: AppToastAction;
}

/** Messages for {@link toast.promise}; success/error may derive from the value. */
export interface AppToastPromiseMessages<T> {
  loading: ReactNode;
  success: ReactNode | ((data: T) => ReactNode);
  error: ReactNode | ((error: unknown) => ReactNode);
}

/**
 * Default lifetimes per toast type. Errors linger noticeably longer so the user
 * has time to read them before they disappear.
 */
const DEFAULT_DURATION: Record<TypeOptions, number> = {
  default: 4000,
  info: 4000,
  success: 4000,
  warning: 6000,
  error: 8000,
};

function ToastBody({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: AppToastAction;
}) {
  if (!description && !action) {
    return <span className="app-toast__title">{title}</span>;
  }

  return (
    <div className="app-toast">
      <span className="app-toast__title">{title}</span>
      {description && <span className="text-xs text-muted-foreground">{description}</span>}
      {action && (
        <Button
          type="button"
          variant="link"
          className="mt-1 h-auto self-start p-0 text-xs font-semibold"
          onClick={(event) => {
            event.stopPropagation();
            action.onClick();
          }}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

function emit(type: TypeOptions, message: ReactNode, options?: AppToastOptions): Id {
  // Captured so the action can dismiss its own toast once clicked, even for
  // freshly created toasts whose id is only known after `toastify(...)`.
  let toastId: Id | undefined = options?.id;
  const wrappedAction: AppToastAction | undefined = options?.action && {
    label: options.action.label,
    onClick: () => {
      options.action?.onClick();
      if (toastId !== undefined) toastify.dismiss(toastId);
    },
  };

  const content = <ToastBody title={message} description={options?.description} action={wrappedAction} />;
  const autoClose = options?.duration ?? DEFAULT_DURATION[type];
  const icon = iconForType(type);

  if (options?.id !== undefined && toastify.isActive(options.id)) {
    toastify.update(options.id, { render: content, type, autoClose, isLoading: false, icon });
    return options.id;
  }

  toastId = toastify(content, { toastId: options?.id, type, autoClose, icon });
  return toastId;
}

/**
 * Awaits a fire-and-forget action and surfaces a failure as an error toast, for
 * the many handlers whose only error path is "tell the user". Always resolves, so
 * it can be returned straight from an `onClick` or an async prop.
 */
export async function toastOnError(action: Promise<unknown>): Promise<void> {
  try {
    await action;
  } catch (error) {
    toast.error(String(error));
  }
}

function resolveMessage<T>(message: ReactNode | ((data: T) => ReactNode), data: T): ReactNode {
  return typeof message === 'function' ? (message as (data: T) => ReactNode)(data) : message;
}

interface ToastApi {
  (message: ReactNode, options?: AppToastOptions): Id;
  success: (message: ReactNode, options?: AppToastOptions) => Id;
  error: (message: ReactNode, options?: AppToastOptions) => Id;
  info: (message: ReactNode, options?: AppToastOptions) => Id;
  warning: (message: ReactNode, options?: AppToastOptions) => Id;
  loading: (message: ReactNode, options?: AppToastOptions) => Id;
  promise: <T>(promise: Promise<T>, messages: AppToastPromiseMessages<T>) => Promise<T>;
  dismiss: (id?: Id) => void;
}

/**
 * App-wide notification helper backed by `react-toastify`. Keeps a `sonner`-like
 * surface (`toast.success`, `toast.promise`, id-based updates, descriptions) so
 * the rest of the app stays agnostic of the underlying library.
 */
export const toast: ToastApi = Object.assign(
  (message: ReactNode, options?: AppToastOptions): Id => emit('default', message, options),
  {
    success: (message: ReactNode, options?: AppToastOptions): Id => emit('success', message, options),
    error: (message: ReactNode, options?: AppToastOptions): Id => emit('error', message, options),
    info: (message: ReactNode, options?: AppToastOptions): Id => emit('info', message, options),
    warning: (message: ReactNode, options?: AppToastOptions): Id => emit('warning', message, options),

    loading: (message: ReactNode, options?: AppToastOptions): Id => {
      const content = <ToastBody title={message} description={options?.description} />;

      if (options?.id !== undefined && toastify.isActive(options.id)) {
        toastify.update(options.id, {
          render: content,
          type: 'default',
          isLoading: true,
          autoClose: false,
          icon: LOADING_ICON,
        });
        return options.id;
      }

      return toastify.loading(content, { toastId: options?.id, icon: LOADING_ICON });
    },

    promise: <T,>(promise: Promise<T>, messages: AppToastPromiseMessages<T>): Promise<T> =>
      toastify.promise(promise, {
        pending: { render: () => messages.loading, icon: LOADING_ICON },
        success: {
          render: ({ data }) => resolveMessage(messages.success, data as T),
          autoClose: DEFAULT_DURATION.success,
          icon: iconForType('success'),
        },
        error: {
          render: ({ data }) => resolveMessage(messages.error, data),
          autoClose: DEFAULT_DURATION.error,
          icon: iconForType('error'),
        },
      }),

    dismiss: (id?: Id): void => {
      toastify.dismiss(id);
    },
  },
);
