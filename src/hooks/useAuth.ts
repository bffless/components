import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AuthClientError,
  fetchLoginMethods,
  fetchSession,
  forgotPassword as forgotPasswordCall,
  resendVerification as resendVerificationCall,
  resetPassword as resetPasswordCall,
  resolveAuthBasePath,
  signIn as signInCall,
  signOut as signOutCall,
  signUp as signUpCall,
  verifyEmail as verifyEmailCall,
} from '../lib/authClient';
import type {
  AuthError,
  AuthMode,
  AuthUser,
  LoginMethods,
} from '../types/auth';

const RESET_QUERY_KEY = 'bffless_reset';
const VERIFY_QUERY_KEY = 'bffless_verify';

export interface UseAuthOptions {
  /**
   * Override the auth base path. Default: auto-detect from `window.location.hostname`
   * via `resolveAuthBasePath()`.
   */
  basePath?: string;
  /**
   * Called once a sign-in/sign-up/reset/verify completes successfully.
   * Use this to revalidate data, navigate, etc. The dialog auto-closes
   * separately via its own `onAuthenticated` prop.
   */
  onAuthenticated?: (user: AuthUser) => void;
  /** Disable the initial GET /session probe (e.g. in SSR or tests). */
  skipInitialSession?: boolean;
  /** Disable URL token detection (e.g. if the host page handles its own routing). */
  skipUrlTokenDetection?: boolean;
}

export interface UseAuthResult {
  /** Resolved auth base path (`/api/auth` or `/_bffless/auth`). */
  basePath: string;
  /** Current signed-in user, or null. */
  user: AuthUser | null;
  /** True until the initial session probe + URL detection finish. */
  ready: boolean;
  /** True while any auth operation is in flight. */
  loading: boolean;
  /** Last error from a failed operation. Cleared on next successful op. */
  error: AuthError | null;
  /** Active mode — drives which form the dialog renders. */
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  /** Optional discovered login methods (e.g. for showing a Google button). */
  loginMethods: LoginMethods | null;
  /** Token stashed from `?bffless_reset=` (only present when mode='reset'). */
  resetToken: string | null;
  /** Token stashed from `?bffless_verify=` (only present when mode='verify'). */
  verifyToken: string | null;
  /** Email captured from sign-up flow (used by verify-sent screen). */
  pendingVerifyEmail: string | null;

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (password: string, token?: string) => Promise<void>;
  verifyEmail: (token?: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Clear the current error without changing other state. */
  clearError: () => void;
}

function stripTokenParam(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(key)) return;
    url.searchParams.delete(key);
    const search = url.searchParams.toString();
    const next = `${url.pathname}${search ? '?' + search : ''}${url.hash}`;
    window.history.replaceState({}, '', next);
  } catch {
    // ignore
  }
}

function readUrlToken(key: string): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  } catch {
    return null;
  }
}

function toError(err: unknown): AuthError {
  if (err instanceof AuthClientError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof Error) {
    return { code: 'unknown', message: err.message };
  }
  return { code: 'unknown', message: 'Something went wrong.' };
}

