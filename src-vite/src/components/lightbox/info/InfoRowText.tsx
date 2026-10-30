import { cn } from '@/lib/utils';

export function InfoRowText({
  title,
  subtitle,
  className,
  titleClassName,
  subtitleClassName,
}: {
  title: string;
  subtitle?: string | null;
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}) {
  return (
    <span className={cn('flex min-w-0 flex-1 flex-col', className)}>
      <span data-slot="info-row-title" className={cn('text-sm font-semibold', titleClassName)} title={title}>
        {title}
      </span>
      {subtitle && (
        <span
          data-slot="info-row-subtitle"
          className={cn('text-xs font-normal text-muted-foreground', subtitleClassName)}
          title={subtitle}
        >
          {subtitle}
        </span>
      )}
    </span>
  );
}
