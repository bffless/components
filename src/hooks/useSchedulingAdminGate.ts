import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveSchedulingBasePath,
  schedulingGet,
  schedulingPost,
  SchedulingClientError,
} from '../lib/schedulingClient';
import { useAuth, type UseAuthResult } from './useAuth';
import type { AuthUser } from '../types/auth';

/**
 * Discriminated status for a scheduling-admin gate.
 *
 * - `loading`: auth probe in flight, or /admin/me has not yet resolved.
 * - `signed_out`: visitor is unauthenticated.
 * - `not_admin_no_one_claimed`: signed in, but `scheduling_admin_user` is
 *   empty — the consumer should offer a "Claim ownership" CTA.
 * - `not_admin`: signed in, an admin already exists. Consumer should show
 *   "ask the owner" copy.
 * - `admin`: signed-in user IS in `scheduling_admin_user` — consumer mounts
 *   the full admin UI.
 */
export type SchedulingAdminGateStatus =
  | 'loading'
  | 'signed_out'
  | 'not_admin_no_one_claimed'
  | 'not_admin'
  | 'admin';

export interface UseSchedulingAdminGateOptions {
  /** Override the API base path. Default: auto-detect via resolveSchedulingBasePath(). */
  apiBase?: string;
  /**
   * Reuse an externally-mounted useAuth result. When omitted, the gate calls
   * useAuth() internally. Pass an explicit value when the consumer's parent
   * island already mounts useAuth and wants to share state (avoids a second
   * /session probe + the two hooks getting out of sync).
   */
  auth?: UseAuthResult;
  /**
   * If true, skip the initial /admin/me fetch on mount. The consumer drives
   * via .refresh().
   */
  skipInitialLoad?: boolean;
}

export interface UseSchedulingAdminGateResult {
  basePath: string;
  status: SchedulingAdminGateStatus;
  /** Convenience: true when status === 'admin'. */
  isAdmin: boolean;
  /** Signed-in user when known. Null otherwise. */
  user: AuthUser | null;
  /**
   * Total rows in `scheduling_admin_user`. Null until /admin/me has resolved.
   * Useful when the consumer wants to differentiate "first-run claim" from
   * "claim a second seat" — the latter doesn't exist in MVP, but the field
   * is exposed for future-compat.
   */
  totalAdmins: number | null;
  /** Last /admin/me or /admin/claim error. Cleared on the next successful op. */
  error: string | null;
  /** True while a claim() call is in flight. */
  claiming: boolean;
  /** Re-fetch /admin/me. Useful after a fresh sign-in. */
  refresh: () => Promise<void>;
  /**
   * POST /admin/claim — server promotes the signed-in user to scheduling
   * admin when no row exists yet. Refreshes status on success. On failure,
   * the error is surfaced via `error` and `status` remains the same.
   */
  claim: () => Promise<void>;
}

interface AdminMeResponse {
  isAdmin?: boolean;
  totalAdmins?: number;
  email?: string | null;
}

interface ClaimResponse {
  success?: boolean;
  message?: string;
}

export function useSchedulingAdminGate(
  opts: UseSchedulingAdminGateOptions = {},
): UseSchedulingAdminGateResult {
  const basePath = useMemo(
    () => opts.apiBase ?? resolveSchedulingBasePath(),
    [opts.apiBase],
  );

  // Hooks can't be called conditionally, so the internal hook always runs.
  // Suppress its initial probe when an external auth is supplied so the
  // /session call doesn't fire twice.
  const internalAuth = useAuth(opts.auth ? { skipInitialSession: true } : undefined);
  const auth = opts.auth ?? internalAuth;

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [totalAdmins, setTotalAdmins] = useState<number | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  // Drop probes that resolve after auth.user changed underneath us so a
  // fast sign-in/sign-out doesn't write stale data over the new state.
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!auth.user) {
      // Anonymous — clear any prior admin state. No fetch.
      setIsAdmin(null);
      setTotalAdmins(null);
      setError(null);
      setMeLoading(false);
      return;
    }
    const mySeq = ++requestSeq.current;
    setMeLoading(true);
    setError(null);
    try {
      const data = await schedulingGet<AdminMeResponse>(basePath, '/admin/me');
      if (mySeq !== requestSeq.current) return;
      setIsAdmin(!!data?.isAdmin);
      setTotalAdmins(typeof data?.totalAdmins === 'number' ? data.totalAdmins : 0);
    } catch (err) {
      if (mySeq !== requestSeq.current) return;
      const message =
        err instanceof SchedulingClientError ? err.message
        : err instanceof Error ? err.message
        : 'Failed to load admin status.';
      setError(message);
      setIsAdmin(false);
      setTotalAdmins(null);
    } finally {
      if (mySeq === requestSeq.current) setMeLoading(false);
    }
  }, [auth.user, basePath]);

  // Re-probe whenever the signed-in user identity changes (sign-in, sign-out,
  // account switch). The auth.user reference is what useAuth returns; depend
  // on its id when present so a new user with the same ref doesn't spuriously
  // skip a refresh.
  const userId = auth.user?.id ?? null;
  useEffect(() => {
    if (opts.skipInitialLoad) return;
    if (!auth.ready) return;
    void refresh();
  }, [auth.ready, userId, opts.skipInitialLoad, refresh]);

  const claim = useCallback(async () => {
    if (!auth.user) {
      setError('Sign in before claiming admin.');
      return;
    }
    setClaiming(true);
    setError(null);

    // Capture any claim-side error message so we can re-apply it AFTER the
    // post-claim refresh — refresh() clears `error` as a normal probe, which
    // would otherwise wipe a still-relevant claim failure.
    let claimError: string | null = null;
    try {
      const data = await schedulingPost<ClaimResponse>(
        basePath,
        '/admin/claim',
        {},
      );
      if (!data?.success) {
        claimError = data?.message ?? 'Claim failed.';
      }
    } catch (err) {
      claimError =
        err instanceof SchedulingClientError ? err.message
        : err instanceof Error ? err.message
        : 'Claim failed.';
    }

    // Refresh either way — a concurrent claim by someone else may have
    // succeeded, in which case our claim 403'd but the gate still updates.
    await refresh();
    if (claimError) setError(claimError);
    setClaiming(false);
  }, [auth.user, basePath, refresh]);

  // Derived status. Order matters: handle the loading / signed-out cases
  // before deriving admin/no-claim branches.
  let status: SchedulingAdminGateStatus;
  if (!auth.ready) {
    status = 'loading';
  } else if (!auth.user) {
    status = 'signed_out';
  } else if (meLoading || isAdmin === null) {
    status = 'loading';
  } else if (isAdmin) {
    status = 'admin';
  } else if (totalAdmins === 0) {
    status = 'not_admin_no_one_claimed';
  } else {
    status = 'not_admin';
  }

  return {
    basePath,
    status,
    isAdmin: status === 'admin',
    user: auth.user,
    totalAdmins,
    error,
    claiming,
    refresh,
    claim,
  };
}
