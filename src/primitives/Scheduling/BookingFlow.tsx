import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  useScheduling,
  type UseSchedulingOptions,
  type UseSchedulingResult,
} from '../../hooks/useScheduling';
import type {
  SchedulingResource,
  SchedulingService,
  SchedulingSlot,
  SchedulingState,
} from '../../types/scheduling';

// ─── Context ──────────────────────────────────────────────────────────────────

const BookingFlowContext = createContext<UseSchedulingResult | null>(null);

function useBookingFlowContext(): UseSchedulingResult {
  const ctx = useContext(BookingFlowContext);
  if (!ctx) {
    throw new Error('<BookingFlow.*> must be rendered inside <BookingFlow>.');
  }
  return ctx;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export interface BookingFlowProps extends UseSchedulingOptions {
  className?: string;
  children: ReactNode;
  /**
   * Optionally pass an externally-managed scheduling result (e.g. a hook
   * lifted into a parent island so a CTA button can read state too). When
   * omitted, the root creates its own via useScheduling().
   */
  scheduling?: UseSchedulingResult;
}

function BookingFlowRoot({
  className,
  children,
  scheduling: external,
  ...hookOpts
}: BookingFlowProps) {
  const internal = useScheduling(external ? {} : hookOpts);
  const value = external ?? internal;
  return (
    <BookingFlowContext.Provider value={value}>
      <div className={className}>{children}</div>
    </BookingFlowContext.Provider>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_ORDER = [
  'idle',
  'service_selected',
  'resource_selected',
  'slot_selected',
  'details_filled',
  'submitting',
  'confirmed',
  'error',
] as const;

type Stage = (typeof STAGE_ORDER)[number];

function stageIndex(stage: Stage): number {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx === -1 ? -1 : idx;
}

function reachedAtLeast(state: SchedulingState, stage: Stage): boolean {
  return stageIndex(state.status as Stage) >= stageIndex(stage);
}

// ─── Service picker ───────────────────────────────────────────────────────────

export interface BookingFlowServiceProps {
  className?: string;
  /**
   * Render override. Receives the full list of services and a `pick` handler.
   * If omitted, the picker renders one button per service.
   */
  children?: (
    services: SchedulingService[],
    pick: (s: SchedulingService) => void,
  ) => ReactNode;
  itemClassName?: string;
  /** Renderer for a single service tile, used by the default body. */
  renderItem?: (service: SchedulingService, pick: () => void) => ReactNode;
  /** Render when `services.length === 0` and not loading. Defaults to `null`. */
  emptyState?: ReactNode;
}

function ServicePicker({
  className,
  children,
  itemClassName,
  renderItem,
  emptyState = null,
}: BookingFlowServiceProps) {
  const flow = useBookingFlowContext();
  // Visible only on idle — once a service is picked the resource picker
  // takes over. Consumers can render `<BookingFlow.Service />` first in
  // flow order and let it auto-hide as the state advances.
  if (flow.state.status !== 'idle') return null;

  if (children) {
    return (
      <div className={className}>{children(flow.services, flow.pickService)}</div>
    );
  }

  if (flow.services.length === 0) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div className={className}>
      {flow.services.map((service) => {
        const pick = () => flow.pickService(service);
        if (renderItem) return <div key={service.id}>{renderItem(service, pick)}</div>;
        return (
          <button
            key={service.id}
            type="button"
            className={itemClassName}
            onClick={pick}
          >
            <span>{service.name}</span>
            {service.duration_minutes ? (
              <span>{service.duration_minutes}m</span>
            ) : null}
            {typeof service.price_cents === 'number' && service.price_cents > 0 ? (
              <span>{formatPrice(service.price_cents)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ─── Resource picker ──────────────────────────────────────────────────────────

export interface BookingFlowResourceProps {
  className?: string;
  itemClassName?: string;
  anyResourceLabel?: ReactNode;
  /** Custom renderer for the whole list. */
  children?: (
    resources: SchedulingResource[],
    pick: (r: SchedulingResource | null) => void,
  ) => ReactNode;
  renderItem?: (resource: SchedulingResource, pick: () => void) => ReactNode;
  emptyState?: ReactNode;
}

function ResourcePicker({
  className,
  itemClassName,
  anyResourceLabel,
  children,
  renderItem,
  emptyState = null,
}: BookingFlowResourceProps) {
  const flow = useBookingFlowContext();

  // Visible when the customer just picked a service and we're waiting for
  // them to pick a resource. Hide once they advance, or if the hook
  // auto-advanced because there's only one resource.
  if (flow.state.status !== 'service_selected') return null;

  if (children) {
    return (
      <div className={className}>{children(flow.resources, flow.pickResource)}</div>
    );
  }

  if (flow.resources.length === 0) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div className={className}>
      {anyResourceLabel ? (
        <button
          type="button"
          className={itemClassName}
          onClick={() => flow.pickResource(null)}
        >
          {anyResourceLabel}
        </button>
      ) : null}
      {flow.resources.map((resource) => {
        const pick = () => flow.pickResource(resource);
        if (renderItem) return <div key={resource.id}>{renderItem(resource, pick)}</div>;
        return (
          <button
            key={resource.id}
            type="button"
            className={itemClassName}
            onClick={pick}
          >
            <span>{resource.name}</span>
            {resource.bio ? <small>{resource.bio}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

// ─── Date/time picker ─────────────────────────────────────────────────────────

export interface BookingFlowDateTimeProps {
  className?: string;
  /** Default: 7 (one week strip from `from`). */
  windowDays?: number;
  /** Default: today's UTC midnight. */
  from?: Date;
  itemClassName?: string;
  /** Format a slot for the default button label. */
  formatSlot?: (slot: SchedulingSlot) => ReactNode;
  /** Custom whole-list renderer. */
  children?: (
    slots: SchedulingSlot[],
    pick: (slot: SchedulingSlot) => void,
  ) => ReactNode;
  emptyState?: ReactNode;
}

function DateTimePicker({
  className,
  windowDays = 7,
  from,
  itemClassName,
  formatSlot,
  children,
  emptyState = null,
}: BookingFlowDateTimeProps) {
  const flow = useBookingFlowContext();

  // Compute window once per (resource_selected | slot_selected) state so we
  // don't refetch on every render.
  const range = useMemo(() => {
    const start = from ?? new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + windowDays);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [from, windowDays]);

  // Refetch availability whenever a fresh resource (or "any") is selected,
  // OR when the customer steps back from slot_selected to resource_selected.
  // We intentionally don't refetch every render to avoid hammering the API.
  const stage = flow.state.status;
  useEffect(() => {
    if (stage !== 'resource_selected') return;
    flow.loadAvailability(range.from, range.to);
    // Hook's loadAvailability is stable enough; range memoized above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, range.from, range.to]);

  if (stage !== 'resource_selected' && stage !== 'slot_selected') return null;

  if (children) {
    return <div className={className}>{children(flow.slots, flow.pickSlot)}</div>;
  }

  if (flow.slots.length === 0) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div className={className}>
      {flow.slots.map((slot) => (
        <button
          key={`${slot.resource_id}-${slot.start}`}
          type="button"
          className={itemClassName}
          onClick={() => flow.pickSlot(slot)}
        >
          {formatSlot ? formatSlot(slot) : defaultFormatSlot(slot)}
        </button>
      ))}
    </div>
  );
}

// ─── Details form ─────────────────────────────────────────────────────────────

export interface BookingFlowDetailsProps {
  className?: string;
  inputClassName?: string;
  submitClassName?: string;
  submitLabel?: ReactNode;
  /** Show a phone field. Defaults to true. */
  includePhone?: boolean;
  /** Show a notes field. Defaults to true. */
  includeNotes?: boolean;
  /** Pre-fill values (e.g. signed-in customer). */
  defaults?: Partial<{
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    notes: string;
  }>;
  /** Custom error renderer. */
  renderError?: (error: string) => ReactNode;
}

function DetailsForm({
  className,
  inputClassName,
  submitClassName,
  submitLabel,
  includePhone = true,
  includeNotes = true,
  defaults,
  renderError,
}: BookingFlowDetailsProps) {
  const flow = useBookingFlowContext();
  const stage = flow.state.status;
  const visible =
    stage === 'slot_selected' ||
    stage === 'details_filled' ||
    stage === 'submitting';
  if (!visible) return null;

  const handle = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (stage === 'submitting') return;
    const fd = new FormData(e.currentTarget);
    flow.setDetails({
      customer_name: String(fd.get('customer_name') ?? '').trim(),
      customer_email: String(fd.get('customer_email') ?? '').trim(),
      customer_phone: includePhone
        ? String(fd.get('customer_phone') ?? '').trim() || undefined
        : undefined,
      notes: includeNotes
        ? String(fd.get('notes') ?? '').trim() || undefined
        : undefined,
    });
    // submit() reads the latest state (it does its own setState callback peek).
    void flow.submit();
  };

  const submitting = stage === 'submitting';

  return (
    <form className={className} onSubmit={handle} noValidate>
      <input
        type="text"
        name="customer_name"
        autoComplete="name"
        required
        defaultValue={defaults?.customer_name ?? ''}
        placeholder="Your name"
        className={inputClassName}
      />
      <input
        type="email"
        name="customer_email"
        autoComplete="email"
        required
        defaultValue={defaults?.customer_email ?? ''}
        placeholder="Email"
        className={inputClassName}
      />
      {includePhone ? (
        <input
          type="tel"
          name="customer_phone"
          autoComplete="tel"
          defaultValue={defaults?.customer_phone ?? ''}
          placeholder="Phone (optional)"
          className={inputClassName}
        />
      ) : null}
      {includeNotes ? (
        <textarea
          name="notes"
          defaultValue={defaults?.notes ?? ''}
          placeholder="Anything we should know? (optional)"
          className={inputClassName}
        />
      ) : null}
      {flow.error ? (
        renderError ? (
          renderError(flow.error)
        ) : (
          <div role="alert">{flow.error}</div>
        )
      ) : null}
      <button type="submit" disabled={submitting} className={submitClassName}>
        {submitLabel ?? (submitting ? 'Booking…' : 'Confirm booking')}
      </button>
    </form>
  );
}

// ─── Confirmation ─────────────────────────────────────────────────────────────

export interface BookingFlowConfirmProps {
  className?: string;
  /** Custom renderer. Receives the confirmed state. */
  children?: (
    state: Extract<SchedulingState, { status: 'confirmed' }>,
  ) => ReactNode;
}

function Confirmation({ className, children }: BookingFlowConfirmProps) {
  const flow = useBookingFlowContext();
  if (flow.state.status !== 'confirmed') return null;
  if (children) return <div className={className}>{children(flow.state)}</div>;

  const { service, resource, slot, booking } = flow.state;
  return (
    <div className={className}>
      <h3>You're booked.</h3>
      <p>
        {service.name}
        {resource ? ` with ${resource.name}` : ''} on{' '}
        <strong>{defaultFormatSlot(slot)}</strong>.
      </p>
      {booking.calendar_event_link ? (
        <p>
          <a
            href={booking.calendar_event_link}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Google Calendar
          </a>
        </p>
      ) : null}
      {booking.googleSkipped ? (
        <small>(Calendar sync skipped — you'll still get an email.)</small>
      ) : null}
    </div>
  );
}

// ─── Default formatters (no CSS framework imports allowed) ────────────────────

function defaultFormatSlot(slot: SchedulingSlot): string {
  try {
    const start = new Date(slot.start);
    return start.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return slot.start;
  }
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
  });
}

// ─── Compound export ──────────────────────────────────────────────────────────

export const BookingFlow = Object.assign(BookingFlowRoot, {
  Service: ServicePicker,
  Resource: ResourcePicker,
  DateTime: DateTimePicker,
  Details: DetailsForm,
  Confirm: Confirmation,
});
