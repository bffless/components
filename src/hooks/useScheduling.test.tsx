import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useScheduling } from './useScheduling';
import type {
  SchedulingResource,
  SchedulingService,
  SchedulingSlot,
} from '../types/scheduling';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const SERVICES: SchedulingService[] = [
  { id: 'svc-cut', name: 'Cut', duration_minutes: 30, active: true },
  { id: 'svc-color', name: 'Color', duration_minutes: 90, active: true },
];

const RESOURCES_TWO: SchedulingResource[] = [
  { id: 'res-camille', name: 'Camille', active: true, sort_order: 1 },
  { id: 'res-jordan', name: 'Jordan', active: true, sort_order: 2 },
];

const RESOURCES_ONE: SchedulingResource[] = [
  { id: 'res-camille', name: 'Camille', active: true, sort_order: 1 },
];

const SLOTS: SchedulingSlot[] = [
  {
    start: '2026-05-10T14:00:00.000Z',
    end: '2026-05-10T14:30:00.000Z',
    resource_id: 'res-camille',
  },
  {
    start: '2026-05-10T14:30:00.000Z',
    end: '2026-05-10T15:00:00.000Z',
    resource_id: 'res-camille',
  },
];

// ─── Fetch mock helpers ──────────────────────────────────────────────────────

interface MockResponse {
  status?: number;
  body: unknown;
}

function mockResponse({ status = 200, body }: MockResponse): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetch(
  routes: Record<string, MockResponse | ((req: Request) => MockResponse)>,
) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: unknown = undefined;
    if (init?.body && typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, method, body });
    // Match by URL prefix (ignore query string for simplicity unless explicit).
    const path = url.split('?')[0];
    const handler = routes[`${method} ${path}`] ?? routes[path];
    if (!handler) {
      throw new Error(`No fetch mock for ${method} ${path}`);
    }
    const r = typeof handler === 'function'
      ? handler(new Request(url, init))
      : handler;
    return mockResponse(r);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── Initial load ─────────────────────────────────────────────────────────────

describe('useScheduling — initial load', () => {
  it('fetches services on mount and exposes them in state', async () => {
    installFetch({
      'GET /_bffless/scheduling/services': { body: { services: SERVICES } },
    });

    const { result } = renderHook(() => useScheduling());
    await waitFor(() => expect(result.current.services.length).toBe(2));
    expect(result.current.state.status).toBe('idle');
    expect(result.current.services[0].name).toBe('Cut');
  });

  it('skipInitialLoad suppresses the initial /services fetch', async () => {
    const { calls } = installFetch({
      'GET /_bffless/scheduling/services': { body: { services: SERVICES } },
    });

    renderHook(() => useScheduling({ skipInitialLoad: true }));
    // Give effects a tick to run.
    await act(async () => {});
    expect(calls.length).toBe(0);
  });
});

// ─── State machine: pickService → resource_selected ──────────────────────────

