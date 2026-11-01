import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import type { SearchFilter } from '@/common/query/filters/FilterTypes';
import { hasCondition } from '@/common/searchQueryUtils';
import { flashIcon, meteringModeIcon, whiteBalanceIcon } from '@/components/lightbox/info/CameraInfo';
import { StatsCountBucket, StatsNumericBucket } from '@/db/api/services/assets.service';
import { AssetMeteringMode, getMeteringModeLabel } from '@/media/metadata/fields/meteringMode';
import { useAppStore } from '@/stores/appState';
import { IconBolt, IconExposure, IconFocusCentered, IconSunHigh, type Icon } from '@tabler/icons-react';
import { useState } from 'react';

interface SettingRow {
  label: string;
  count: number;
  filter: SearchFilter;
  icon?: Icon;
}

interface SettingGroup {
  title: string;
  icon: Icon;
  count: number;
  rows: SettingRow[];
}

export interface CaptureSettingsData {
  whiteBalances: StatsCountBucket[];
  flashValues: StatsCountBucket[];
  exposurePrograms: StatsCountBucket[];
  meteringModes: StatsNumericBucket[];
}

export interface CaptureSettingsCounts {
  whiteBalance: number;
  flash: number;
  exposureProgram: number;
  meteringMode: number;
}

function _textRows(
  buckets: StatsCountBucket[],
  criteria: FilterCriteria.whiteBalance | FilterCriteria.flashValue | FilterCriteria.exposureProgram,
  icon?: (value: string) => Icon | undefined,
): SettingRow[] {
  return buckets.map(({ label, count }) => ({
    label,
    count,
    icon: icon?.(label),
    filter: { filterCriteria: criteria, operator: 'equals', value: label },
  }));
}

function _buildGroups(data: CaptureSettingsData, counts: CaptureSettingsCounts): SettingGroup[] {
  return [
    {
      title: 'White balance',
      icon: IconSunHigh,
      count: counts.whiteBalance,
      rows: _textRows(data.whiteBalances, FilterCriteria.whiteBalance, whiteBalanceIcon),
    },
    {
      title: 'Flash',
      icon: IconBolt,
      count: counts.flash,
      rows: _textRows(data.flashValues, FilterCriteria.flashValue, flashIcon),
    },
    {
      title: 'Exposure mode',
      icon: IconExposure,
      count: counts.exposureProgram,
      rows: _textRows(data.exposurePrograms, FilterCriteria.exposureProgram),
    },
    {
      title: 'Metering',
      icon: IconFocusCentered,
      count: counts.meteringMode,
      rows: data.meteringModes.map(({ value, count }) => ({
        label: getMeteringModeLabel(value as AssetMeteringMode) ?? String(value),
        count,
        icon: meteringModeIcon(value as AssetMeteringMode),
        filter: { filterCriteria: FilterCriteria.meteringMode, operator: 'equals', value },
      })),
    },
  ];
}

export function CaptureSettingsList({
  data,
  counts,
  onFilter,
}: {
  data: CaptureSettingsData;
  counts: CaptureSettingsCounts;
  onFilter: (filter: SearchFilter) => void;
}) {
  const searchQuery = useAppStore((state) => state.searchQuery);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const groups = _buildGroups(data, counts);
  const selected =
    selectedIndex ??
    Math.max(
      0,
      groups.findIndex((group) => group.rows.length > 0),
    );
  const activeGroup = groups[selected];
  const max = activeGroup.rows[0]?.count ?? 1;
  const showIcons = activeGroup.rows.some((row) => row.icon);

  return (
    <div className="stats-settings">
      <div className="stats-settings__tabs" role="group" aria-label="Capture setting">
        {groups.map(({ title, icon: TabIcon, count }, index) => (
          <button
            key={title}
            type="button"
            className={`stats-settings__tab${selected === index ? ' active' : ''}`}
            aria-pressed={selected === index}
            onClick={() => setSelectedIndex(index)}
          >
            <TabIcon size={17} stroke={1.8} />
            <span>{title}</span>
            <strong>{count.toLocaleString()}</strong>
          </button>
        ))}
      </div>

      <section className="stats-settings__values" aria-label={activeGroup.title}>
        {activeGroup.rows.length ? (
          <ol className="stats-settings-list">
            {activeGroup.rows.map(({ label, count, filter, icon: RowIcon }) => {
              const isActive = hasCondition(searchQuery, [filter]);
              return (
                <li key={label}>
                  <button
                    type="button"
                    className={`stats-settings-list__button${isActive ? ' active' : ''}`}
                    aria-pressed={isActive}
                    aria-label={`${isActive ? 'Remove filter' : 'Filter by'} ${activeGroup.title}: ${label} (${count} items)`}
                    onClick={() => onFilter(filter)}
                  >
                    {showIcons && (
                      <span className="stats-settings-list__icon" aria-hidden>
                        {RowIcon && <RowIcon size={16} stroke={1.8} />}
                      </span>
                    )}
                    <span className="stats-settings-list__body">
                      <span className="stats-settings-list__value">
                        <span title={label}>{label}</span>
                        <strong>{count.toLocaleString()}</strong>
                      </span>
                      <span className="stats-settings-list__track">
                        <span style={{ width: `${(count / max) * 100}%` }} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="stats-settings-group__empty">No values in this selection</p>
        )}
      </section>
    </div>
  );
}
