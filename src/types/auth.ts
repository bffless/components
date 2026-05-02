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
  hasPassword: boolean;
  hasGoogle: boolean;
}
