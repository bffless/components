import type {
  AuthError,
  AuthErrorCode,
  AuthUser,
  LoginMethods,
  ResetPasswordResult,
  SessionResult,
  SignInResult,
  SignUpResult,
  VerifyEmailResult,
} from '../types/auth';

/**
 * Resolve the auth API base path from the current hostname.
 *
 * - `*.bffless.app` (or `bffless.app`) → `/api/auth` (SuperTokens flow,
 *   parent-domain cookies, SSO with admin).
 * - Anything else (custom domains) → `/_bffless/auth` (domain-scoped JWT
 *   flow that wraps SuperTokens recipes server-side).
 */
export function resolveAuthBasePath(hostnameOverride?: string): string {
  let hostname = hostnameOverride;
  if (hostname == null) {
    if (typeof window === 'undefined' || !window.location) {
      return '/api/auth';
    }
    hostname = window.location.hostname;
  }
  const lower = hostname.toLowerCase();
  if (lower === 'bffless.app' || lower.endsWith('.bffless.app')) {
    return '/api/auth';
  }
  return '/_bffless/auth';
}

const HEADERS_JSON = { 'Content-Type': 'application/json' } as const;

export class AuthClientError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'AuthClientError';
  }
}

function makeError(code: AuthErrorCode, message: string): AuthError {
  return { code, message };
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeUser(raw: any): AuthUser | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || typeof raw.email !== 'string') return null;
  return {
    id: raw.id,
    email: raw.email,
    role: raw.role ?? null,
  };
}

export interface AuthFetchOptions {
  basePath: string;
  signal?: AbortSignal;
}

/**
 * GET ${basePath}/session — returns the current user (or null if not signed in).
 *
 * Both base paths return shapes the client can normalize:
 * - `/api/auth/session` (SessionAuthGuard): returns `{ user: {...} }` or 401
 * - `/_bffless/auth/session`: returns `{ authenticated, user }`
 */
export async function fetchSession(opts: AuthFetchOptions): Promise<SessionResult> {
  let res: Response;
  try {
    res = await fetch(`${opts.basePath}/session`, {
      method: 'GET',
      credentials: 'include',
      signal: opts.signal,
    });
  } catch {
    return { user: null };
  }
  if (res.status === 401) return { user: null };
  if (!res.ok) return { user: null };
  const data = await readJson(res);
  if (!data) return { user: null };
  return { user: normalizeUser(data.user) };
}

