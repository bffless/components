import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSchedulingAdmin } from './useSchedulingAdmin';

interface CapturedCall {
  url: string;
  method: string;
  body: unknown;
}

function installFetch(handler: (call: CapturedCall) => { status?: number; body: unknown }) {
  const calls: CapturedCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      let body: unknown;
      if (init?.body && typeof init.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      const call: CapturedCall = { url, method, body };
      calls.push(call);
      const r = handler(call);
      return new Response(JSON.stringify(r.body ?? null), {
        status: r.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useSchedulingAdmin — PATCH/DELETE put id in body, not URL', () => {
  it('update(id, patch) PATCHes the bare collection path with { id, ...patch } body', async () => {
    let stage = 'list';
    const calls = installFetch((call) => {
      if (call.url.includes('/admin/services') && call.method === 'GET') {
        return { body: { services: [{ id: 's1', name: 'Cut', active: true }] } };
      }
      if (call.url.includes('/admin/resources') && call.method === 'GET') {
        return { body: { resources: [] } };
      }
      if (call.url.includes('/admin/resource_services')) return { body: { resource_services: [] } };
      if (call.url.includes('/admin/working_hours')) return { body: { working_hours: [] } };
      if (call.url.includes('/admin/time_off')) return { body: { time_off: [] } };
      if (call.url.includes('/admin/settings')) return { body: { settings: {} } };
      if (call.url.includes('/admin/services') && call.method === 'PATCH') {
        return { body: { record: { id: 's1', name: 'Color', active: true } } };
      }
      return { body: null };
    });

    const { result } = renderHook(() => useSchedulingAdmin());
    await waitFor(() => expect(result.current.services.list.length).toBe(1));

    await act(async () => {
      await result.current.services.update('s1', { name: 'Color' });
    });

    const patchCall = calls.find((c) => c.method === 'PATCH');
    expect(patchCall).toBeDefined();
    // URL ends with the bare collection path (no /:id segment).
    expect(patchCall?.url).toMatch(/\/admin\/services$/);
    expect(patchCall?.body).toEqual({ id: 's1', name: 'Color' });
  });

  it('remove(id) DELETEs the bare collection path with { id } body', async () => {
    const calls = installFetch((call) => {
      if (call.url.includes('/admin/services') && call.method === 'GET') {
        return { body: { services: [{ id: 's1', name: 'Cut', active: true }] } };
      }
      if (call.url.includes('/admin/resources') && call.method === 'GET') return { body: { resources: [] } };
      if (call.url.includes('/admin/resource_services')) return { body: { resource_services: [] } };
      if (call.url.includes('/admin/working_hours')) return { body: { working_hours: [] } };
      if (call.url.includes('/admin/time_off')) return { body: { time_off: [] } };
      if (call.url.includes('/admin/settings')) return { body: { settings: {} } };
      if (call.method === 'DELETE') return { body: null };
      return { body: null };
    });

    const { result } = renderHook(() => useSchedulingAdmin());
    await waitFor(() => expect(result.current.services.list.length).toBe(1));

    await act(async () => {
      await result.current.services.remove('s1');
    });

    const deleteCall = calls.find((c) => c.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(deleteCall?.url).toMatch(/\/admin\/services$/);
    expect(deleteCall?.body).toEqual({ id: 's1' });
  });
});

describe('useSchedulingAdmin — admin paths use underscores', () => {
  it('queries /admin/working_hours and /admin/time_off (underscores, not hyphens)', async () => {
    const calls = installFetch((call) => {
      if (call.url.includes('/admin/services') && call.method === 'GET') return { body: { services: [] } };
      if (call.url.includes('/admin/resources') && call.method === 'GET') return { body: { resources: [] } };
      if (call.url.includes('/admin/resource_services')) return { body: { resource_services: [] } };
      if (call.url.includes('/admin/working_hours')) return { body: { working_hours: [] } };
      if (call.url.includes('/admin/time_off')) return { body: { time_off: [] } };
      if (call.url.includes('/admin/settings')) return { body: { settings: {} } };
      return { body: null };
    });

    renderHook(() => useSchedulingAdmin());
    await waitFor(() => {
      expect(calls.some((c) => c.url.includes('/admin/working_hours'))).toBe(true);
      expect(calls.some((c) => c.url.includes('/admin/time_off'))).toBe(true);
      expect(calls.some((c) => c.url.includes('/admin/resource_services'))).toBe(true);
    });
    expect(calls.some((c) => c.url.includes('/admin/working-hours'))).toBe(false);
    expect(calls.some((c) => c.url.includes('/admin/time-off'))).toBe(false);
    expect(calls.some((c) => c.url.includes('/admin/resource-services'))).toBe(false);
  });
});

describe('useSchedulingAdmin — optimistic update reverts on error', () => {
  it('applies the patch locally, reverts list on PATCH failure', async () => {
    installFetch((call) => {
      if (call.url.includes('/admin/services') && call.method === 'GET') {
        return { body: { services: [{ id: 's1', name: 'Cut', active: true }] } };
      }
      if (call.url.includes('/admin/resources') && call.method === 'GET') return { body: { resources: [] } };
      if (call.url.includes('/admin/resource_services')) return { body: { resource_services: [] } };
      if (call.url.includes('/admin/working_hours')) return { body: { working_hours: [] } };
      if (call.url.includes('/admin/time_off')) return { body: { time_off: [] } };
      if (call.url.includes('/admin/settings')) return { body: { settings: {} } };
      if (call.method === 'PATCH') {
        return { status: 500, body: { code: 'BOOM', message: 'kaboom' } };
      }
      return { body: null };
    });

    const { result } = renderHook(() => useSchedulingAdmin());
    await waitFor(() => expect(result.current.services.list.length).toBe(1));

    await act(async () => {
      await result.current.services.update('s1', { name: 'Color' });
    });

    // After failed PATCH, list reverted to the original snapshot.
    expect(result.current.services.list[0].name).toBe('Cut');
    expect(result.current.services.error).toMatch(/kaboom|update/i);
  });
});
