import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveSchedulingBasePath,
  schedulingGet,
  schedulingPost,
  SchedulingClientError,
} from '../lib/schedulingClient';
import type {
  SchedulingBookingDetails,
  SchedulingConfirmedBooking,
  SchedulingResource,
  SchedulingService,
  SchedulingSlot,
  SchedulingState,
} from '../types/scheduling';

export interface UseSchedulingOptions {
  /** Override the API base path. Default: auto-detect via resolveSchedulingBasePath(). */
  apiBase?: string;
  /** Called once a booking is confirmed (use this to redirect, fire analytics, etc.). */
  onConfirmed?: (booking: SchedulingConfirmedBooking) => void;
  /**
   * If true, the hook will not auto-load services on mount — the consumer
   * calls `loadServices()` explicitly. Useful if the booking flow is gated
   * behind a CTA and the initial fetch shouldn't happen until the user opens it.
   */
  skipInitialLoad?: boolean;
  /**
   * Allow the customer to pick "Any available" instead of a specific resource.
   * Defaults to false — most templates want explicit resource selection. When
   * true, `pickResource(null)` is permitted and availability fans out across
   * all eligible resources.
   */
  allowAnyResource?: boolean;
}

export interface UseSchedulingResult {
  basePath: string;
  state: SchedulingState;

  services: SchedulingService[];
  resources: SchedulingResource[];
  slots: SchedulingSlot[];

  /** Catalog or availability fetch in flight. Submission has its own state status. */
  loading: boolean;
  /** Last error string (catalog/availability/submit). Cleared on next successful op. */
  error: string | null;

  loadServices: () => Promise<void>;
  pickService: (service: SchedulingService) => Promise<void>;
  pickResource: (resource: SchedulingResource | null) => Promise<void>;
  loadAvailability: (from: string, to: string) => Promise<void>;
  pickSlot: (slot: SchedulingSlot) => void;
  setDetails: (details: SchedulingBookingDetails) => void;
  submit: () => Promise<void>;

  /** Reset to idle, preserving the cached `services` list so the picker stays warm. */
  reset: () => void;

  /** Step back one stage of the flow without nuking caches. */
  back: () => void;
}

interface ServicesResponse { services?: SchedulingService[] }
interface ResourcesResponse { resources?: SchedulingResource[] }
interface AvailabilityResponse { slots?: SchedulingSlot[]; googleSkipped?: boolean }
interface BookingResponse {
  booking_id?: string;
  id?: string;
  reschedule_token?: string;
  calendar_event_link?: string | null;
  googleSkipped?: boolean;
}