export async function signIn(
  opts: AuthFetchOptions,
  body: { email: string; password: string },
): Promise<SignInResult> {
  let res: Response;
  try {
    res = await fetch(`${opts.basePath}/signin`, {
      method: 'POST',
      credentials: 'include',
      headers: HEADERS_JSON,
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    throw new AuthClientError('network', 'Network error. Please try again.');
  }

  const data = await readJson(res);

  if (res.ok) {
    if (data?.status === 'WRONG_CREDENTIALS_ERROR') {
      throw new AuthClientError('wrong_credentials', 'Incorrect email or password.');
    }
    const user = normalizeUser(data?.user);
    if (!user) throw new AuthClientError('unknown', 'Unexpected sign-in response.');
    return { user };
  }

  if (res.status === 401) {
    throw new AuthClientError('wrong_credentials', 'Incorrect email or password.');
  }
  throw new AuthClientError('unknown', data?.message || 'Sign-in failed.');
}

export async function signUp(
  opts: AuthFetchOptions,
  body: { email: string; password: string },
): Promise<SignUpResult> {
  let res: Response;
  try {
    res = await fetch(`${opts.basePath}/signup`, {
      method: 'POST',
      credentials: 'include',
      headers: HEADERS_JSON,
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch {
    throw new AuthClientError('network', 'Network error. Please try again.');
  }

  const data = await readJson(res);

  if (res.ok) {
    if (data?.status === 'EMAIL_ALREADY_EXISTS_ERROR') {
      throw new AuthClientError('email_exists', 'An account with that email already exists.');
    }
    const user = normalizeUser(data?.user);
    if (!user) throw new AuthClientError('unknown', 'Unexpected sign-up response.');
    return {
      user,
      emailVerificationRequired: !!data?.emailVerificationRequired,
    };
  }

  // /api/auth/signup throws BadRequest with message strings
  const msg = data?.message || '';
  if (/already exists/i.test(msg)) {
    throw new AuthClientError('email_exists', 'An account with that email already exists.');
  }
  if (/registration/i.test(msg) && /(disabled|not available)/i.test(msg)) {
    throw new AuthClientError('registration_disabled', msg);
  }
  if (/8 characters/i.test(msg)) {
    throw new AuthClientError('weak_password', msg);
  }
  if (/email/i.test(msg) && /required/i.test(msg)) {
    throw new AuthClientError('invalid_email', msg);
  }
  throw new AuthClientError('unknown', msg || 'Sign-up failed.');
}

export async function forgotPassword(
  opts: AuthFetchOptions,
  body: { email: string },
): Promise<void> {
  try {
    await fetch(`${opts.basePath}/forgot-password`, {
      method: 'POST',
      credentials: 'include',
      headers: HEADERS_JSON,
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch {
    throw new AuthClientError('network', 'Network error. Please try again.');
  }
  // Always success — endpoint deliberately doesn't reveal email existence.
}

export async function resetPassword(
  opts: AuthFetchOptions,
  body: { token: string; password: string },
): Promise<ResetPasswordResult> {
  let res: Response;
  try {
    res = await fetch(`${opts.basePath}/reset-password`, {
      method: 'POST',
      credentials: 'include',
      headers: HEADERS_JSON,
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch {
    throw new AuthClientError('network', 'Network error. Please try again.');
  }

  const data = await readJson(res);

  if (res.ok) {
    if (data?.status === 'RESET_PASSWORD_INVALID_TOKEN_ERROR') {
      throw new AuthClientError(
        'invalid_token',
        'This reset link is invalid or has expired. Please request a new one.',
      );
    }
    return { user: normalizeUser(data?.user) };
  }

  const msg = data?.message || 'Failed to reset password.';
  if (/invalid|expired/i.test(msg)) {
    throw new AuthClientError('invalid_token', msg);
  }
  throw new AuthClientError('unknown', msg);
}

export async function verifyEmail(
  opts: AuthFetchOptions,
  body: { token: string },
): Promise<VerifyEmailResult> {
  let res: Response;
  try {
    res = await fetch(`${opts.basePath}/verify-email`, {
      method: 'POST',
      credentials: 'include',
      headers: HEADERS_JSON,
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch {
    throw new AuthClientError('network', 'Network error. Please try again.');
  }

  const data = await readJson(res);

  if (res.ok) {
    if (data?.status === 'EMAIL_VERIFICATION_INVALID_TOKEN_ERROR') {
      throw new AuthClientError(
        'invalid_token',
        'This verification link is invalid or has expired.',
      );
    }
    return { user: normalizeUser(data?.user) };
  }

  const msg = data?.message || 'Failed to verify email.';
  if (/invalid|expired/i.test(msg)) {
    throw new AuthClientError('invalid_token', msg);
  }
  throw new AuthClientError('unknown', msg);
}

export async function resendVerification(opts: AuthFetchOptions): Promise<void> {
  try {
    await fetch(`${opts.basePath}/send-verification-email`, {
      method: 'POST',
      credentials: 'include',
      headers: HEADERS_JSON,
      body: '{}',
      signal: opts.signal,
    });
  } catch {
    throw new AuthClientError('network', 'Network error. Please try again.');
  }
}

export async function signOut(opts: AuthFetchOptions): Promise<void> {
  // /api/auth uses 'signout', /_bffless/auth uses 'logout'
  const path = opts.basePath.endsWith('/api/auth') ? 'signout' : 'logout';
  try {
    await fetch(`${opts.basePath}/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: HEADERS_JSON,
      body: '{}',
      signal: opts.signal,
    });
  } catch {
    // best-effort; consumer should still reflect signed-out state
  }
}

export async function fetchLoginMethods(opts: AuthFetchOptions): Promise<LoginMethods> {
  let res: Response;
  try {
    res = await fetch(`${opts.basePath}/login-methods`, {
      method: 'GET',
      credentials: 'include',
      signal: opts.signal,
    });
  } catch {
    return { hasPassword: true, hasGoogle: false };
  }
  if (!res.ok) return { hasPassword: true, hasGoogle: false };
  const data = await readJson(res);
  return {
    hasPassword: data?.hasPassword ?? true,
    hasGoogle: !!data?.hasGoogle,
  };
}

