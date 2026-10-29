import { SecondaryNavbar } from '@/components/secondary-navbar/SecondaryNavbar';
import { usePageChrome } from '@/components/page-content/usePageChrome';
import { useAppStore } from '@/stores/appState';
import { useEffect, useMemo } from 'react';
import { DuplicateSetView } from './DuplicateSetView';
import { DuplicatesEmptyState } from './DuplicatesEmptyState';
import { DuplicatesSidebar } from './DuplicatesSidebar';
import './duplicates.css';
import { useDuplicatesPersistence } from './useDuplicatesPersistence';
import { useDuplicatesScan } from './useDuplicatesScan';
import {
  columnsToSizeSlider,
  GRID_COLUMNS_MAX,
  GRID_COLUMNS_MIN,
  sizeSliderToColumns,
  useDuplicatesStore,
} from './useDuplicatesStore';

export function DuplicatesPage() {
  const sets = useDuplicatesStore((state) => state.sets);
  const activeSetId = useDuplicatesStore((state) => state.activeSetId);
  const scanStatus = useDuplicatesStore((state) => state.scanStatus);
  const gridColumns = useDuplicatesStore((state) => state.gridColumns);
  const setGridColumns = useDuplicatesStore((state) => state.setGridColumns);

  const hydrated = useDuplicatesStore((state) => state.hydrated);
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);

  useDuplicatesPersistence();

  const runScan = useDuplicatesScan();
  const populated = sets.length > 0;
  const activeSet = useMemo(
    () => sets.find((duplicateSet) => duplicateSet.id === activeSetId) ?? null,
    [sets, activeSetId],
  );
  const selectedFilesCount = activeSet?.members.length ?? 0;
  const selectedFilesBytes = useMemo(
    () => activeSet?.members.reduce((acc, member) => acc + member.asset.filesize, 0) ?? 0,
    [activeSet],
  );
  const selectedFilesLabel = selectedFilesCount === 1 ? 'file' : 'files';

  useEffect(() => {
    setBreadcrumb([{ label: 'Duplicates' }]);
    return () => setBreadcrumb([]);
  }, [setBreadcrumb]);

  const footerStatus = useMemo(
    () =>
      populated
        ? {
            summary: `${selectedFilesCount.toLocaleString()} ${selectedFilesLabel}`,
            totalBytes: selectedFilesBytes,
            slider: {
              // Slider higher value means bigger thumbnails.
              value: columnsToSizeSlider(gridColumns),
              min: GRID_COLUMNS_MIN,
              max: GRID_COLUMNS_MAX,
              step: 1,
              ariaLabel: 'Photo size',
              onChange: (value: number) => setGridColumns(sizeSliderToColumns(value)),
            },
          }
        : undefined,
    [populated, selectedFilesCount, selectedFilesLabel, selectedFilesBytes, gridColumns, setGridColumns],
  );
  usePageChrome('review', footerStatus);

  if (!hydrated) {
    return <div className="duplicates-page duplicates-page--loading" />;
  }

  return (
    <div className="duplicates-page">
      {populated ? (
        <div>
          <SecondaryNavbar title="Duplicates">
            <DuplicatesSidebar />
          </SecondaryNavbar>

          <div className="page-content">
            <DuplicateSetView />
          </div>
        </div>
      ) : (
        <DuplicatesEmptyState onScan={() => void runScan()} scanning={scanStatus === 'scanning'} />
      )}
    </div>
  );
}
