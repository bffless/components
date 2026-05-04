import { useState, type FormEvent, type ReactNode } from 'react';
import type { UseSchedulingAdminResult } from '../../../hooks/useSchedulingAdmin';
import type { SchedulingService } from '../../../types/scheduling';

export interface SchedulingServicesTableProps {
  admin: UseSchedulingAdminResult;
  className?: string;
  rowClassName?: string;
  inputClassName?: string;
  buttonClassName?: string;
  /** Currency code for price formatting. Defaults to 'USD'. */
  currency?: string;
  /** Called after a successful create (e.g. to refresh another panel). */
  onCreated?: (service: SchedulingService) => void;
  /** Render override for an individual row. */
  renderRow?: (
    service: SchedulingService,
    actions: {
      update: (patch: Partial<SchedulingService>) => Promise<void>;
      remove: () => Promise<void>;
    },
  ) => ReactNode;
  /** Default add-row label text. */
  addLabel?: ReactNode;
}

const EMPTY_DRAFT: Partial<SchedulingService> = {
  name: '',
  duration_minutes: 30,
  price_cents: 0,
  active: true,
};

export function SchedulingServicesTable({
  admin,
  className,
  rowClassName,
  inputClassName,
  buttonClassName,
  currency = 'USD',
  onCreated,
  renderRow,
  addLabel,
}: SchedulingServicesTableProps) {
  const [draft, setDraft] = useState<Partial<SchedulingService>>(EMPTY_DRAFT);

  const submitNew = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!draft.name) return;
    const created = await admin.services.create(draft);
    if (created) {
      setDraft(EMPTY_DRAFT);
      onCreated?.(created);
    }
  };

  return (
    <div className={className}>
      {admin.services.loading && admin.services.list.length === 0 ? (
        <div>Loading services…</div>
      ) : null}
      {admin.services.error ? (
        <div role="alert">{admin.services.error}</div>
      ) : null}

      {admin.services.list.map((service) => {
        const actions = {
          update: async (patch: Partial<SchedulingService>) => {
            await admin.services.update(service.id, patch);
          },
          remove: async () => {
            await admin.services.remove(service.id);
          },
        };
        if (renderRow) return <div key={service.id}>{renderRow(service, actions)}</div>;
        return (
          <div key={service.id} className={rowClassName}>
            <input
              type="text"
              defaultValue={service.name}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== service.name) actions.update({ name: next });
              }}
              className={inputClassName}
            />
            <input
              type="number"
              min={5}
              step={5}
              defaultValue={service.duration_minutes}
              onBlur={(e) => {
                const next = Number(e.target.value);
                if (next > 0 && next !== service.duration_minutes) {
                  actions.update({ duration_minutes: next });
                }
              }}
              className={inputClassName}
            />
            <span>
              {formatPrice(service.price_cents ?? 0, currency)}
            </span>
            <button
              type="button"
              className={buttonClassName}
              onClick={() => actions.update({ active: !service.active })}
            >
              {service.active ? 'Active' : 'Hidden'}
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
          placeholder="Service name"
          value={draft.name ?? ''}
          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
          className={inputClassName}
        />
        <input
          type="number"
          min={5}
          step={5}
          placeholder="Duration (min)"
          value={draft.duration_minutes ?? 30}
          onChange={(e) =>
            setDraft((prev) => ({
              ...prev,
              duration_minutes: Number(e.target.value),
            }))
          }
          className={inputClassName}
        />
        <input
          type="number"
          min={0}
          placeholder="Price (cents)"
          value={draft.price_cents ?? 0}
          onChange={(e) =>
            setDraft((prev) => ({
              ...prev,
              price_cents: Number(e.target.value),
            }))
          }
          className={inputClassName}
        />
        <button type="submit" className={buttonClassName}>
          {addLabel ?? 'Add service'}
        </button>
      </form>
    </div>
  );
}

function formatPrice(cents: number, currency: string): string {
  try {
    return (cents / 100).toLocaleString(undefined, {
      style: 'currency',
      currency,
    });
  } catch {
    return `${(cents / 100).toFixed(2)}`;
  }
}