export function useScheduling(opts: UseSchedulingOptions = {}): UseSchedulingResult {
  const basePath = useMemo(
    () => opts.apiBase ?? resolveSchedulingBasePath(),
    [opts.apiBase],
  );

  const [state, setState] = useState<SchedulingState>({ status: 'idle' });
  const [services, setServices] = useState<SchedulingService[]>([]);
  const [resources, setResources] = useState<SchedulingResource[]>([]);
  const [slots, setSlots] = useState<SchedulingSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Snapshot the latest onConfirmed so callers don't have to memoize it.
  const onConfirmedRef = useRef(opts.onConfirmed);
  onConfirmedRef.current = opts.onConfirmed;

  // Single in-flight submit guard — re-entrant submits are no-ops, not races.
  const submittingRef = useRef(false);

  const setErr = useCallback((err: unknown, fallback: string) => {
    if (err instanceof SchedulingClientError) {
      setError(err.message);
    } else if (err instanceof Error) {
      setError(err.message);
    } else {
      setError(fallback);
    }
  }, []);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await schedulingGet<ServicesResponse>(basePath, '/services');
      setServices(data?.services ?? []);
    } catch (err) {
      setErr(err, 'Failed to load services.');
    } finally {
      setLoading(false);
    }
  }, [basePath, setErr]);

  // Initial fetch — populates the picker without the consumer wiring it.
  useEffect(() => {
    if (opts.skipInitialLoad) return;
    loadServices();
  }, [loadServices, opts.skipInitialLoad]);

  const loadResourcesForService = useCallback(
    async (serviceId: string): Promise<SchedulingResource[]> => {
      const data = await schedulingGet<ResourcesResponse>(basePath, '/resources', {
        service_id: serviceId,
      });
      const list = data?.resources ?? [];
      setResources(list);
      return list;
    },
    [basePath],
  );

  const pickService = useCallback(
    async (service: SchedulingService) => {
      setError(null);
      setSlots([]);
      setState({ status: 'service_selected', service });
      setLoading(true);
      try {
        const list = await loadResourcesForService(service.id);
        // UX win: if there's only one viable resource, auto-pick it so the
        // customer doesn't see a single-card "picker".
        if (list.length === 1) {
          setState({
            status: 'resource_selected',
            service,
            resource: list[0],
          });
        }
      } catch (err) {
        setErr(err, 'Failed to load available providers.');
      } finally {
        setLoading(false);
      }
    },
    [loadResourcesForService, setErr],
  );

  const pickResource = useCallback(
    async (resource: SchedulingResource | null) => {
      if (resource === null && !opts.allowAnyResource) {
        return;
      }
      setError(null);
      setSlots([]);
      setState((prev) => {
        // Resource pick is only meaningful once a service has been chosen.
        if (prev.status === 'idle' || prev.status === 'error') return prev;
        const service =
          'service' in prev ? prev.service : (null as unknown as SchedulingService);
        if (!service) return prev;
        return { status: 'resource_selected', service, resource };
      });
    },
    [opts.allowAnyResource],
  );

  const loadAvailability = useCallback(
    async (from: string, to: string) => {
      setError(null);
      setLoading(true);
      try {
        // Read the latest state via setState callback — we need service +
        // resource without depending on stale closure values.
        let serviceId: string | undefined;
        let resourceId: string | undefined;
        setState((prev) => {
          if ('service' in prev && prev.service) serviceId = prev.service.id;
          if ('resource' in prev && prev.resource) resourceId = prev.resource.id;
          return prev;
        });
        if (!serviceId) {
          setError('Pick a service before loading availability.');
          return;
        }
        const data = await schedulingGet<AvailabilityResponse>(
          basePath,
          '/availability',
          {
            service_id: serviceId,
            resource_id: resourceId ?? undefined,
            from,
            to,
          },
        );
        setSlots(data?.slots ?? []);
      } catch (err) {
        setErr(err, 'Failed to load availability.');
      } finally {
        setLoading(false);
      }
    },
    [basePath, setErr],
  );

  const pickSlot = useCallback((slot: SchedulingSlot) => {
    setState((prev) => {
      if (
        prev.status !== 'resource_selected' &&
        prev.status !== 'slot_selected' &&
        prev.status !== 'details_filled'
      ) {
        return prev;
      }
      return {
        status: 'slot_selected',
        service: prev.service,
        resource: prev.resource,
        slot,
      };
    });
  }, []);

  const setDetails = useCallback((details: SchedulingBookingDetails) => {
    setState((prev) => {
      if (prev.status !== 'slot_selected' && prev.status !== 'details_filled') {
        return prev;
      }
      return {
        status: 'details_filled',
        service: prev.service,
        resource: prev.resource,
        slot: prev.slot,
        details,
      };
    });
  }, []);

  const submit = useCallback(async () => {
    if (submittingRef.current) return;

    let payloadState:
      | Extract<SchedulingState, { status: 'details_filled' }>
      | null = null;
    setState((prev) => {
      if (prev.status === 'details_filled') {
        payloadState = prev;
        return {
          status: 'submitting',
          service: prev.service,
          resource: prev.resource,
          slot: prev.slot,
          details: prev.details,
        };
      }
      return prev;
    });
    if (!payloadState) {
      setError('Fill in your details before submitting.');
      return;
    }

    submittingRef.current = true;
    setError(null);
    try {
      const captured = payloadState as Extract<SchedulingState, { status: 'details_filled' }>;
      const data = await schedulingPost<BookingResponse>(basePath, '/bookings', {
        service_id: captured.service.id,
        resource_id: captured.resource?.id ?? null,
        starts_at: captured.slot.start,
        ends_at: captured.slot.end,
        customer_name: captured.details.customer_name,
        customer_email: captured.details.customer_email,
        customer_phone: captured.details.customer_phone ?? null,
        notes: captured.details.notes ?? null,
      });

      const booking: SchedulingConfirmedBooking = {
        id: data?.booking_id ?? data?.id ?? '',
        reschedule_token: data?.reschedule_token ?? null,
        calendar_event_link: data?.calendar_event_link ?? null,
        googleSkipped: data?.googleSkipped,
      };

      setState({
        status: 'confirmed',
        service: captured.service,
        resource: captured.resource,
        slot: captured.slot,
        details: captured.details,
        booking,
      });
      onConfirmedRef.current?.(booking);
    } catch (err) {
      const message =
        err instanceof SchedulingClientError ? err.message
        : err instanceof Error ? err.message
        : 'Booking failed.';
      setError(message);
      // Step back to details_filled so the consumer can retry without
      // re-entering anything.
      setState((prev) =>
        prev.status === 'submitting'
          ? {
              status: 'details_filled',
              service: prev.service,
              resource: prev.resource,
              slot: prev.slot,
              details: prev.details,
            }
          : prev,
      );
    } finally {
      submittingRef.current = false;
    }
  }, [basePath]);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
    setResources([]);
    setSlots([]);
    setError(null);
    // Intentionally keep `services` so the next opening of the flow doesn't
    // re-fetch the catalog.
  }, []);

  const back = useCallback(() => {
    setState((prev) => {
      switch (prev.status) {
        case 'service_selected':
          return { status: 'idle' };
        case 'resource_selected':
          return { status: 'service_selected', service: prev.service };
        case 'slot_selected':
          return {
            status: 'resource_selected',
            service: prev.service,
            resource: prev.resource,
          };
        case 'details_filled':
          return {
            status: 'slot_selected',
            service: prev.service,
            resource: prev.resource,
            slot: prev.slot,
          };
        default:
          return prev;
      }
    });
  }, []);

  return {
    basePath,
    state,
    services,
    resources,
    slots,
    loading,
    error,
    loadServices,
    pickService,
    pickResource,
    loadAvailability,
    pickSlot,
    setDetails,
    submit,
    reset,
    back,
  };
}
