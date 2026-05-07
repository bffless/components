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

describe('useSchedulingAdmin — autoLinkResourceServices', () => {
  it('creating a service with autoLink default-on fans out resource_service rows for every active resource', async () => {
    const links: Array<{ resource_id: string; service_id: string }> = [];
    const calls = installFetch((call) => {
      if (call.url.includes('/admin/services') && call.method === 'GET') {
        return { body: { services: [] } };
      }
      if (call.url.includes('/admin/resources') && call.method === 'GET') {
        return {
          body: {
            resources: [
              { id: 'r-rico', name: 'rico', active: true },
              { id: 'r-alex', name: 'alex', active: true },
              { id: 'r-old', name: 'old', active: false }, // hidden — should be skipped
            ],
          },
        };
      }
      if (call.url.includes('/admin/resource_services') && call.method === 'GET') {
        return { body: { resource_services: [] } };
      }
      if (call.url.includes('/admin/working_hours')) return { body: { working_hours: [] } };
      if (call.url.includes('/admin/time_off')) return { body: { time_off: [] } };
      if (call.url.includes('/admin/settings')) return { body: { settings: {} } };
      if (call.url.includes('/admin/services') && call.method === 'POST') {
        return {
          body: {
            record: {
              id: 's-haircut',
              name: (call.body as any)?.name ?? 'Haircut',
              active: true,
              duration_minutes: 30,
            },
          },
        };
      }
      if (call.url.includes('/admin/resource_services') && call.method === 'POST') {
        const b = call.body as { resource_id: string; service_id: string };
        links.push({ resource_id: b.resource_id, service_id: b.service_id });
        return { body: { record: { id: `link-${links.length}`, ...b } } };
      }
      return { body: null };
    });

    const { result } = renderHook(() => useSchedulingAdmin());
    await waitFor(() => expect(result.current.resources.list.length).toBe(3));

    await act(async () => {
      await result.current.services.create({
        name: 'Haircut',
        duration_minutes: 30,
        active: true,
      });
    });

    // Two link rows POSTed — one per active resource. Hidden resource skipped.
    const linkPosts = calls.filter(
      (c) => c.url.includes('/admin/resource_services') && c.method === 'POST',
    );
    expect(linkPosts).toHaveLength(2);
    expect(links).toEqual(
      expect.arrayContaining([
        { resource_id: 'r-rico', service_id: 's-haircut' },
        { resource_id: 'r-alex', service_id: 's-haircut' },
      ]),
    );
    expect(links.find((l) => l.resource_id === 'r-old')).toBeUndefined();
  });

  it('creating a resource with autoLink default-on fans out resource_service rows for every active service', async () => {
    const links: Array<{ resource_id: string; service_id: string }> = [];
    const calls = installFetch((call) => {
      if (call.url.includes('/admin/services') && call.method === 'GET') {
        return {
          body: {
            services: [
              { id: 's-haircut', name: 'Haircut', active: true, duration_minutes: 30 },
              { id: 's-color', name: 'Color', active: true, duration_minutes: 90 },
            ],
          },
        };
      }
      if (call.url.includes('/admin/resources') && call.method === 'GET') return { body: { resources: [] } };
      if (call.url.includes('/admin/resource_services') && call.method === 'GET') return { body: { resource_services: [] } };
      if (call.url.includes('/admin/working_hours')) return { body: { working_hours: [] } };
      if (call.url.includes('/admin/time_off')) return { body: { time_off: [] } };
      if (call.url.includes('/admin/settings')) return { body: { settings: {} } };
      if (call.url.includes('/admin/resources') && call.method === 'POST') {
        return {
          body: { record: { id: 'r-new', name: (call.body as any)?.name ?? 'rico', active: true } },
        };
      }
      if (call.url.includes('/admin/resource_services') && call.method === 'POST') {
        const b = call.body as { resource_id: string; service_id: string };
        links.push({ resource_id: b.resource_id, service_id: b.service_id });
        return { body: { record: { id: `link-${links.length}`, ...b } } };
      }
      return { body: null };
    });

    const { result } = renderHook(() => useSchedulingAdmin());
    await waitFor(() => expect(result.current.services.list.length).toBe(2));

    await act(async () => {
      await result.current.resources.create({ name: 'rico', active: true });
    });

    const linkPosts = calls.filter(
      (c) => c.url.includes('/admin/resource_services') && c.method === 'POST',
    );
    expect(linkPosts).toHaveLength(2);
    expect(links).toEqual(
      expect.arrayContaining([
        { resource_id: 'r-new', service_id: 's-haircut' },
        { resource_id: 'r-new', service_id: 's-color' },
      ]),
    );
  });

  it('autoLinkResourceServices: false suppresses the fan-out', async () => {
    const calls = installFetch((call) => {
      if (call.url.includes('/admin/services') && call.method === 'GET') return { body: { services: [] } };
      if (call.url.includes('/admin/resources') && call.method === 'GET') {
        return { body: { resources: [{ id: 'r-rico', name: 'rico', active: true }] } };
      }
      if (call.url.includes('/admin/resource_services') && call.method === 'GET') return { body: { resource_services: [] } };
      if (call.url.includes('/admin/working_hours')) return { body: { working_hours: [] } };
      if (call.url.includes('/admin/time_off')) return { body: { time_off: [] } };
      if (call.url.includes('/admin/settings')) return { body: { settings: {} } };
      if (call.url.includes('/admin/services') && call.method === 'POST') {
        return { body: { record: { id: 's-haircut', name: 'Haircut', active: true } } };
      }
      return { body: null };
    });

    const { result } = renderHook(() =>
      useSchedulingAdmin({ autoLinkResourceServices: false }),
    );
    await waitFor(() => expect(result.current.resources.list.length).toBe(1));

    await act(async () => {
      await result.current.services.create({ name: 'Haircut', active: true });
    });

    const linkPosts = calls.filter(
      (c) => c.url.includes('/admin/resource_services') && c.method === 'POST',
    );
    expect(linkPosts).toHaveLength(0);
  });

  it('first service created when there are zero resources still resolves cleanly (no fan-out target)', async () => {
    const calls = installFetch((call) => {
      if (call.url.includes('/admin/services') && call.method === 'GET') return { body: { services: [] } };
      if (call.url.includes('/admin/resources') && call.method === 'GET') return { body: { resources: [] } };
      if (call.url.includes('/admin/resource_services') && call.method === 'GET') return { body: { resource_services: [] } };
      if (call.url.includes('/admin/working_hours')) return { body: { working_hours: [] } };
      if (call.url.includes('/admin/time_off')) return { body: { time_off: [] } };
      if (call.url.includes('/admin/settings')) return { body: { settings: {} } };
      if (call.url.includes('/admin/services') && call.method === 'POST') {
        return { body: { record: { id: 's-haircut', name: 'Haircut', active: true } } };
      }
      return { body: null };
    });

    const { result } = renderHook(() => useSchedulingAdmin());
    await act(async () => {
      await result.current.services.create({ name: 'Haircut', active: true });
    });

    const linkPosts = calls.filter(
      (c) => c.url.includes('/admin/resource_services') && c.method === 'POST',
    );
    expect(linkPosts).toHaveLength(0);
    expect(result.current.services.error).toBeNull();
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
