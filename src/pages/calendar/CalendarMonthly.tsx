import clsx from 'clsx';
import { formatDate } from '../../utils/dateFormatter';
import { CalendarSelection, MonthBuckets, WHOLE, isCurrentMonth, sumMonthCount } from './calendar.utils';

const MONTH_INDEXES = Array.from({ length: 12 }, (_, index) => index + 1);

function shortMonthLabel(month: number): string {
  return formatDate(new Date(Date.UTC(2000, month - 1, 1)), { month: 'short', timeZone: 'UTC' });
}

/** Maps a month's asset count to a heatmap intensity level (0-4). */
function densityLevel(count: number): number {
  if (count <= 0) return 0;
  if (count < 50) return 1;
  if (count < 250) return 2;
  if (count < 1000) return 3;
  return 4;
}

type CalendarMonthlyProps = {
  year: number;
  months: MonthBuckets;
  selection: CalendarSelection | null;
  onSelect: (selection: CalendarSelection) => void;
};

export function CalendarMonthly({ year, months, selection, onSelect }: CalendarMonthlyProps) {
  const isYearSelected = selection?.year === year && selection.month === WHOLE;

  return (
    <div className="calendar-card">
      <button
        type="button"
        className={clsx(
          'calendar-card-title',
          isYearSelected && 'selected',
          isYearSelected && 'selected-item',
        )}
        onClick={() => onSelect({ year, month: WHOLE, date: WHOLE })}
      >
        {year}
      </button>

      <div className="calendar-month-grid">
        {MONTH_INDEXES.map((month) => {
          const count = sumMonthCount(months, month);
          const isEmpty = count === 0;
          const isSelected =
            selection?.year === year && selection.month === month && selection.date === WHOLE;

          return (
            <button
              type="button"
              key={month}
              disabled={isEmpty}
              title={`${shortMonthLabel(month)} ${year}${isEmpty ? '' : ` · ${count}`}`}
              className={clsx(
                'calendar-cell',
                'calendar-month-cell',
                `density-${densityLevel(count)}`,
                isEmpty && 'empty',
                isCurrentMonth(year, month) && 'is-today',
                isSelected && 'selected',
                isSelected && 'selected-item',
              )}
              onClick={() => !isEmpty && onSelect({ year, month, date: WHOLE })}
            >
              <span className="calendar-cell-label">{shortMonthLabel(month)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
