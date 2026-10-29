import { cn } from '@/lib/utils';
import { Segmented, type SegmentedOption } from '@/components/segmented/Segmented';
import { Badge } from '@/components/ui/badge';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type ComponentProps, type ReactNode, useId } from 'react';
import './settingsRow.css';

/**
 * Building blocks of the settings pages: a page header, titled groups drawn as
 * one card, and the rows inside them. Rows that act on a click anywhere
 * highlight on hover, so the hover feedback always matches what a click does;
 * informational rows stay inert.
 */

export type SettingsSelectOption = {
  value: string;
  label: string;
};

export type SettingsRadioOption = {
  value: string;
  label: string;
  description?: string;
  badge?: string;
};

export function SettingsPageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <header className="settings-page-header">
      <h2 className="settings-page-header__title">{title}</h2>
      {description && <p className="settings-page-header__description">{description}</p>}
    </header>
  );
}

type SettingsGroupProps = {
  title?: string;
  /** Context shown below the section title, outside the card. */
  description?: ReactNode;
  /** Notices that belong to the group but sit below its card. */
  footer?: ReactNode;
  children: ReactNode;
};

export function SettingsGroup({ title, description, footer, children }: SettingsGroupProps) {
  const titleId = useId();

  return (
    <section className="settings-group" aria-labelledby={title ? titleId : undefined}>
      {title && (
        <h3 id={titleId} className="settings-group__title">
          {title}
        </h3>
      )}
      {description && <p className="settings-group__description">{description}</p>}
      <div className="settings-card">{children}</div>
      {footer}
    </section>
  );
}

type SettingsRowContentProps = {
  icon?: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  descriptionId?: string;
};

function SettingsRowContent({ icon, label, description, descriptionId }: SettingsRowContentProps) {
  return (
    <>
      {icon && (
        <span className="settings-row__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="settings-row-copy">
        <div className="settings-row__label">{label}</div>
        {description && (
          <p id={descriptionId} className="settings-row-description">
            {description}
          </p>
        )}
      </div>
    </>
  );
}

type SettingsRowProps = Omit<ComponentProps<'div'>, 'children'> &
  SettingsRowContentProps & {
    /** Controls on the right side of the row. */
    children?: ReactNode;
    disabled?: boolean;
  };

/** Generic row. Passing `onClick` makes the whole row clickable. */
export function SettingsRow({
  icon,
  label,
  description,
  descriptionId,
  children,
  disabled,
  onClick,
  className,
  ...props
}: SettingsRowProps) {
  return (
    <div
      {...props}
      className={cn('settings-row', onClick && 'settings-row--interactive', className)}
      onClick={disabled ? undefined : onClick}
      data-disabled={disabled || undefined}
    >
      <SettingsRowContent icon={icon} label={label} description={description} descriptionId={descriptionId} />
      {children && <div className="settings-row__control">{children}</div>}
    </div>
  );
}

/** Icon-only row action, labelled for screen readers and on hover. */
export function SettingsIconButton({ label, children, ...props }: ButtonProps & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type SettingsToggleRowProps = {
  icon?: ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
};

/** Row holding a switch. The `<label>` makes the whole row toggle it. */
export function SettingsToggleRow({
  icon,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: SettingsToggleRowProps) {
  const controlId = useId();
  const descriptionId = useId();

  return (
    <label
      htmlFor={controlId}
      className="settings-row settings-row--interactive"
      data-disabled={disabled || undefined}
    >
      <SettingsRowContent icon={icon} label={label} description={description} descriptionId={descriptionId} />
      <Switch
        id={controlId}
        aria-label={label}
        aria-describedby={description ? descriptionId : undefined}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </label>
  );
}

type SettingsSelectRowProps = {
  icon?: ReactNode;
  label: string;
  description?: string;
  value: string;
  options: readonly SettingsSelectOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
};

/** Row holding a dropdown. Only the control opens it. */
export function SettingsSelectRow({
  icon,
  label,
  description,
  value,
  options,
  onValueChange,
  disabled,
}: SettingsSelectRowProps) {
  const descriptionId = useId();

  return (
    <SettingsRow
      icon={icon}
      label={label}
      description={description}
      descriptionId={description ? descriptionId : undefined}
      disabled={disabled}
    >
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          className="settings-select"
          optionLabels={options.map((option) => option.label)}
          aria-label={label}
          aria-describedby={description ? descriptionId : undefined}
          disabled={disabled}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}

type SettingsSegmentedRowProps<T extends string> = {
  icon?: ReactNode;
  label: string;
  description?: string;
  value: T;
  options: SegmentedOption<T>[];
  onValueChange: (value: T) => void;
};

/** Row holding a segmented control, for a few short, mutually exclusive choices. */
export function SettingsSegmentedRow<T extends string>({
  icon,
  label,
  description,
  value,
  options,
  onValueChange,
}: SettingsSegmentedRowProps<T>) {
  return (
    <SettingsRow icon={icon} label={label} description={description}>
      <Segmented options={options} value={value} onChange={onValueChange} ariaLabel={label} />
    </SettingsRow>
  );
}

type SettingsButtonRowProps = {
  icon?: ReactNode;
  label: string;
  description?: ReactNode;
  buttonLabel: string;
  buttonIcon?: ReactNode;
  buttonVariant?: ButtonProps['variant'];
  /** Accessible name for the button when its visible label is terse. */
  buttonAriaLabel?: string;
  onAction: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  /** Secondary button that undoes the choice, shown only when given. */
  clearLabel?: string;
  onClear?: () => void;
};

/** Row holding a button. Only the button triggers the action. */
export function SettingsButtonRow({
  icon,
  label,
  description,
  buttonLabel,
  buttonIcon,
  buttonVariant = 'outline',
  buttonAriaLabel,
  onAction,
  disabled,
  isLoading,
  clearLabel,
  onClear,
}: SettingsButtonRowProps) {
  return (
    <SettingsRow icon={icon} label={label} description={description} disabled={disabled}>
      {onClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          {clearLabel}
        </Button>
      )}
      <Button
        variant={buttonVariant}
        size="sm"
        onClick={onAction}
        disabled={disabled}
        isLoading={isLoading}
        aria-label={buttonAriaLabel}
      >
        {buttonIcon}
        {buttonLabel}
      </Button>
    </SettingsRow>
  );
}

type SettingsRadioGroupProps = {
  /** Accessible name of the group; usually the title of its settings group. */
  label: string;
  value: string;
  options: readonly SettingsRadioOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
};

/** One row per choice, with the radio on the right — for choices that need a sentence each. */
export function SettingsRadioGroup({
  label,
  value,
  options,
  onValueChange,
  disabled,
}: SettingsRadioGroupProps) {
  const name = useId();

  return (
    <div role="radiogroup" aria-label={label} className="settings-radio-group">
      {options.map((option) => (
        <label
          key={option.value}
          className="settings-row settings-row--interactive"
          data-disabled={disabled || undefined}
        >
          <SettingsRowContent
            label={
              <>
                {option.label}
                {option.badge && <Badge variant="info">{option.badge}</Badge>}
              </>
            }
            description={option.description}
          />
          <input
            type="radio"
            className="settings-radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onValueChange(option.value)}
            disabled={disabled}
          />
        </label>
      ))}
    </div>
  );
}