describe('useScheduling — state machine', () => {
  it('pickService advances to service_selected and fetches resources', async () => {
    installFetch({
      'GET /_bffless/scheduling/services': { body: { services: SERVICES } },
      'GET /_bffless/scheduling/resources': { body: { resources: RESOURCES_TWO } },
    });

    const { result } = renderHook(() => useScheduling());
    await waitFor(() => expect(result.current.services.length).toBe(2));

    await act(async () => {
      await result.current.pickService(SERVICES[0]);
    });

    expect(result.current.state.status).toBe('service_selected');
    expect(result.current.resources).toHaveLength(2);
  });

  it('autoSkipSingleResource defaults to false — single-resource list does NOT auto-advance', async () => {
    installFetch({
      'GET /_bffless/scheduling/services': { body: { services: SERVICES } },
      'GET /_bffless/scheduling/resources': { body: { resources: RESOURCES_ONE } },
    });

    const { result } = renderHook(() => useScheduling());
    await waitFor(() => expect(result.current.services.length).toBe(2));

    await act(async () => {
      await result.current.pickService(SERVICES[0]);
    });

    expect(result.current.state.status).toBe('service_selected');
  });

  it('autoSkipSingleResource: true with one resource advances to resource_selected', async () => {
    installFetch({
      'GET /_bffless/scheduling/services': { body: { services: SERVICES } },
      'GET /_bffless/scheduling/resources': { body: { resources: RESOURCES_ONE } },
    });

    const { result } = renderHook(() =>
      useScheduling({ autoSkipSingleResource: true }),
    );
    await waitFor(() => expect(result.current.services.length).toBe(2));

    await act(async () => {
      await result.current.pickService(SERVICES[0]);
    });

    expect(result.current.state.status).toBe('resource_selected');
  });

  it('pickResource advances to resource_selected', async () => {
    installFetch({
      'GET /_bffless/scheduling/services': { body: { services: SERVICES } },
      'GET /_bffless/scheduling/resources': { body: { resources: RESOURCES_TWO } },
    });

    const { result } = renderHook(() => useScheduling());
    await waitFor(() => expect(result.current.services.length).toBe(2));
    await act(async () => {
      await result.current.pickService(SERVICES[0]);
    });
    await act(async () => {
      await result.current.pickResource(RESOURCES_TWO[0]);
    });

    expect(result.current.state.status).toBe('resource_selected');
    if (result.current.state.status === 'resource_selected') {
      expect(result.current.state.resource?.name).toBe('Camille');
    }
  });

  it('pickResource(null) is a no-op when allowAnyResource is false (default)', async () => {
    installFetch({
      'GET /_bffless/scheduling/services': { body: { services: SERVICES } },
      'GET /_bffless/scheduling/resources': { body: { resources: RESOURCES_TWO } },
    });

    const { result } = renderHook(() => useScheduling());
    await waitFor(() => expect(result.current.services.length).toBe(2));
    await act(async () => {
      await result.current.pickService(SERVICES[0]);
    });
    await act(async () => {
      await result.current.pickResource(null);
    });

    expect(result.current.state.status).toBe('service_selected');
  });

  it('pickResource(null) advances when allowAnyResource is true (Any mode)', async () => {
    installFetch({
      'GET /_bffless/scheduling/services': { body: { services: SERVICES } },
      'GET /_bffless/scheduling/resources': { body: { resources: RESOURCES_TWO } },
    });

    const { result } = renderHook(() => useScheduling({ allowAnyResource: true }));
    await waitFor(() => expect(result.current.services.length).toBe(2));
    await act(async () => {
      await result.current.pickService(SERVICES[0]);
    });
    await act(async () => {
      await result.current.pickResource(null);
    });

    expect(result.current.state.status).toBe('resource_selected');
    if (result.current.state.status === 'resource_selected') {
      expect(result.current.state.resource).toBeNull();
    }
  });
});

// ─── loadAvailability — the stateRef regression test ─────────────────────────

