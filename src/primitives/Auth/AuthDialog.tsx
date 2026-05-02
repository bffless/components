import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { UseAuthResult } from '../../hooks/useAuth';
import { canSignup as resolveCanSignup, type AuthMode } from '../../types/auth';

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthDialogContextValue {
  auth: UseAuthResult;
  open: boolean;
  close: () => void;
  titleId: string;
}

const AuthDialogContext = createContext<AuthDialogContextValue | null>(null);

function useDialogContext(): AuthDialogContextValue {
  const ctx = useContext(AuthDialogContext);
  if (!ctx) {
    throw new Error('<AuthDialog.*> must be rendered inside <AuthDialog>.');
  }
  return ctx;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export interface AuthDialogProps {
  /** Result from useAuth(). The dialog reads + drives this. */
  auth: UseAuthResult;
  /** Controlled open state. */
  open: boolean;
  /** Called when the dialog wants to close (overlay click, ESC, Close button). */
  onOpenChange: (open: boolean) => void;
  /** Children (typically `<AuthDialog.Overlay />` and `<AuthDialog.Panel>...`). */
  children: ReactNode;
  /**
   * Disable closing via ESC key. Defaults to false (ESC closes).
   */
  disableEscapeClose?: boolean;
  /**
   * Where to portal the dialog. Defaults to `document.body`. Pass `null` to
   * disable portaling and render in-place.
   */
  container?: HTMLElement | null;
}

function AuthDialogRoot({
  auth,
  open,
  onOpenChange,
  children,
  disableEscapeClose,
  container,
}: AuthDialogProps) {
  const titleId = useId();
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // ESC to close + focus restore.
  useEffect(() => {
    if (!open) return;

    if (typeof document !== 'undefined') {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
    }

    if (disableEscapeClose) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onKey);
      return () => {
        window.removeEventListener('keydown', onKey);
      };
    }
    return;
  }, [open, disableEscapeClose, close]);

  useEffect(() => {
    if (open) return;
    const el = previouslyFocused.current;
    previouslyFocused.current = null;
    if (el && typeof el.focus === 'function') {
      try {
        el.focus();
      } catch {
        // ignore
      }
    }
  }, [open]);

  const ctx = useMemo<AuthDialogContextValue>(
    () => ({ auth, open, close, titleId }),
    [auth, open, close, titleId],
  );

  if (!open) return null;

  const content = <AuthDialogContext.Provider value={ctx}>{children}</AuthDialogContext.Provider>;

  if (container === null) return content;

  if (typeof document === 'undefined') return null;
  const target = container ?? document.body;
  return createPortal(content, target);
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

export interface AuthDialogOverlayProps {
  className?: string;
  /**
   * If true (default), clicking the overlay closes the dialog.
   */
  closeOnClick?: boolean;
}

function Overlay({ className, closeOnClick = true }: AuthDialogOverlayProps) {
  const { close, open } = useDialogContext();
  return (
    <div
      data-state={open ? 'open' : 'closed'}
      className={className}
      onClick={closeOnClick ? close : undefined}
      aria-hidden
    />
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export interface AuthDialogPanelProps {
  className?: string;
  children: ReactNode;
}

function Panel({ className, children }: AuthDialogPanelProps) {
  const { open, titleId } = useDialogContext();
  const ref = useRef<HTMLDivElement | null>(null);

  // Focus first focusable on open.
  useEffect(() => {
    if (!open || !ref.current) return;
    const first = ref.current.querySelector<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])',
    );
    if (first) {
      try {
        first.focus();
      } catch {
        // ignore
      }
    }
  }, [open]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-state={open ? 'open' : 'closed'}
      className={className}
    >
      {children}
    </div>
  );
}

// ─── Header / Title / Close ───────────────────────────────────────────────────

export interface AuthDialogHeaderProps {
  className?: string;
  children: ReactNode;
}
function Header({ className, children }: AuthDialogHeaderProps) {
  return <div className={className}>{children}</div>;
}

