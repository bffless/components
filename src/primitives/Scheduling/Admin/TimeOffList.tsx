import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { UseSchedulingAdminResult } from '../../../hooks/useSchedulingAdmin';
import type { SchedulingTimeOff } from '../../../types/scheduling';

export interface SchedulingTimeOffListProps {
  admin: UseSchedulingAdminResult;
  /**
   * Resource whose time-off blocks we're editing. Pass `null` for site-wide
   * blocks (rows where `resource_id is null`) — used by the "Salon closures"
   * panel.
   */
  resourceId: string | null;
  className?: string;
  rowClassName?: string;
  inputClassName?: string;
  buttonClassName?: string;
  addButtonClassName?: string;
  errorClassName?: string;
  emptyState?: ReactNode;
  /**
   * How to format the date for display in the row. Default uses
   * `Intl.DateTimeFormat` with the visitor's locale + `weekday: 'short'`.
   */
  formatDate?: (iso: string) => ReactNode;
  addLabel?: ReactNode;
  removeLabel?: ReactNode;
}

interface DraftEntry {
  starts_at: string; // YYYY-MM-DD (date input)
  ends_at: string;
  reason: string;
}

const EMPTY_DRAFT: DraftEntry = { starts_at: '', ends_at: '', reason: '' };

export function SchedulingTimeOffList({
  admin,
  resourceId,
  className,
  rowClassName,
  inputClassName,
  buttonClassName,
  addButtonClassName,
  errorClassName,
  emptyState,
  formatDate,
  addLabel = '+ Add closure',
  removeLabel = 'Remove',
}: SchedulingTimeOffListProps) {
  const [draft, setDraft] = useState<DraftEntry>(EMPTY_DRAFT);

  // Filter + sort by starts_at so soonest-coming closures show first.
  const rows = useMemo(() => {
    const filtered = admin.timeOff.list.filter((row) =>
      resourceId === null ? row.resource_id === null : row.resource_id === resourceId,
    );
    filtered.sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
    return filtered;
  }, [admin.timeOff.list, resourceId]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!draft.starts_at || !draft.ends_at) return;
    // The schema stores `starts_at` and `ends_at` as ISO timestamps. The
    // <input type="date"> gives us YYYY-MM-DD only — append a time so the
    // resulting timestamp is unambiguous (closures are full-day).
    const startsAtIso = `${draft.starts_at}T00:00:00.000Z`;
    const endsAtIso = `${draft.ends_at}T23:59:59.999Z`;
    if (startsAtIso > endsAtIso) return;
    await admin.timeOff.create({
      resource_id: resourceId,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      reason: draft.reason || null,
    } as Partial<SchedulingTimeOff>);
    setDraft(EMPTY_DRAFT);
  };

  const remove = async (id: string) => {
    await admin.timeOff.remove(id);
  };

  return (
    <div className={className}>
      {admin.timeOff.error ? (
        <div className={errorClassName} role="alert">
          {admin.timeOff.error}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div>
          {emptyState ?? (
            <p>No closures scheduled. Add a date range below to block off bookings.</p>
          )}
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.id} className={rowClassName}>
            <span>{formatDate ? formatDate(row.starts_at) : defaultFormat(row.starts_at)}</span>
            <span>→</span>
            <span>{formatDate ? formatDate(row.ends_at) : defaultFormat(row.ends_at)}</span>
            {row.reason ? <span>{row.reason}</span> : null}
            <button type="button" onClick={() => remove(row.id)} className={buttonClassName}>
              {removeLabel}
            </button>
          </div>
        ))
      )}

      <form onSubmit={submit} className={rowClassName}>
        <input
          type="date"
          required
          value={draft.starts_at}
          onChange={(e) => setDraft((prev) => ({ ...prev, starts_at: e.target.value }))}
          className={inputClassName}
          aria-label="Closure starts on"
        />
        <input
          type="date"
          required
          value={draft.ends_at}
          onChange={(e) => setDraft((prev) => ({ ...prev, ends_at: e.target.value }))}
          className={inputClassName}
          aria-label="Closure ends on"
        />
        <input
          type="text"
          placeholder="Reason (optional)"
          value={draft.reason}
          onChange={(e) => setDraft((prev) => ({ ...prev, reason: e.target.value }))}
          className={inputClassName}
          aria-label="Closure reason"
        />
        <button type="submit" className={addButtonClassName ?? buttonClassName}>
          {addLabel}
        </button>
      </form>
    </div>
  );
}

function defaultFormat(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
