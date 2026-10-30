import clsx from 'clsx';
import { formatDate } from '../../utils/dateFormatter';
import {
  CalendarSelection,
  DayCount,
  WHOLE,
  getDaysInMonth,
  getFirstWeekday,
  isToday,
  sumMonthCount,
} from './calendar.utils';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Maps a day's asset count to a heatmap intensity level (0-4). */
function densityLevel(count: number): number {
  if (count <= 0) return 0;
  if (count < 5) return 1;
  if (count < 20) return 2;
  if (count < 60) return 3;
  return 4;
}

function monthLabel(year: number, month: number): string {
  return formatDate(new Date(Date.UTC(year, month - 1, 1)), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

type CalendarDailyProps = {
  year: number;
  month: number;
  days: DayCount[];
  selection: CalendarSelection | null;
  onSelect: (selection: CalendarSelection) => void;
};

export function CalendarDaily({ year, month, days, selection, onSelect }: CalendarDailyProps) {
  const countByDate = new Map(days.map((day) => [day.date, day.count]));
  const daysInMonth = getDaysInMonth(year, month);
  const leadingBlanks = getFirstWeekday(year, month);
  const monthTotal = sumMonthCount({ [month]: days }, month);

  const isMonthSelected = selection?.year === year && selection.month === month && selection.date === WHOLE;

  return (
    <div className="calendar-card">
      <button
        type="button"
        className={clsx(
          'calendar-card-title',
          isMonthSelected && 'selected',
          isMonthSelected && 'selected-item',
        )}
        title={`${monthLabel(year, month)} · ${monthTotal}`}
        onClick={() => onSelect({ year, month, date: WHOLE })}
      >
        {monthLabel(year, month)}
      </button>

      <div className="calendar-weekday-row">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={index} className="calendar-weekday">
            {label}
          </span>
        ))}
      </div>

      <div className="calendar-day-grid">
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <span key={`blank-${index}`} className="calendar-day-blank" />
        ))}

        {Array.from({ length: daysInMonth }, (_, index) => {
          const date = index + 1;
          const count = countByDate.get(date) ?? 0;
          const isEmpty = count === 0;
          const isSelected = selection?.year === year && selection.month === month && selection.date === date;

          return (
            <button
              type="button"
              key={date}
              disabled={isEmpty}
              title={`${date} ${monthLabel(year, month)}${isEmpty ? '' : ` · ${count}`}`}
              className={clsx(
                'calendar-cell',
                'calendar-day-cell',
                `density-${densityLevel(count)}`,
                isEmpty && 'empty',
                isToday(year, month, date) && 'is-today',
                isSelected && 'selected',
                isSelected && 'selected-item',
              )}
              onClick={() => !isEmpty && onSelect({ year, month, date })}
            >
              <span className="calendar-cell-label">{date}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
