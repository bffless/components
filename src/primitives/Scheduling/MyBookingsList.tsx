import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import {
  useMyBookings,
  type UseMyBookingsOptions,
  type UseMyBookingsResult,
} from '../../hooks/useMyBookings';
import type { SchedulingMyBookingRow } from '../../types/scheduling';

// ─── Context ──────────────────────────────────────────────────────────────────

const MyBookingsListContext = createContext<UseMyBookingsResult | null>(null);

function useMyBookingsListContext(): UseMyBookingsResult {
  const ctx = useContext(MyBookingsListContext);
  if (!ctx) {
    throw new Error('<MyBookingsList.*> must be rendered inside <MyBookingsList>.');
  }
  return ctx;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export interface MyBookingsListProps extends UseMyBookingsOptions {
  className?: string;
  children: ReactNode;
  /**
   * Optionally pass an externally-managed bookings result (e.g. when the
   * parent island already calls useMyBookings to drive a header summary).
   * When omitted, the root creates its own via useMyBookings().
   */
  bookings?: UseMyBookingsResult;
}

function MyBookingsListRoot({
  className,
  children,
  bookings: external,
  ...hookOpts
}: MyBookingsListProps) {
  // Hooks can't be called conditionally, so the internal hook always runs.
  // When an external hook is supplied, suppress its initial fetch so the
  // network call doesn't fire twice.
  const internal = useMyBookings(
    external ? { skipInitialLoad: true } : hookOpts,
  );
  const value = external ?? internal;
  return (
    <MyBookingsListContext.Provider value={value}>
      <div className={className}>{children}</div>
    </MyBookingsListContext.Provider>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────

export interface MyBookingsListLoadingProps {
  className?: string;
  children?: ReactNode;
}

function Loading({ className, children }: MyBookingsListLoadingProps) {
  const { loading } = useMyBookingsListContext();
  if (!loading) return null;
  return <div className={className}>{children ?? 'Loading…'}</div>;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export interface MyBookingsListErrorProps {
  className?: string;
  /** Render override receiving the error message. */
  children?: (message: string) => ReactNode;
}

function ErrorMessage({ className, children }: MyBookingsListErrorProps) {
  const { error } = useMyBookingsListContext();
  if (!error) return null;
  return (
    <div className={className} role="alert">
      {children ? children(error) : error}
    </div>
  );
}

// ─── Empty ────────────────────────────────────────────────────────────────────

export interface MyBookingsListEmptyProps {
  className?: string;
  children?: ReactNode;
}

function Empty({ className, children }: MyBookingsListEmptyProps) {
  const { upcoming, past, loading, error } = useMyBookingsListContext();
  // Hide the empty state while we're still resolving — otherwise it flashes
  // before the first fetch resolves.
  if (loading || error) return null;
  if (upcoming.length > 0 || past.length > 0) return null;
  return <div className={className}>{children}</div>;
}

// ─── Item render-prop ─────────────────────────────────────────────────────────

export interface MyBookingsItemHelpers {
  /** Initiate cancellation of this row. */
  cancel: () => void;
  /** True while THIS row's cancellation is in flight. */
  cancelling: boolean;
}

export type MyBookingsItemRenderer = (
  booking: SchedulingMyBookingRow,
  helpers: MyBookingsItemHelpers,
) => ReactNode;

// ─── Upcoming ─────────────────────────────────────────────────────────────────

export interface MyBookingsListUpcomingProps {
  className?: string;
  /** Render each upcoming booking. Receives { cancel, cancelling }. */
  renderItem: MyBookingsItemRenderer;
  /** Wrapper around the item list (e.g. a section header). */
  children?: ReactNode;
  /**
   * If true, the section renders even when there are no upcoming bookings —
   * useful when `children` carries a heading you want shown regardless.
   * Defaults to false (whole section hides when empty).
   */
  renderEmpty?: boolean;
}

function Upcoming({
  className,
  renderItem,
  children,
  renderEmpty = false,
}: MyBookingsListUpcomingProps) {
  const { upcoming, cancelling, cancel } = useMyBookingsListContext();
  if (!renderEmpty && upcoming.length === 0) return null;
  return (
    <div className={className}>
      {children}
      {upcoming.map((b) => renderItem(b, {
        cancel: () => cancel(b.id),
        cancelling: cancelling === b.id,
      }))}
    </div>
  );
}

// ─── Past ─────────────────────────────────────────────────────────────────────

export interface MyBookingsListPastProps {
  className?: string;
  renderItem: MyBookingsItemRenderer;
  children?: ReactNode;
  renderEmpty?: boolean;
}

function Past({
  className,
  renderItem,
  children,
  renderEmpty = false,
}: MyBookingsListPastProps) {
  const { past, cancelling, cancel } = useMyBookingsListContext();
  if (!renderEmpty && past.length === 0) return null;
  return (
    <div className={className}>
      {children}
      {past.map((b) => renderItem(b, {
        cancel: () => cancel(b.id),
        cancelling: cancelling === b.id,
      }))}
    </div>
  );
}

// ─── Compound export ──────────────────────────────────────────────────────────

export const MyBookingsList = Object.assign(MyBookingsListRoot, {
  Loading,
  Error: ErrorMessage,
  Empty,
  Upcoming,
  Past,
});
