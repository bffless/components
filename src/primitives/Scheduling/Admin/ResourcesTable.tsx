import { useState, type FormEvent, type ReactNode } from 'react';
import type { UseSchedulingAdminResult } from '../../../hooks/useSchedulingAdmin';
import type { UseGoogleCalendarConnectResult } from '../../../hooks/useGoogleCalendarConnect';
import type { SchedulingResource } from '../../../types/scheduling';

export interface SchedulingResourcesTableProps {
  admin: UseSchedulingAdminResult;
  /**
   * Optional. When provided, the sub-calendar dropdown is sourced from
   * `connect.availableCalendars`. When omitted (or when the integration is
   * not connected), the dropdown collapses to a "Connect Google to map
   * calendars" hint.
   */
  connect?: UseGoogleCalendarConnectResult;
  className?: string;
  rowClassName?: string;
  inputClassName?: string;
  buttonClassName?: string;
  onCreated?: (resource: SchedulingResource) => void;
  renderRow?: (
    resource: SchedulingResource,
    actions: {
      update: (patch: Partial<SchedulingResource>) => Promise<void>;
      remove: () => Promise<void>;
    },
  ) => ReactNode;
  addLabel?: ReactNode;
}

const EMPTY_DRAFT: Partial<SchedulingResource> = {
  name: '',
  active: true,
};

export function SchedulingResourcesTable({
  admin,
  connect,
  className,
  rowClassName,
  inputClassName,
  buttonClassName,
  onCreated,
  renderRow,
  addLabel,
}: SchedulingResourcesTableProps) {
  const [draft, setDraft] = useState<Partial<SchedulingResource>>(EMPTY_DRAFT);

  const submitNew = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!draft.name) return;
    const created = await admin.resources.create(draft);
    if (created) {
      setDraft(EMPTY_DRAFT);
      onCreated?.(created);
    }
  };

  const calendarsConnected =
    connect && connect.status === 'connected' && connect.availableCalendars.length > 0;

  return (
    <div className={className}>
      {admin.resources.loading && admin.resources.list.length === 0 ? (
        <div>Loading resources…</div>
      ) : null}
      {admin.resources.error ? (
        <div role="alert">{admin.resources.error}</div>
      ) : null}

      {admin.resources.list.map((resource) => {
        const actions = {
          update: async (patch: Partial<SchedulingResource>) => {
            await admin.resources.update(resource.id, patch);
          },
          remove: async () => {
            await admin.resources.remove(resource.id);
          },
        };
        if (renderRow) return <div key={resource.id}>{renderRow(resource, actions)}</div>;
        return (
          <div key={resource.id} className={rowClassName}>
            <input
              type="text"
              defaultValue={resource.name}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== resource.name) actions.update({ name: next });
              }}
              className={inputClassName}
            />
            {calendarsConnected ? (
              <select
                value={resource.google_calendar_id ?? ''}
                onChange={(e) =>
                  actions.update({ google_calendar_id: e.target.value || null })
                }
                className={inputClassName}
              >
                <option value="">No calendar mirror</option>
                {connect!.availableCalendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.summary}
                    {cal.primary ? ' (primary)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <small>
                {connect
                  ? 'Connect Google to map calendars'
                  : 'Calendar mirror disabled'}
              </small>
            )}
            <button
              type="button"
              className={buttonClassName}
              onClick={() => actions.update({ active: !resource.active })}
            >
              {resource.active ? 'Active' : 'Hidden'}
            </button>
            <button
              type="button"
              className={buttonClassName}
              onClick={() => actions.remove()}
            >
              Delete
            </button>
          </div>
        );
      })}

      <form onSubmit={submitNew} className={rowClassName}>
        <input
          type="text"
          required
          placeholder="Name (e.g., stylist, instructor)"
          value={draft.name ?? ''}
          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
          className={inputClassName}
        />
        <input
          type="email"
          placeholder="Email (optional)"
          value={draft.email ?? ''}
          onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))}
          className={inputClassName}
        />
        <button type="submit" className={buttonClassName}>
          {addLabel ?? 'Add resource'}
        </button>
      </form>
    </div>
  );
}
