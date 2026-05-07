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

/**
 * Parse a dollar amount the user typed into integer cents. Empty / garbage
 * input falls through to 0 — never NaN. Tolerates a leading "$",
 * thousand-separator commas, trailing whitespace.
 *
 * Exported so consumers using a custom `renderRow` can reuse the same
 * conversion in their own price input (the default renderer uses it for
 * both the new-service form and the existing-row inline edit).
 *
 *   dollarsStringToCents("30")       → 3000
 *   dollarsStringToCents("29.99")    → 2999
 *   dollarsStringToCents("$1,200.50") → 120050
 *   dollarsStringToCents("")          → 0
 *   dollarsStringToCents("abc")       → 0
 */
export function dollarsStringToCents(value: string): number {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const normalized = trimmed.replace(/[$,\s]/g, '');
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/**
 * Inverse of dollarsStringToCents — render an integer cent amount as a
 * dollars string suitable for `<input value=…>`. Returns "" for null /
 * zero / negative so the price input shows its placeholder when there's
 * nothing meaningful to display.
 *
 *   centsToDollarsString(3000)  → "30"
 *   centsToDollarsString(2999)  → "29.99"
 *   centsToDollarsString(0)     → ""
 *   centsToDollarsString(null)  → ""
 */
export function centsToDollarsString(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

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
  // Price is held as a separate string while the user types so we don't lose
  // intermediate states (e.g. "30." or "") to a too-eager Number() conversion.
  // Converted to cents at submit time only.
  const [draftPrice, setDraftPrice] = useState<string>('');

  const submitNew = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!draft.name) return;
    const created = await admin.services.create({
      ...draft,
      price_cents: dollarsStringToCents(draftPrice),
    });
    if (created) {
      setDraft(EMPTY_DRAFT);
      setDraftPrice('');
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
            <input
              type="text"
              inputMode="decimal"
              defaultValue={centsToDollarsString(service.price_cents)}
              placeholder="0"
              aria-label={`Price for ${service.name} in dollars`}
              onBlur={(e) => {
                const next = dollarsStringToCents(e.target.value);
                if (next !== (service.price_cents ?? 0)) {
                  actions.update({ price_cents: next });
                }
              }}
              className={inputClassName}
            />
            <span aria-live="polite">
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
          type="text"
          inputMode="decimal"
          placeholder="Price (e.g. 30 or 29.99)"
          aria-label="Price in dollars"
          value={draftPrice}
          onChange={(e) => setDraftPrice(e.target.value)}
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
