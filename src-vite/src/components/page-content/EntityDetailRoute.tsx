import { Fragment, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';

/** Reset detail queries, dialogs and scrolling together when the selected entity changes. */
export function EntityDetailRoute({ children }: { children: ReactNode }) {
  const { id } = useParams();
  return <Fragment key={id}>{children}</Fragment>;
}
