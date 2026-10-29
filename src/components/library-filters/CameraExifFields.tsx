import {
  EXPOSURE_STOPS,
  ExposureField,
  formatExposureRange,
  formatExposureValue,
  rangeToStopIndices,
  stopIndicesToRange,
} from '@/common/exposureStops';
import { Slider } from '@/components/ui/slider';
import { IconBolt } from '@tabler/icons-react';
import { ExposureRange, FlashDraft } from './filterDraft';

/**
 * Dual-thumb slider over the photo-count histogram of one camera setting.
 * Thumbs snap to standard stops; a thumb resting on its end means no limit.
 */
export function ExposureSlider({
  field,
  label,
  histogram,
  value,
  onValueChange,
}: {
  field: ExposureField;
  label: string;
  histogram: readonly number[] | undefined;
  value: ExposureRange;
  onValueChange: (value: ExposureRange) => void;
}) {
  const stops = EXPOSURE_STOPS[field];
  const indices = rangeToStopIndices(stops, value);
  const summary = formatExposureRange(field, value);
  const peak = Math.max(1, ...(histogram ?? []));

  return (
    <div className="library-filter-drawer__exposure" data-active={summary ? 'true' : undefined}>
      <div className="library-filter-drawer__exposure-header">
        <span>{label}</span>
        <span className="library-filter-drawer__exposure-value">{summary ?? 'Any'}</span>
      </div>
      <div className="library-filter-drawer__histogram" aria-hidden="true">
        {stops.map((stop, index) => (
          <span
            key={stop}
            style={{ height: `${Math.max(4, ((histogram?.[index] ?? 0) / peak) * 100)}%` }}
            data-in-range={(summary && index >= indices[0] && index <= indices[1]) || undefined}
          />
        ))}
      </div>
      <Slider
        aria-label={label}
        min={0}
        max={stops.length - 1}
        step={1}
        value={indices}
        onValueChange={(next) => onValueChange(stopIndicesToRange(stops, value, next))}
        className="library-filter-drawer__exposure-slider"
      />
      <div className="library-filter-drawer__exposure-ends" aria-hidden="true">
        <span>{formatExposureValue(field, stops[0])}</span>
        <span>{formatExposureValue(field, stops[stops.length - 1])}</span>
      </div>
    </div>
  );
}

const FLASH_OPTIONS: { value: FlashDraft; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'fired', label: 'Fired' },
  { value: 'notFired', label: 'Not fired' },
];

export function FlashToggle({
  value,
  onValueChange,
}: {
  value: FlashDraft;
  onValueChange: (value: FlashDraft) => void;
}) {
  return (
    <div className="library-filter-drawer__inline-row">
      <span className="library-filter-drawer__inline-label" id="library-filter-flash">
        <IconBolt size={15} aria-hidden="true" />
        Flash
      </span>
      <div
        className="library-filter-drawer__operator-toggle"
        role="group"
        aria-labelledby="library-filter-flash"
      >
        {FLASH_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? 'active' : ''}
            aria-pressed={value === option.value}
            onClick={() => onValueChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