export function useAuth(opts: UseAuthOptions = {}): UseAuthResult {
  const basePath = useMemo(
    () => opts.basePath ?? resolveAuthBasePath(),
    [opts.basePath],
  );

  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [loginMethods, setLoginMethods] = useState<LoginMethods | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState<string | null>(null);

  const onAuthenticatedRef = useRef(opts.onAuthenticated);
  onAuthenticatedRef.current = opts.onAuthenticated;

  const fireAuthenticated = useCallback((next: AuthUser) => {
    setUser(next);
    setError(null);
    onAuthenticatedRef.current?.(next);
  }, []);

  // Initial session probe + URL-token capture.
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    const init = async () => {
      // 1) Capture URL tokens first so the dialog opens to the right mode.
      if (!opts.skipUrlTokenDetection) {
        const reset = readUrlToken(RESET_QUERY_KEY);
        const verify = readUrlToken(VERIFY_QUERY_KEY);
        if (reset) {
          setResetToken(reset);
          setMode('reset');
          stripTokenParam(RESET_QUERY_KEY);
        } else if (verify) {
          setVerifyToken(verify);
          setMode('verify');
          stripTokenParam(VERIFY_QUERY_KEY);
        }
      }

      // 2) Probe session in the background.
      if (!opts.skipInitialSession) {
        try {
          const result = await fetchSession({ basePath, signal: ac.signal });
          if (!cancelled) setUser(result.user);
        } catch {
          // ignore
        }
      }

      // 3) Best-effort login-methods probe (non-blocking on errors).
      try {
        const methods = await fetchLoginMethods({ basePath, signal: ac.signal });
        if (!cancelled) setLoginMethods(methods);
      } catch {
        // ignore
      }

      if (!cancelled) setReady(true);
    };

    init();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [basePath, opts.skipInitialSession, opts.skipUrlTokenDetection]);

  // Auto-verify if we landed with a verify token (and aren't already signed in).
  useEffect(() => {
    if (mode !== 'verify' || !verifyToken || loading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await verifyEmailCall({ basePath }, { token: verifyToken });
        if (cancelled) return;
        setVerifyToken(null);
        if (result.user) {
          fireAuthenticated(result.user);
          setMode('signin');
        } else {
          // Verified but no session minted (e.g. user disabled). Send to signin.
          setMode('signin');
        }
      } catch (err) {
        if (cancelled) return;
        setError(toError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyToken]);

  const wrapOp = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        setError(toError(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await wrapOp(() => signInCall({ basePath }, { email, password }));
      fireAuthenticated(result.user);
    },
    [basePath, wrapOp, fireAuthenticated],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const result = await wrapOp(() => signUpCall({ basePath }, { email, password }));
      if (result.emailVerificationRequired) {
        setPendingVerifyEmail(result.user.email);
        setMode('verify-sent');
      } else {
        fireAuthenticated(result.user);
      }
    },
    [basePath, wrapOp, fireAuthenticated],
  );

  const forgotPassword = useCallback(
    async (email: string) => {
      await wrapOp(() => forgotPasswordCall({ basePath }, { email }));
    },
    [basePath, wrapOp],
  );

  const resetPassword = useCallback(
    async (password: string, tokenOverride?: string) => {
      const token = tokenOverride ?? resetToken;
      if (!token) {
        const e: AuthError = { code: 'invalid_token', message: 'No reset token available.' };
        setError(e);
        throw new AuthClientError(e.code, e.message);
      }
      const result = await wrapOp(() =>
        resetPasswordCall({ basePath }, { token, password }),
      );
      setResetToken(null);
      if (result.user) {
        fireAuthenticated(result.user);
        setMode('signin');
      } else {
        setMode('signin');
      }
    },
    [basePath, resetToken, wrapOp, fireAuthenticated],
  );

  const verifyEmail = useCallback(
    async (tokenOverride?: string) => {
      const token = tokenOverride ?? verifyToken;
      if (!token) {
        const e: AuthError = { code: 'invalid_token', message: 'No verification token available.' };
        setError(e);
        throw new AuthClientError(e.code, e.message);
      }
      const result = await wrapOp(() => verifyEmailCall({ basePath }, { token }));
      setVerifyToken(null);
      if (result.user) {
        fireAuthenticated(result.user);
        setMode('signin');
      } else {
        setMode('signin');
      }
    },
    [basePath, verifyToken, wrapOp, fireAuthenticated],
  );

  const resendVerification = useCallback(async () => {
    await wrapOp(() => resendVerificationCall({ basePath }));
  }, [basePath, wrapOp]);

  const signOut = useCallback(async () => {
    await wrapOp(() => signOutCall({ basePath }));
    setUser(null);
  }, [basePath, wrapOp]);

  const refresh = useCallback(async () => {
    const result = await fetchSession({ basePath });
    setUser(result.user);
  }, [basePath]);

  const clearError = useCallback(() => setError(null), []);

  return {
    basePath,
    user,
    ready,
    loading,
    error,
    mode,
    setMode,
    loginMethods,
    resetToken,
    verifyToken,
    pendingVerifyEmail,
    signIn,
    signUp,
    forgotPassword,
    resetPassword,
    verifyEmail,
    resendVerification,
    signOut,
    refresh,
    clearError,
  };
}
