import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMyBookings } from './useMyBookings';
import type { SchedulingMyBookingRow } from '../types/scheduling';

// ─── Test fixtures ────────────────────────────────────────────────────────────
//
// Anchor "now" so upcoming/past partitioning is deterministic. The hook calls
// Date.now() during the useMemo, so we freeze the system clock with vi.setSystemTime
// in each test that cares.

const NOW_MS = Date.parse('2026-05-15T12:00:00.000Z');

function makeRow(over: Partial<SchedulingMyBookingRow>): SchedulingMyBookingRow {
  return {
    id: over.id ?? 'b-1',
    service_id: 'svc-1',
    service_name: 'Cut',
    resource_id: 'res-1',
    resource_name: 'Camille',
    starts_at: over.starts_at ?? '2026-05-20T14:00:00.000Z',
    ends_at: over.ends_at ?? '2026-05-20T14:30:00.000Z',
    status: over.status ?? 'confirmed',
    notes: over.notes ?? null,
    reschedule_token: over.reschedule_token ?? 'tok-' + (over.id ?? 'b-1'),
    manage_url:
      over.manage_url ?? '/manage?token=tok-' + (over.id ?? 'b-1'),
    google_event_id: over.google_event_id ?? null,
    created_at: over.created_at ?? null,
    ...over,
  };
}

const UPCOMING_A = makeRow({
  id: 'b-up-a',
  starts_at: '2026-05-20T14:00:00.000Z',
});
const UPCOMING_B = makeRow({
  id: 'b-up-b',
  starts_at: '2026-05-18T09:00:00.000Z',
});
const PAST_A = makeRow({
  id: 'b-past-a',
  starts_at: '2026-05-10T11:00:00.000Z',
  reschedule_token: null,
});
const PAST_B = makeRow({
  id: 'b-past-b',
  starts_at: '2026-04-01T11:00:00.000Z',
  reschedule_token: null,
});

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
    const path = url.split('?')[0];
    const handler = routes[`${method} ${path}`] ?? routes[path];
    if (!handler) {
      throw new Error(`No fetch mock for ${method} ${path}`);
    }
    const r = typeof handler === 'function' ? handler(new Request(url, init)) : handler;
    return mockResponse(r);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  // Pin Date.now so upcoming/past partitioning is deterministic, but DON'T use
  // vi.useFakeTimers — that pauses the timer queue and makes waitFor() time
  // out instead of polling.
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── Initial load + partitioning ─────────────────────────────────────────────

describe('useMyBookings — initial load', () => {
  it('fetches /my-bookings on mount and partitions into upcoming/past', async () => {
    installFetch({
      'GET /_bffless/scheduling/my-bookings': {
        body: { bookings: [PAST_A, UPCOMING_A, PAST_B, UPCOMING_B], count: 4 },
      },
    });

    const { result } = renderHook(() => useMyBookings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.upcoming.map((b) => b.id)).toEqual(['b-up-b', 'b-up-a']);
    // Past sorted newest-first.
    expect(result.current.past.map((b) => b.id)).toEqual(['b-past-a', 'b-past-b']);
  });

  it('skipInitialLoad suppresses the initial fetch', async () => {
    const { calls } = installFetch({
      'GET /_bffless/scheduling/my-bookings': { body: { bookings: [] } },
    });

    renderHook(() => useMyBookings({ skipInitialLoad: true }));
    await act(async () => {});
    expect(calls.length).toBe(0);
  });

  it('surfaces fetch errors via the error field', async () => {
    installFetch({
      'GET /_bffless/scheduling/my-bookings': {
        status: 500,
        body: { code: 'http_error', message: 'Server boom.' },
      },
    });

    const { result } = renderHook(() => useMyBookings());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe('Server boom.');
  });
});

// ─── Cancel: optimistic + revert ─────────────────────────────────────────────

describe('useMyBookings — cancel', () => {
  it('optimistically removes the row from upcoming and re-fetches on success', async () => {
    // Use a hand-rolled fetch mock for this case so the GET response can vary
    // across calls (initial load: 2 rows; after cancel: 1 row). The shared
    // installFetch helper only supports static responses per route.
    let serverRows: SchedulingMyBookingRow[] = [UPCOMING_A, UPCOMING_B];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET' && url.startsWith('/_bffless/scheduling/my-bookings')) {
        return new Response(
          JSON.stringify({ bookings: serverRows, count: serverRows.length }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (method === 'POST' && url === '/_bffless/scheduling/bookings/manage') {
        serverRows = serverRows.filter((r) => r.id !== 'b-up-b');
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMyBookings());
    await waitFor(() => expect(result.current.upcoming.length).toBe(2));

    await act(async () => {
      await result.current.cancel('b-up-b');
    });

    expect(result.current.upcoming.map((b) => b.id)).toEqual(['b-up-a']);
    expect(result.current.cancelling).toBeNull();
  });

  it('reverts the optimistic update if the cancel call fails', async () => {
    installFetch({
      'GET /_bffless/scheduling/my-bookings': {
        body: { bookings: [UPCOMING_A, UPCOMING_B], count: 2 },
      },
      'POST /_bffless/scheduling/bookings/manage': {
        status: 500,
        body: { code: 'http_error', message: 'Cancel failed.' },
      },
    });

    const { result } = renderHook(() => useMyBookings());
    await waitFor(() => expect(result.current.upcoming.length).toBe(2));

    await act(async () => {
      await result.current.cancel('b-up-a');
    });

    expect(result.current.upcoming.map((b) => b.id)).toEqual(['b-up-b', 'b-up-a']);
    expect(result.current.error).toBe('Cancel failed.');
    expect(result.current.cancelling).toBeNull();
  });

  it('rejects cancellation when the row has no reschedule_token', async () => {
    installFetch({
      'GET /_bffless/scheduling/my-bookings': {
        body: { bookings: [PAST_A], count: 1 },
      },
    });

    const { result } = renderHook(() => useMyBookings());
    await waitFor(() => expect(result.current.past.length).toBe(1));

    await act(async () => {
      await result.current.cancel('b-past-a');
    });

    expect(result.current.error).toBe('This booking can no longer be cancelled.');
    // Row is still in past — nothing changed.
    expect(result.current.past.map((b) => b.id)).toEqual(['b-past-a']);
  });

  it('fires onCancelled callback after a successful cancel', async () => {
    installFetch({
      'GET /_bffless/scheduling/my-bookings': {
        body: { bookings: [UPCOMING_A], count: 1 },
      },
      'POST /_bffless/scheduling/bookings/manage': { body: { ok: true } },
    });

    const onCancelled = vi.fn();
    const { result } = renderHook(() => useMyBookings({ onCancelled }));
    await waitFor(() => expect(result.current.upcoming.length).toBe(1));

    await act(async () => {
      await result.current.cancel('b-up-a');
    });

    expect(onCancelled).toHaveBeenCalledWith('b-up-a');
  });
});
