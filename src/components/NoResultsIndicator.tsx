import type { JSX } from 'react';
import { useImportStatus } from './page-content/ImportStatus';
type NoResultsIndicatorProps = {
  title: string;
  description?: string;
  icon?: JSX.Element;

  extraContent?: JSX.Element;
  pendingImport?: 'metadata' | 'places';
};

export function NoResultsIndicator({
  title,
  icon,
  description,
  extraContent,
  pendingImport,
}: NoResultsIndicatorProps) {
  const status = useImportStatus();
  const pending =
    pendingImport &&
    status?.data &&
    (status.data.scanning ||
      status.data.metadata > 0 ||
      (pendingImport === 'places' && status.data.locations > 0));
  const pendingDescription = status?.running
    ? 'Results may appear as more photos are processed.'
    : 'Import is unfinished. These results are not complete yet.';
  return (
    <div className="no-results__container flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
      {icon && <div className="no-results__icon-container mb-2 text-primary">{icon}</div>}

      <h5>{pending ? 'No matches yet' : title}</h5>

      {(pending || description) && (
        <p className="max-w-md text-sm text-muted-foreground">{pending ? pendingDescription : description}</p>
      )}
      {extraContent}
    </div>
  );
}
