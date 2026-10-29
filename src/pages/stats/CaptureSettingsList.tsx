import { StatsCountBucket } from '@/db/api/services/assets.service';
import { IconBolt, IconSunHigh } from '@tabler/icons-react';

import type { JSX } from 'react';

function SettingsGroup({
  title,
  count,
  data,
  icon,
}: {
  title: string;
  count: number;
  data: StatsCountBucket[];
  icon: JSX.Element;
}) {
  const max = data[0]?.count ?? 1;

  return (
    <section className="stats-settings-group">
      <header className="stats-settings-group__header">
        <span className="stats-settings-group__icon">{icon}</span>
        <div>
          <h4>{title}</h4>
          <p>{count.toLocaleString()} items tagged</p>
        </div>
      </header>
      {data.length ? (
        <ol className="stats-settings-list">
          {data.map(({ label, count: valueCount }) => (
            <li key={label}>
              <div className="stats-settings-list__value">
                <span title={label}>{label}</span>
                <strong>{valueCount.toLocaleString()}</strong>
              </div>
              <div className="stats-settings-list__track">
                <span style={{ width: `${(valueCount / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="stats-settings-group__empty">No values in this selection</p>
      )}
    </section>
  );
}

export function CaptureSettingsList({
  whiteBalances,
  flashValues,
  whiteBalanceCount,
  flashCount,
}: {
  whiteBalances: StatsCountBucket[];
  flashValues: StatsCountBucket[];
  whiteBalanceCount: number;
  flashCount: number;
}) {
  return (
    <div className="stats-settings-grid">
      <SettingsGroup
        title="White balance"
        count={whiteBalanceCount}
        data={whiteBalances}
        icon={<IconSunHigh size={19} stroke={1.8} />}
      />
      <SettingsGroup
        title="Flash"
        count={flashCount}
        data={flashValues}
        icon={<IconBolt size={19} stroke={1.8} />}
      />
    </div>
  );
}
