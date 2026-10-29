import { ReactNode } from 'react';
import { getConditions } from '../../common/searchQueryUtils';
import { useAppStore } from '../../stores/appState';
import { EditDateDialog } from '../edit-date/EditDateDialog';
import { EditLocationDialog } from '../edit-location/EditLocationDialog';
import { EditTagsDialog } from '../edit-tags/EditTagsDialog';
import { RemoveAllTagsDialog } from '../edit-tags/RemoveAllTagsDialog';
import { OutletFooter } from '../footer/Footer';
import { MetadataActionsDialog } from '../metadata-actions/MetadataActionsDialog';
import { MoveToFolderDialog } from '../move-to-folder/MoveToFolderDialog';
import { Navbar } from '../navbar/navbar';
import { ProcessWarningsDialog } from '../process-center/ProcessWarningsDialog';
import { RemoveFaceDataDialog } from '../remove-face-data/RemoveFaceDataDialog';
import { RenameFileDialog } from '../rename-file/RenameFileDialog';
import { Toolbar } from '../toolbar/toolbar';
import { TrashConfirmDialog } from '../trash/TrashConfirmDialog';
import { ConfirmationDialogHost } from '../ui/confirmation-dialog';
import { AppToaster } from '../ui/toaster';
import { GlobalFiltersStrip } from './GlobalFiltersStrip';
import './appShell.css';

interface AppShellProps {
  /** The active page (typically a router `<Outlet />`). */
  children: ReactNode;
}

/**
 * Top-level application layout. A CSS grid with four regions:
 * a full-height left rail, a top toolbar, an optional global-filter strip and a
 * scrollable page area, plus a full-width status bar pinned to the bottom.
 */
export function AppShell({ children }: AppShellProps) {
  const searchQuery = useAppStore((state) => state.searchQuery);
  const hasGlobalFilters = getConditions(searchQuery).length > 0;

  return (
    <div className="app-shell">
      <Navbar />
      <Toolbar />
      {hasGlobalFilters && <GlobalFiltersStrip />}

      <main className="app-shell__page" id="app-content">
        {children}
      </main>

      <OutletFooter />
      <AppToaster />
      <ProcessWarningsDialog />
      <EditDateDialog />
      <EditLocationDialog />
      <EditTagsDialog />
      <RemoveAllTagsDialog />
      <RemoveFaceDataDialog />
      <RenameFileDialog />
      <MetadataActionsDialog />
      <MoveToFolderDialog />
      <TrashConfirmDialog />
      <ConfirmationDialogHost />
    </div>
  );
}