describe('useScheduling — loadAvailability (stateRef regression)', () => {
  it('reads service + resource from current state and hits /availability — does not "Pick a service" early-return', async () => {
    const { calls } = installFetch({
      'GET /_bffless/scheduling/services': { body: { services: SERVICES } },
      'GET /_bffless/scheduling/resources': { body: { resources: RESOURCES_TWO } },
      'GET /_bffless/scheduling/availability': { body: { slots: SLOTS } },
    });

    const { result } = renderHook(() => useScheduling());
    await waitFor(() => expect(result.current.services.length).toBe(2));
    await act(async () => {
      await result.current.pickService(SERVICES[0]);
    });
    await act(async () => {
      await result.current.pickResource(RESOURCES_TWO[0]);
    });

    await act(async () => {
      await result.current.loadAvailability(
        '2026-05-10T00:00:00.000Z',
        '2026-05-11T00:00:00.000Z',
      );
    });

    // Critical: the availability endpoint was actually called (the bug was
    // that the setState((prev) => ...) capture-into-closure pattern always
    // saw undefined service, hit the "Pick a service before loading
    // availability." early-return, and the GET never fired).
    const availabilityCall = calls.find((c) =>
      c.url.includes('/availability'),
    );
    expect(availabilityCall).toBeDefined();
    expect(availabilityCall?.url).toContain('service_id=svc-cut');
    expect(availabilityCall?.url).toContain('resource_id=res-camille');
    expect(result.current.slots).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('errors with "Pick a service" when called before service is picked', async () => {
    installFetch({
      'GET /_bffless/scheduling/services': { body: { services: SERVICES } },
    });
    const { result } = renderHook(() => useScheduling());
    await waitFor(() => expect(result.current.services.length).toBe(2));

    await act(async () => {
      await result.current.loadAvailability(
        '2026-05-10T00:00:00.000Z',
        '2026-05-11T00:00:00.000Z',
      );
    });

    expect(result.current.error).toMatch(/pick a service/i);
  });
});

// ─── submit — race-safe + state transitions ──────────────────────────────────

describe('useScheduling — submit', () => {
  async function setupReadyToSubmit() {
    installFetch({
      'GET /_bffless/scheduling/services': { body: { services: SERVICES } },
      'GET /_bffless/scheduling/resources': { body: { resources: RESOURCES_TWO } },
      'GET /_bffless/scheduling/availability': { body: { slots: SLOTS } },
      'POST /_bffless/scheduling/bookings': {
        body: { booking_id: 'bk-1', token: 'tok-1' },
      },
    });
    const { result } = renderHook(() => useScheduling());
    await waitFor(() => expect(result.current.services.length).toBe(2));
    await act(async () => {
      await result.current.pickService(SERVICES[0]);
    });
    await act(async () => {
      await result.current.pickResource(RESOURCES_TWO[0]);
    });
    await act(async () => {
      await result.current.loadAvailability(
        '2026-05-10T00:00:00.000Z',
        '2026-05-11T00:00:00.000Z',
      );
    });
    await act(async () => {
      result.current.pickSlot(SLOTS[0]);
    });
    await act(async () => {
      result.current.setDetails({
        customer_name: 'Test',
        customer_email: 'test@example.com',
      });
    });
    return { result };
  }

  it('advances details_filled → submitting → confirmed on success', async () => {
    const { result } = await setupReadyToSubmit();
    expect(result.current.state.status).toBe('details_filled');

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.state.status).toBe('confirmed');
    if (result.current.state.status === 'confirmed') {
      expect(result.current.state.booking.id).toBe('bk-1');
    }
  });

  it('two simultaneous submit() calls only fire one POST', async () => {
    const { result } = await setupReadyToSubmit();

    await act(async () => {
      // Fire both before awaiting. The second should observe submittingRef
      // and short-circuit.
      const a = result.current.submit();
      const b = result.current.submit();
      await Promise.all([a, b]);
    });

    expect(result.current.state.status).toBe('confirmed');
    // Count POSTs to /bookings — should be exactly 1.
    const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>;
    const postCalls = fetchMock.mock.calls.filter((args: any[]) => {
      const url = args[0];
      const init = args[1];
      return (
        typeof url === 'string' &&
        url.includes('/bookings') &&
        (init?.method ?? 'GET') === 'POST'
      );
    });
    expect(postCalls).toHaveLength(1);
  });

  it('returns to details_filled with an error string on POST failure', async () => {
    installFetch({
      'GET /_bffless/scheduling/services': { body: { services: SERVICES } },
      'GET /_bffless/scheduling/resources': { body: { resources: RESOURCES_TWO } },
      'GET /_bffless/scheduling/availability': { body: { slots: SLOTS } },
      'POST /_bffless/scheduling/bookings': {
        status: 409,
        body: { code: 'SLOT_TAKEN', message: 'That slot was just taken — please pick another.' },
      },
    });
    const { result } = renderHook(() => useScheduling());
    await waitFor(() => expect(result.current.services.length).toBe(2));
    await act(async () => {
      await result.current.pickService(SERVICES[0]);
    });
    await act(async () => {
      await result.current.pickResource(RESOURCES_TWO[0]);
    });
    await act(async () => {
      await result.current.loadAvailability(
        '2026-05-10T00:00:00.000Z',
        '2026-05-11T00:00:00.000Z',
      );
    });
    await act(async () => {
      result.current.pickSlot(SLOTS[0]);
    });
    await act(async () => {
      result.current.setDetails({
        customer_name: 'Test',
        customer_email: 'test@example.com',
      });
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.state.status).toBe('details_filled');
    expect(result.current.error).toMatch(/slot was just taken/i);
  });
});
