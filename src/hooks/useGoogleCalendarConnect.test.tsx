import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGoogleCalendarConnect } from './useGoogleCalendarConnect';

function installFetch(handler: (url: string) => { status: number; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const r = handler(url);
      return new Response(JSON.stringify(r.body ?? null), {
        status: r.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useGoogleCalendarConnect', () => {
  it('treats 404 on /admin/google/calendars as disconnected (not an error)', async () => {
    installFetch(() => ({ status: 404, body: { code: 'NOT_FOUND' } }));

    const { result } = renderHook(() => useGoogleCalendarConnect());
    await waitFor(() => expect(result.current.status).toBe('disconnected'));
    expect(result.current.error).toBeNull();
    expect(result.current.availableCalendars).toEqual([]);
  });

  it('treats 401 the same way (not connected, no error)', async () => {
    installFetch(() => ({ status: 401, body: { code: 'UNAUTHORIZED' } }));

    const { result } = renderHook(() => useGoogleCalendarConnect());
    await waitFor(() => expect(result.current.status).toBe('disconnected'));
    expect(result.current.error).toBeNull();
  });

  it('flips to connected and exposes calendars when the endpoint returns them', async () => {
    installFetch(() => ({
      status: 200,
      body: {
        email: 'owner@example.com',
        calendars: [
          { id: 'cal-primary', summary: 'Primary', primary: true },
          { id: 'cal-camille', summary: 'Camille' },
        ],
      },
    }));

    const { result } = renderHook(() => useGoogleCalendarConnect());
    await waitFor(() => expect(result.current.status).toBe('connected'));
    expect(result.current.connectedEmail).toBe('owner@example.com');
    expect(result.current.availableCalendars).toHaveLength(2);
  });

  it('skipInitialLoad suppresses the probe', async () => {
    installFetch(() => {
      throw new Error('should not have been called');
    });
    const { result } = renderHook(() =>
      useGoogleCalendarConnect({ skipInitialLoad: true }),
    );
    // Status starts as 'unknown' and stays there.
    expect(result.current.status).toBe('unknown');
  });
});