export interface AuthDialogTitleProps {
  className?: string;
  children?: ReactNode;
  /**
   * If provided, this string is shown when none of the more-specific
   * mode children are passed. Defaults to a per-mode label.
   */
  fallback?: string;
}

function Title({ className, children, fallback }: AuthDialogTitleProps) {
  const { auth, titleId } = useDialogContext();
  const text = children ?? fallback ?? defaultTitleForMode(auth.mode);
  return (
    <h2 id={titleId} className={className}>
      {text}
    </h2>
  );
}

function defaultTitleForMode(mode: AuthMode): string {
  switch (mode) {
    case 'signin':
      return 'Sign in';
    case 'signup':
      return 'Create account';
    case 'forgot':
      return 'Reset your password';
    case 'reset':
      return 'Choose a new password';
    case 'verify':
      return 'Verifying your email';
    case 'verify-sent':
      return 'Check your inbox';
    default:
      return 'Account';
  }
}

export interface AuthDialogCloseProps {
  className?: string;
  children?: ReactNode;
  ariaLabel?: string;
}
function Close({ className, children, ariaLabel }: AuthDialogCloseProps) {
  const { close } = useDialogContext();
  return (
    <button
      type="button"
      onClick={close}
      className={className}
      aria-label={ariaLabel ?? 'Close'}
    >
      {children ?? '×'}
    </button>
  );
}

// ─── Error ────────────────────────────────────────────────────────────────────

export interface AuthDialogErrorProps {
  className?: string;
  /** If true, hide when there's no error (default true). */
  hideEmpty?: boolean;
  children?: (message: string) => ReactNode;
}
function ErrorDisplay({ className, hideEmpty = true, children }: AuthDialogErrorProps) {
  const { auth } = useDialogContext();
  if (!auth.error) {
    if (hideEmpty) return null;
    return <div className={className} role="alert" />;
  }
  return (
    <div className={className} role="alert">
      {children ? children(auth.error.message) : auth.error.message}
    </div>
  );
}

// ─── Forms ────────────────────────────────────────────────────────────────────

interface FormPropsBase {
  className?: string;
  inputClassName?: string;
  submitClassName?: string;
  submitLabel?: ReactNode;
  /** Optional renderProp slot: render after default fields, before submit. */
  children?: ReactNode;
}

function shouldShowFor(mode: AuthMode, current: AuthMode): boolean {
  return mode === current;
}

export interface AuthDialogSignInFormProps extends FormPropsBase {
  /** Default email value. */
  defaultEmail?: string;
}

function SignInForm(props: AuthDialogSignInFormProps) {
  const { auth } = useDialogContext();
  if (!shouldShowFor(auth.mode, 'signin')) return null;

  return (
    <FormShell
      onSubmit={async (data) => {
        await auth.signIn(data.email, data.password);
      }}
      loading={auth.loading}
      className={props.className}
    >
      <Field
        type="email"
        name="email"
        label="Email"
        autoComplete="email"
        required
        className={props.inputClassName}
        defaultValue={props.defaultEmail}
      />
      <Field
        type="password"
        name="password"
        label="Password"
        autoComplete="current-password"
        required
        className={props.inputClassName}
      />
      {props.children}
      <button type="submit" className={props.submitClassName} disabled={auth.loading}>
        {props.submitLabel ?? (auth.loading ? 'Signing in…' : 'Sign in')}
      </button>
    </FormShell>
  );
}

export interface AuthDialogSignUpFormProps extends FormPropsBase {
  defaultEmail?: string;
  /** Minimum password length hint shown to the user. Defaults to 8. */
  minPasswordLength?: number;
}

