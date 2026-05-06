import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import type { UseSchedulingAdminResult } from '../../../hooks/useSchedulingAdmin';
import type { UseGoogleCalendarConnectResult } from '../../../hooks/useGoogleCalendarConnect';
import type { SchedulingResource } from '../../../types/scheduling';

export interface SchedulingResourcesTableRowActions {
  update: (patch: Partial<SchedulingResource>) => Promise<void>;
  remove: () => Promise<void>;
  /** Whether this row is currently expanded. Driven by table-internal state. */
  expanded: boolean;
  /** Flip expansion state for this row. */
  toggleExpanded: () => void;
}

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
  /**
   * Wrapper className applied to the per-row expansion container. Only
   * rendered when `renderExpanded` returns non-null and the row is in the
   * expanded state.
   */
  expandedClassName?: string;
  /**
   * Class for the expand/collapse toggle button when using the default row
   * renderer. Defaults to `buttonClassName`.
   */
  expandToggleClassName?: string;
  inputClassName?: string;
  buttonClassName?: string;
  onCreated?: (resource: SchedulingResource) => void;
  renderRow?: (
    resource: SchedulingResource,
    actions: SchedulingResourcesTableRowActions,
  ) => ReactNode;
  /**
   * Optional renderer for the per-row expanded panel. When provided, each
   * row gets a built-in expand toggle (default renderer) or `actions.toggleExpanded`
   * (custom renderer) and the returned node renders inside the row's
   * expansion container.
   *
   * Use this to mount per-stylist sub-primitives like
   * `<SchedulingServicesPicker>`, `<SchedulingWorkingHoursEditor>`, and
   * `<SchedulingTimeOffList>`. When omitted, no expansion UI is rendered —
   * the table behaves exactly as it did before this prop existed.
   */
  renderExpanded?: (
    resource: SchedulingResource,
    actions: SchedulingResourcesTableRowActions,
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
  expandedClassName,
  expandToggleClassName,
  inputClassName,
  buttonClassName,
  onCreated,
  renderRow,
  renderExpanded,
  addLabel,
}: SchedulingResourcesTableProps) {
  const [draft, setDraft] = useState<Partial<SchedulingResource>>(EMPTY_DRAFT);

  // Expansion state lives in the table, keyed by resource id. The default-row
  // renderer wires the toggle through a built-in button; custom renderers
  // use actions.toggleExpanded. Multiple rows can be expanded at once — the
  // common admin task is "configure rico, then alex" and forcing only-one-at-a-time
  // collapses any unsaved scroll position when the second row opens.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
        const expanded = expandedIds.has(resource.id);
        const actions: SchedulingResourcesTableRowActions = {
          update: async (patch: Partial<SchedulingResource>) => {
            await admin.resources.update(resource.id, patch);
          },
          remove: async () => {
            await admin.resources.remove(resource.id);
          },
          expanded,
          toggleExpanded: () => toggleExpanded(resource.id),
        };

        const expandedNode =
          renderExpanded && expanded ? renderExpanded(resource, actions) : null;

        if (renderRow) {
          return (
            <div key={resource.id}>
              {renderRow(resource, actions)}
              {expandedNode ? (
                <div className={expandedClassName}>{expandedNode}</div>
              ) : null}
            </div>
          );
        }

        return (
          <div key={resource.id}>
            <div className={rowClassName}>
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
              {renderExpanded ? (
                <button
                  type="button"
                  className={expandToggleClassName ?? buttonClassName}
                  aria-expanded={expanded}
                  onClick={actions.toggleExpanded}
                >
                  {expanded ? 'Close' : 'Configure'}
                </button>
              ) : null}
              <button
                type="button"
                className={buttonClassName}
                onClick={() => actions.remove()}
              >
                Delete
              </button>
            </div>
            {expandedNode ? (
              <div className={expandedClassName}>{expandedNode}</div>
            ) : null}
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
