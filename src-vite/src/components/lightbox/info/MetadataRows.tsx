import type { Icon } from '@tabler/icons-react';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './metadataRows.css';

export interface MetadataRow {
  label: string;
  /** Row is omitted when the value is nullish or an empty string. */
  value: ReactNode | string | number | null | undefined;
  /** Optional icon shown before the value. */
  icon?: Icon;
  actions?: ReactNode;
  valueClassName?: string;
  editing?: boolean;
}

function isPresent(value: MetadataRow['value']): boolean {
  return value !== null && value !== undefined && value !== '';
}

/** Keep only rows that carry a displayable value. */
export function visibleRows(rows: MetadataRow[]): MetadataRow[] {
  return rows.filter((row) => isPresent(row.value));
}

/**
 * A compact two-column definition list for metadata. Rows with empty values are
 * skipped unless showEmpty is set. Actions share the value column without
 * reserving space while hidden.
 */
export function MetadataRows({ rows, showEmpty = false }: { rows: MetadataRow[]; showEmpty?: boolean }) {
  const shown = showEmpty ? rows : visibleRows(rows);
  if (shown.length === 0) {
    return null;
  }

  return (
    <dl className="metadata-rows">
      {shown.map((row) => (
        <div
          className={cn('metadata-row', row.actions && 'metadata-row--actionable')}
          data-editing={row.editing || undefined}
          key={row.label}
        >
          <dt className="metadata-row__label" title={row.label}>
            {row.label}
          </dt>
          <dd className="metadata-row__value">
            {row.icon && <row.icon size={16} className="metadata-row__icon" aria-hidden />}
            <span
              className={cn('metadata-row__text', row.valueClassName)}
              title={
                typeof row.value === 'string' || typeof row.value === 'number' ? String(row.value) : undefined
              }
            >
              {row.value}
            </span>
            {row.actions && <span className="metadata-row__actions">{row.actions}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
