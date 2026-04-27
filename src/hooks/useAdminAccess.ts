import { useEffect, useState } from 'react';

export type AdminAccessMethod = 'session' | 'toolbar';

export interface SessionUser {
  id: string;
  email: string;
  role?: string;
}

export interface SessionData {
  authenticated?: boolean;
  user: SessionUser;
}

export interface UseAdminAccessOptions {
  /**
   * 'session' — uses the consumer-supplied `checkSession` function and treats
   * `role === 'admin' | 'owner'` as admin. Mirrors the laureate-laureate demo.
   *
   * 'toolbar' — uses the consumer-supplied `checkToolbarAccess` function which
   * returns a boolean. Mirrors all the other demos and templates.
   */
  method?: AdminAccessMethod;
  /** Required when method === 'session' */
  checkSession?: () => Promise<SessionData | null>;
  /** Required when method === 'toolbar' */
  checkToolbarAccess?: () => Promise<boolean>;
}

export interface UseAdminAccessResult {
  isAdmin: boolean;
  ready: boolean;
}

/**
 * Centralizes the two existing admin-detection patterns used across the demos
 * and templates. Returns `isAdmin: false` until the underlying check resolves;
 * `ready: true` once the resolution completes (whether admin or not).
 */
export function useAdminAccess(opts: UseAdminAccessOptions): UseAdminAccessResult {
  const method: AdminAccessMethod = opts.method ?? 'toolbar';
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const finish = (admin: boolean) => {
      if (cancelled) return;
      setIsAdmin(admin);
      setReady(true);
    };

    if (method === 'session') {
      if (!opts.checkSession) {
        finish(false);
        return;
      }
      opts.checkSession()
        .then(session => {
          const role = session?.user?.role;
          finish(!!session?.user && (role === 'admin' || role === 'owner'));
        })
        .catch(() => finish(false));
    } else {
      if (!opts.checkToolbarAccess) {
        finish(false);
        return;
      }
      opts.checkToolbarAccess()
        .then(authorized => finish(!!authorized))
        .catch(() => finish(false));
    }

    return () => {
      cancelled = true;
    };
  }, [method, opts.checkSession, opts.checkToolbarAccess]);

  return { isAdmin, ready };
}
