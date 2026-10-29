import { Button } from '@/components/ui/button';
import { InfoHint } from '@/components/ui/infoHint';
import { Slider } from '@/components/ui/slider';
import { AlbumScopePicker } from '@/pages/people/AlbumScopePicker';
import { IconScan } from '@tabler/icons-react';
import { MAX_SIMILARITY_THRESHOLD } from './duplicateTypes';
import { distanceToMatchPercent } from './perceptualHash';
import { useDuplicatesStore } from './useDuplicatesStore';

type Props = {
  onScan: () => void;
  scanning: boolean;
  /** "inline" for the empty-state form, "popover" for the Re-scan popover. */
  layout: 'inline' | 'popover';
  scanLabel?: string;
};

const MIN_REQUIRED_SIMILARITY_PERCENT = distanceToMatchPercent(MAX_SIMILARITY_THRESHOLD);
const MAX_REQUIRED_SIMILARITY_PERCENT = 100;

function requiredPercentToThreshold(percent: number): number {
  if (!Number.isFinite(percent)) return MAX_SIMILARITY_THRESHOLD;
  let best = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let threshold = 0; threshold <= MAX_SIMILARITY_THRESHOLD; threshold++) {
    const matchPercent = distanceToMatchPercent(threshold);
    const diff = Math.abs(matchPercent - percent);
    if (diff < bestDiff) {
      best = threshold;
      bestDiff = diff;
    }
  }
  return best;
}

export function ScanOptionsForm({ onScan, scanning, layout, scanLabel }: Props) {
  const albumIds = useDuplicatesStore((state) => state.albumIds);
  const includeSubAlbums = useDuplicatesStore((state) => state.includeSubAlbums);
  const similarityThreshold = useDuplicatesStore((state) => state.similarityThreshold);
  const setAlbumIds = useDuplicatesStore((state) => state.setAlbumIds);
  const setIncludeSubAlbums = useDuplicatesStore((state) => state.setIncludeSubAlbums);
  const setSimilarityThreshold = useDuplicatesStore((state) => state.setSimilarityThreshold);
  const requiredSimilarityPercent = distanceToMatchPercent(similarityThreshold);

  return (
    <div className={`dup-scan-options dup-scan-options--${layout}`}>
      <div className="dup-scan-option">
        <span className="dup-scan-option__label">
          Albums to scan
          <InfoHint>Limit the scan to specific albums, or leave empty to scan the whole library.</InfoHint>
        </span>
        <AlbumScopePicker
          selectedIds={albumIds}
          includeSubAlbums={includeSubAlbums}
          onChangeSelected={setAlbumIds}
          onChangeIncludeSubAlbums={setIncludeSubAlbums}
        />
      </div>

      <div className="dup-scan-option">
        <div className="dup-scan-option__header">
          <span className="dup-scan-option__label">
            Required similarity
            <InfoHint>
              Minimum visual match required for two photos to be grouped as “Similar” (70% minimum). Higher
              percentages are stricter. Exact duplicates always match, regardless of this setting.
            </InfoHint>
          </span>
          <span className="dup-scan-option__value">{requiredSimilarityPercent}%</span>
        </div>
        <Slider
          min={MIN_REQUIRED_SIMILARITY_PERCENT}
          max={MAX_REQUIRED_SIMILARITY_PERCENT}
          step={1}
          value={[requiredSimilarityPercent]}
          onValueChange={([value]) => setSimilarityThreshold(requiredPercentToThreshold(value))}
          aria-label="Required similarity percentage"
        />
      </div>

      <Button
        variant="default"
        onClick={onScan}
        disabled={scanning}
        className={layout === 'inline' ? 'dup-scan-cta' : undefined}
      >
        <IconScan size={16} />
        {scanning ? 'Scanning…' : (scanLabel ?? 'Scan for duplicates')}
      </Button>
    </div>
  );
}