function SignUpForm(props: AuthDialogSignUpFormProps) {
  const { auth } = useDialogContext();
  if (!shouldShowFor(auth.mode, 'signup')) return null;

  // If the site doesn't accept signups, render a disabled panel instead of
  // the form. Covers two cases: (1) consumer template still calls
  // auth.setMode('signup') somewhere we can't intercept, (2) user lands on
  // signup mode via a deep link / URL state.
  if (!resolveCanSignup(auth.loginMethods)) {
    return (
      <div className={props.className} role="status">
        <p>This site doesn't accept new signups.</p>
        <p>
          If you already have an account,{' '}
          <button
            type="button"
            onClick={() => {
              auth.clearError();
              auth.setMode('signin');
            }}
          >
            sign in
          </button>
          .
        </p>
      </div>
    );
  }

  const minLen = props.minPasswordLength ?? 8;

  return (
    <FormShell
      onSubmit={async (data) => {
        await auth.signUp(data.email, data.password);
      }}
      loading={auth.loading}
      className={props.className}
    >
      <Field
        type="email"
        name="email"
        label="Email"
        autoComplete="email"
        required
        className={props.inputClassName}
        defaultValue={props.defaultEmail}
      />
      <Field
        type="password"
        name="password"
        label="Password"
        autoComplete="new-password"
        required
        minLength={minLen}
        className={props.inputClassName}
        hint={`At least ${minLen} characters`}
      />
      {props.children}
      <button type="submit" className={props.submitClassName} disabled={auth.loading}>
        {props.submitLabel ?? (auth.loading ? 'Creating account…' : 'Create account')}
      </button>
    </FormShell>
  );
}

export interface AuthDialogForgotPasswordFormProps extends FormPropsBase {
  defaultEmail?: string;
  /** Message shown after the request is submitted. */
  sentMessage?: ReactNode;
  sentClassName?: string;
}

function ForgotPasswordForm(props: AuthDialogForgotPasswordFormProps) {
  const { auth } = useDialogContext();
  const [sent, setSent] = useState(false);
  if (!shouldShowFor(auth.mode, 'forgot')) return null;

  if (sent) {
    return (
      <div className={props.sentClassName}>
        {props.sentMessage ??
          'If an account exists for that email, a reset link has been sent. Check your inbox.'}
      </div>
    );
  }

  return (
    <FormShell
      onSubmit={async (data) => {
        await auth.forgotPassword(data.email);
        setSent(true);
      }}
      loading={auth.loading}
      className={props.className}
    >
      <Field
        type="email"
        name="email"
        label="Email"
        autoComplete="email"
        required
        className={props.inputClassName}
        defaultValue={props.defaultEmail}
      />
      {props.children}
      <button type="submit" className={props.submitClassName} disabled={auth.loading}>
        {props.submitLabel ?? (auth.loading ? 'Sending…' : 'Send reset link')}
      </button>
    </FormShell>
  );
}

export interface AuthDialogResetPasswordFormProps extends FormPropsBase {
  minPasswordLength?: number;
}

function ResetPasswordForm(props: AuthDialogResetPasswordFormProps) {
  const { auth } = useDialogContext();
  if (!shouldShowFor(auth.mode, 'reset')) return null;
  const minLen = props.minPasswordLength ?? 8;

  return (
    <FormShell
      onSubmit={async (data) => {
        await auth.resetPassword(data.password);
      }}
      loading={auth.loading}
      className={props.className}
    >
      <Field
        type="password"
        name="password"
        label="New password"
        autoComplete="new-password"
        required
        minLength={minLen}
        className={props.inputClassName}
        hint={`At least ${minLen} characters`}
      />
      {props.children}
      <button type="submit" className={props.submitClassName} disabled={auth.loading}>
        {props.submitLabel ?? (auth.loading ? 'Saving…' : 'Save new password')}
      </button>
    </FormShell>
  );
}

export interface AuthDialogVerifyEmailNoticeProps {
  className?: string;
  resendClassName?: string;
  resendLabel?: ReactNode;
  /** Custom message renderer; receives the captured email or null. */
  children?: (email: string | null) => ReactNode;
}

