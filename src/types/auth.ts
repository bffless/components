export interface AuthUser {
  id: string;
  email: string;
  role: string | null;
}

export type AuthMode =
  | 'signin'
  | 'signup'
  | 'forgot'
  | 'reset'
  | 'verify'
  | 'verify-sent';

export type AuthErrorCode =
  | 'wrong_credentials'
  | 'email_exists'
  | 'invalid_email'
  | 'weak_password'
  | 'invalid_token'
  | 'registration_disabled'
  | 'signup_disabled'
  | 'network'
  | 'unknown';

export interface AuthError {
  code: AuthErrorCode;
  message: string;
}

export interface SignInResult {
  user: AuthUser;
}

export interface SignUpResult {
  user: AuthUser;
  emailVerificationRequired: boolean;
}

export interface ResetPasswordResult {
  user: AuthUser | null;
}

export interface VerifyEmailResult {
  user: AuthUser | null;
}

export interface SessionResult {
  user: AuthUser | null;
}

export interface LoginMethods {
  /** @deprecated Use `workspace.hasPassword`. Kept for older AuthDialog versions and older CE backends that returned only the flat shape. */
  hasPassword: boolean;
  /** @deprecated Use `workspace.hasGoogle`. Kept for older AuthDialog versions and older CE backends that returned only the flat shape. */
  hasGoogle: boolean;
  /**
   * Workspace-level auth capabilities. Always present on responses from CE
   * backends >= the namespaced rollout. Falls back to defaults derived from
   * top-level fields when the response predates that change.
   */
  workspace: {
    hasPassword: boolean;
    hasGoogle: boolean;
    /** Workspace's master public-signup gate (admin kill switch). */
    allowSignup: boolean;
  };
  /**
   * Per-project signup gate. Present only when the workspace has
   * REQUIRE_PROJECT_MEMBERSHIP enabled AND the request hostname maps to a
   * project. Absent on the admin domain or when the master switch is off.
   */
  project?: {
    allowSignup: boolean;
  };
}

/**
 * Effective signup permission for the current site. AuthDialog hides the
 * Sign up tab when this is false. Computed as
 * `workspace.allowSignup && (project?.allowSignup ?? true)`.
 */
export function canSignup(methods: LoginMethods | null): boolean {
  if (!methods) return true; // Default-allow while loading; mirrors prior behavior.
  return methods.workspace.allowSignup && (methods.project?.allowSignup ?? true);
}
