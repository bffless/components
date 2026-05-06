import { useMemo, useState, type ReactNode } from 'react';
import type { UseSchedulingAdminResult } from '../../../hooks/useSchedulingAdmin';
import type { SchedulingWorkingHours } from '../../../types/scheduling';

const DAYS: Array<{ dow: number; label: string; short: string }> = [
  { dow: 0, label: 'Sunday', short: 'Sun' },
  { dow: 1, label: 'Monday', short: 'Mon' },
  { dow: 2, label: 'Tuesday', short: 'Tue' },
  { dow: 3, label: 'Wednesday', short: 'Wed' },
  { dow: 4, label: 'Thursday', short: 'Thu' },
  { dow: 5, label: 'Friday', short: 'Fri' },
  { dow: 6, label: 'Saturday', short: 'Sat' },
];

const DEFAULT_NEW_ROW = { start_time: '09:00', end_time: '17:00' };

export interface SchedulingWorkingHoursEditorProps {
  admin: UseSchedulingAdminResult;
  /**
   * Resource whose hours we're editing. Pass `null` for site-wide hours
   * (rows where `resource_id is null`) — used by the "Salon hours" panel.
   */
  resourceId: string | null;
  className?: string;
  dayClassName?: string;
  dayLabelClassName?: string;
  rowClassName?: string;
  inputClassName?: string;
  buttonClassName?: string;
  addButtonClassName?: string;
  emptyDayClassName?: string;
  errorClassName?: string;
  /** Default 'short'. Use 'long' for "Tuesday" instead of "Tue". */
  dayLabelFormat?: 'short' | 'long';
  /**
   * Localized copy hooks. Defaults are English.
   */
  emptyDayLabel?: ReactNode;
  addRowLabel?: ReactNode;
  removeRowLabel?: ReactNode;
}

export function SchedulingWorkingHoursEditor({
  admin,
  resourceId,
  className,
  dayClassName,
  dayLabelClassName,
  rowClassName,
  inputClassName,
  buttonClassName,
  addButtonClassName,
  emptyDayClassName,
  errorClassName,
  dayLabelFormat = 'short',
  emptyDayLabel = 'Closed',
  addRowLabel = '+ Add hours',
  removeRowLabel = 'Remove',
}: SchedulingWorkingHoursEditorProps) {
  // Group existing rows by day-of-week. Multiple rows per day = split shifts
  // (e.g. 09:00-13:00 and 14:00-18:00 with a lunch break in the middle).
  const byDay = useMemo(() => {
    const map = new Map<number, SchedulingWorkingHours[]>();
    for (const row of admin.workingHours.list) {
      // Filter to the scope we're editing — per-resource OR site-wide.
      const matches =
        resourceId === null ? row.resource_id === null : row.resource_id === resourceId;
      if (!matches) continue;
      const list = map.get(row.day_of_week) ?? [];
      list.push(row);
      map.set(row.day_of_week, list);
    }
    // Sort each day's rows by start time so split shifts read top-to-bottom.
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [admin.workingHours.list, resourceId]);

  // Local-only "row currently being edited" state — we don't push every
  // keystroke to the server. PATCH fires on blur (existing row) or on submit
  // (new row), mirroring the ResourcesTable convention.
  const [drafts, setDrafts] = useState<Record<number, { start_time: string; end_time: string }>>({});
  const draftFor = (dow: number) => drafts[dow] ?? DEFAULT_NEW_ROW;

  const setDraft = (dow: number, patch: Partial<{ start_time: string; end_time: string }>) =>
    setDrafts((prev) => ({ ...prev, [dow]: { ...draftFor(dow), ...patch } }));

  const addRow = async (dow: number) => {
    const draft = draftFor(dow);
    if (!isValidTimeRange(draft.start_time, draft.end_time)) return;
    await admin.workingHours.create({
      resource_id: resourceId,
      day_of_week: dow,
      start_time: draft.start_time,
      end_time: draft.end_time,
    } as Partial<SchedulingWorkingHours>);
    setDrafts((prev) => ({ ...prev, [dow]: DEFAULT_NEW_ROW }));
  };

  const updateRow = async (
    row: SchedulingWorkingHours,
    patch: Partial<Pick<SchedulingWorkingHours, 'start_time' | 'end_time'>>,
  ) => {
    if (
      patch.start_time === row.start_time &&
      patch.end_time === row.end_time
    ) {
      return;
    }
    const next = { ...row, ...patch };
    if (!isValidTimeRange(next.start_time, next.end_time)) return;
    await admin.workingHours.update(row.id, patch);
  };

  const removeRow = async (id: string) => {
    await admin.workingHours.remove(id);
  };

  return (
    <div className={className}>
      {admin.workingHours.error ? (
        <div className={errorClassName} role="alert">
          {admin.workingHours.error}
        </div>
      ) : null}
      {DAYS.map(({ dow, label, short }) => {
        const rows = byDay.get(dow) ?? [];
        return (
          <div key={dow} className={dayClassName}>
            <div className={dayLabelClassName}>
              {dayLabelFormat === 'short' ? short : label}
            </div>
            {rows.length === 0 ? (
              <div className={emptyDayClassName}>{emptyDayLabel}</div>
            ) : null}
            {rows.map((row) => (
              <div key={row.id} className={rowClassName}>
                <input
                  type="time"
                  defaultValue={row.start_time}
                  onBlur={(e) => updateRow(row, { start_time: e.target.value })}
                  className={inputClassName}
                  aria-label={`${label} start time`}
                />
                <input
                  type="time"
                  defaultValue={row.end_time}
                  onBlur={(e) => updateRow(row, { end_time: e.target.value })}
                  className={inputClassName}
                  aria-label={`${label} end time`}
                />
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className={buttonClassName}
                >
                  {removeRowLabel}
                </button>
              </div>
            ))}
            <div className={rowClassName}>
              <input
                type="time"
                value={draftFor(dow).start_time}
                onChange={(e) => setDraft(dow, { start_time: e.target.value })}
                className={inputClassName}
                aria-label={`${label} new start time`}
              />
              <input
                type="time"
                value={draftFor(dow).end_time}
                onChange={(e) => setDraft(dow, { end_time: e.target.value })}
                className={inputClassName}
                aria-label={`${label} new end time`}
              />
              <button
                type="button"
                onClick={() => addRow(dow)}
                className={addButtonClassName ?? buttonClassName}
                disabled={!isValidTimeRange(draftFor(dow).start_time, draftFor(dow).end_time)}
              >
                {addRowLabel}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function isValidTimeRange(start: string, end: string): boolean {
  // Times come in as 'HH:MM'. Compare as strings — works for ISO time-of-day
  // because lex order matches chronological order within a day.
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return false;
  return start < end;
}