function VerifyEmailNotice(props: AuthDialogVerifyEmailNoticeProps) {
  const { auth } = useDialogContext();
  const [resent, setResent] = useState(false);

  // Show during 'verify-sent' (post-signup) and 'verify' (auto-verify in flight).
  if (auth.mode !== 'verify' && auth.mode !== 'verify-sent') return null;

  if (auth.mode === 'verify') {
    return (
      <div className={props.className} aria-live="polite">
        Verifying your email…
      </div>
    );
  }

  return (
    <div className={props.className} aria-live="polite">
      {props.children ? (
        props.children(auth.pendingVerifyEmail)
      ) : (
        <p>
          We sent a verification link
          {auth.pendingVerifyEmail ? ` to ${auth.pendingVerifyEmail}` : ''}. Click the
          link to finish setting up your account.
        </p>
      )}
      <button
        type="button"
        className={props.resendClassName}
        disabled={auth.loading || resent}
        onClick={async () => {
          try {
            await auth.resendVerification();
            setResent(true);
          } catch {
            // error surfaced via auth.error
          }
        }}
      >
        {resent ? 'Sent.' : props.resendLabel ?? 'Resend email'}
      </button>
    </div>
  );
}

// ─── Mode switches ────────────────────────────────────────────────────────────

export interface AuthDialogModeSwitchProps {
  to: AuthMode;
  className?: string;
  children: ReactNode;
  /** Show only when the current mode is in this set. Defaults to always. */
  visibleWhen?: AuthMode[];
}

function ModeSwitch({ to, className, children, visibleWhen }: AuthDialogModeSwitchProps) {
  const { auth } = useDialogContext();
  if (visibleWhen && !visibleWhen.includes(auth.mode)) return null;
  // Hide "switch to sign up" links when the site doesn't accept new signups.
  // Workspace-level kill switch OR per-project allowPublicSignup=false collapses
  // both to canSignup=false here, so the consumer template doesn't need to
  // know which gate fired.
  if (to === 'signup' && !resolveCanSignup(auth.loginMethods)) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        auth.clearError();
        auth.setMode(to);
      }}
    >
      {children}
    </button>
  );
}

export interface AuthDialogForgotPasswordLinkProps {
  className?: string;
  children?: ReactNode;
}
function ForgotPasswordLink({ className, children }: AuthDialogForgotPasswordLinkProps) {
  const { auth } = useDialogContext();
  if (auth.mode !== 'signin') return null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        auth.clearError();
        auth.setMode('forgot');
      }}
    >
      {children ?? 'Forgot password?'}
    </button>
  );
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface FormShellProps {
  className?: string;
  loading: boolean;
  children: ReactNode;
  onSubmit: (data: { email: string; password: string }) => Promise<void> | void;
}
function FormShell({ className, loading, children, onSubmit }: FormShellProps) {
  const handle = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (loading) return;
      const fd = new FormData(e.currentTarget);
      const email = String(fd.get('email') ?? '');
      const password = String(fd.get('password') ?? '');
      try {
        await onSubmit({ email, password });
      } catch {
        // surfaced via auth.error
      }
    },
    [loading, onSubmit],
  );
  return (
    <form className={className} onSubmit={handle} noValidate>
      {children}
    </form>
  );
}

interface FieldProps {
  type: 'email' | 'password';
  name: 'email' | 'password';
  label: ReactNode;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  defaultValue?: string;
  hint?: ReactNode;
  className?: string;
}
function Field({
  type,
  name,
  label,
  autoComplete,
  required,
  minLength,
  defaultValue,
  hint,
  className,
}: FieldProps) {
  const id = useId();
  return (
    <label htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type={type}
        name={name}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        defaultValue={defaultValue}
        className={className}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

// ─── Compound export ──────────────────────────────────────────────────────────

export const AuthDialog = Object.assign(AuthDialogRoot, {
  Overlay,
  Panel,
  Header,
  Title,
  Close,
  Error: ErrorDisplay,
  SignInForm,
  SignUpForm,
  ForgotPasswordForm,
  ResetPasswordForm,
  VerifyEmailNotice,
  ModeSwitch,
  ForgotPasswordLink,
});
