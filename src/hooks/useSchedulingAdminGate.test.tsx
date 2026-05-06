import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSchedulingAdminGate } from './useSchedulingAdminGate';
import type { UseAuthResult } from './useAuth';
import type { AuthUser } from '../types/auth';

// ─── Auth stub ───────────────────────────────────────────────────────────────

function authStub(over: Partial<UseAuthResult>): UseAuthResult {
  return {
    basePath: '/api/auth',
    user: null,
    ready: true,
    loading: false,
    error: null,
    mode: 'signin',
    setMode: vi.fn(),
    loginMethods: null,
    resetToken: null,
    verifyToken: null,
    pendingVerifyEmail: null,
    signIn: vi.fn(async () => {}),
    signUp: vi.fn(async () => {}),
    forgotPassword: vi.fn(async () => {}),
    resetPassword: vi.fn(async () => {}),
    verifyEmail: vi.fn(async () => {}),
    resendVerification: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    clearError: vi.fn(),
    ...over,
  };
}

const ALICE: AuthUser = {
  id: 'user-alice',
  email: 'alice@example.com',
} as AuthUser;

// ─── Fetch mock helper ───────────────────────────────────────────────────────

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
  routes: Record<string, MockResponse | (() => MockResponse)>,
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
    const r = typeof handler === 'function' ? handler() : handler;
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

// ─── Status derivation ───────────────────────────────────────────────────────

describe('useSchedulingAdminGate — status derivation', () => {
  it("status === 'loading' while auth.ready is false", () => {
    const { result } = renderHook(() =>
      useSchedulingAdminGate({ auth: authStub({ ready: false }) }),
    );
    expect(result.current.status).toBe('loading');
  });

  it("status === 'signed_out' when auth.user is null", async () => {
    const { result } = renderHook(() =>
      useSchedulingAdminGate({ auth: authStub({ user: null, ready: true }) }),
    );
    // No fetch fires — anonymous short-circuits inside refresh().
    expect(result.current.status).toBe('signed_out');
    expect(result.current.isAdmin).toBe(false);
  });

  it("status === 'admin' when /admin/me reports isAdmin: true", async () => {
    installFetch({
      'GET /_bffless/scheduling/admin/me': {
        body: { isAdmin: true, totalAdmins: 1, email: ALICE.email },
      },
    });
    const { result } = renderHook(() =>
      useSchedulingAdminGate({ auth: authStub({ user: ALICE }) }),
    );
    await waitFor(() => expect(result.current.status).toBe('admin'));
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.totalAdmins).toBe(1);
  });

  it("status === 'not_admin_no_one_claimed' when isAdmin: false AND totalAdmins: 0", async () => {
    installFetch({
      'GET /_bffless/scheduling/admin/me': {
        body: { isAdmin: false, totalAdmins: 0, email: ALICE.email },
      },
    });
    const { result } = renderHook(() =>
      useSchedulingAdminGate({ auth: authStub({ user: ALICE }) }),
    );
    await waitFor(() =>
      expect(result.current.status).toBe('not_admin_no_one_claimed'),
    );
    expect(result.current.isAdmin).toBe(false);
  });

  it("status === 'not_admin' when isAdmin: false AND totalAdmins > 0", async () => {
    installFetch({
      'GET /_bffless/scheduling/admin/me': {
        body: { isAdmin: false, totalAdmins: 2, email: ALICE.email },
      },
    });
    const { result } = renderHook(() =>
      useSchedulingAdminGate({ auth: authStub({ user: ALICE }) }),
    );
    await waitFor(() => expect(result.current.status).toBe('not_admin'));
  });
});

// ─── Errors ──────────────────────────────────────────────────────────────────

describe('useSchedulingAdminGate — errors', () => {
  it('surfaces a 500 on /admin/me via the error field', async () => {
    installFetch({
      'GET /_bffless/scheduling/admin/me': {
        status: 500,
        body: { code: 'http_error', message: 'Boom.' },
      },
    });
    const { result } = renderHook(() =>
      useSchedulingAdminGate({ auth: authStub({ user: ALICE }) }),
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe('Boom.');
    // Without resolved admin status we treat the user as not-admin / locked.
    expect(result.current.status).toBe('not_admin');
  });
});

// ─── claim() ─────────────────────────────────────────────────────────────────

describe('useSchedulingAdminGate — claim', () => {
  it('promotes the signed-in user to admin on a successful claim', async () => {
    let role: 'none' | 'admin' = 'none';
    let totalAdmins = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET' && url.startsWith('/_bffless/scheduling/admin/me')) {
        return new Response(
          JSON.stringify({
            isAdmin: role === 'admin',
            totalAdmins,
            email: ALICE.email,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (method === 'POST' && url === '/_bffless/scheduling/admin/claim') {
        role = 'admin';
        totalAdmins = 1;
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useSchedulingAdminGate({ auth: authStub({ user: ALICE }) }),
    );
    await waitFor(() =>
      expect(result.current.status).toBe('not_admin_no_one_claimed'),
    );

    await act(async () => {
      await result.current.claim();
    });

    expect(result.current.status).toBe('admin');
    expect(result.current.error).toBeNull();
    expect(result.current.claiming).toBe(false);
  });

  it('surfaces a server-side claim failure via error and refreshes the gate', async () => {
    installFetch({
      'GET /_bffless/scheduling/admin/me': {
        body: { isAdmin: false, totalAdmins: 1, email: ALICE.email },
      },
      'POST /_bffless/scheduling/admin/claim': {
        status: 403,
        body: { code: 'forbidden', message: 'Already claimed.' },
      },
    });

    const { result } = renderHook(() =>
      useSchedulingAdminGate({ auth: authStub({ user: ALICE }) }),
    );
    await waitFor(() => expect(result.current.status).toBe('not_admin'));

    await act(async () => {
      await result.current.claim();
    });

    // Claim failed — error captured, refresh ran (still not_admin since
    // the upstream state didn't change), claiming flag cleared.
    expect(result.current.error).toBe('Already claimed.');
    expect(result.current.status).toBe('not_admin');
    expect(result.current.claiming).toBe(false);
  });

  it('rejects claim when no user is signed in', async () => {
    const { result } = renderHook(() =>
      useSchedulingAdminGate({ auth: authStub({ user: null }) }),
    );
    await act(async () => {
      await result.current.claim();
    });
    expect(result.current.error).toBe('Sign in before claiming admin.');
  });
});

// ─── skipInitialLoad ─────────────────────────────────────────────────────────

describe('useSchedulingAdminGate — skipInitialLoad', () => {
  it('does not fire /admin/me on mount when skipInitialLoad is set', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      // Tolerate any unrelated useAuth probes (login-methods/session); only
      // assert that /admin/me was NOT called.
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() =>
      useSchedulingAdminGate({
        auth: authStub({ user: ALICE }),
        skipInitialLoad: true,
      }),
    );
    await act(async () => {});

    const adminMeCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/scheduling/admin/me'),
    );
    expect(adminMeCalls.length).toBe(0);
  });
});
