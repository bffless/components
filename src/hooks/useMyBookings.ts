import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveSchedulingBasePath,
  schedulingGet,
  schedulingPost,
  SchedulingClientError,
} from '../lib/schedulingClient';
import type { SchedulingMyBookingRow } from '../types/scheduling';

export interface UseMyBookingsOptions {
  /** Override the API base path. Default: auto-detect via resolveSchedulingBasePath(). */
  apiBase?: string;
  /**
   * If true, the hook will not auto-load on mount — the consumer calls
   * `refresh()` explicitly. Useful when the account page is gated by an auth
   * status that's still resolving and the initial fetch shouldn't fire until
   * the user is known-signed-in.
   */
  skipInitialLoad?: boolean;
  /**
   * Called once with the canceled row id whenever a `cancel(id)` succeeds.
   * Fires after the optimistic update has been committed.
   */
  onCancelled?: (bookingId: string) => void;
}

export interface UseMyBookingsResult {
  basePath: string;
  /** Bookings whose `starts_at` is in the future. Sorted soonest-first. */
  upcoming: SchedulingMyBookingRow[];
  /** Bookings whose `starts_at` is in the past. Sorted newest-first. */
  past: SchedulingMyBookingRow[];
  /** True while the initial / refresh fetch is in flight. */
  loading: boolean;
  /** The id currently being canceled, or null. */
  cancelling: string | null;
  /** Last error string. Cleared on the next successful op. */
  error: string | null;

  refresh: () => Promise<void>;
  /**
   * Cancel a booking via POST /bookings/manage. Optimistically removes the row
   * from `upcoming` and reverts on failure.
   */
  cancel: (bookingId: string) => Promise<void>;
}

interface MyBookingsResponse {
  bookings?: SchedulingMyBookingRow[];
  count?: number;
}

function partition(
  rows: SchedulingMyBookingRow[],
  nowMs: number,
): { upcoming: SchedulingMyBookingRow[]; past: SchedulingMyBookingRow[] } {
  const upcoming: SchedulingMyBookingRow[] = [];
  const past: SchedulingMyBookingRow[] = [];
  for (const b of rows) {
    const t = Date.parse(b.starts_at);
    // Treat unparseable dates as past so they don't get stuck "upcoming."
    if (Number.isFinite(t) && t >= nowMs) {
      upcoming.push(b);
    } else {
      past.push(b);
    }
  }
  upcoming.sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
  past.sort((a, b) => (a.starts_at < b.starts_at ? 1 : a.starts_at > b.starts_at ? -1 : 0));
  return { upcoming, past };
}

export function useMyBookings(opts: UseMyBookingsOptions = {}): UseMyBookingsResult {
  const basePath = useMemo(
    () => opts.apiBase ?? resolveSchedulingBasePath(),
    [opts.apiBase],
  );

  const [rows, setRows] = useState<SchedulingMyBookingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Snapshot the latest onCancelled so callers don't have to memoize it.
  const onCancelledRef = useRef(opts.onCancelled);
  onCancelledRef.current = opts.onCancelled;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await schedulingGet<MyBookingsResponse>(basePath, '/my-bookings');
      setRows(Array.isArray(data?.bookings) ? data.bookings : []);
    } catch (err) {
      const message =
        err instanceof SchedulingClientError ? err.message
        : err instanceof Error ? err.message
        : 'Failed to load bookings.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    if (opts.skipInitialLoad) return;
    refresh();
  }, [refresh, opts.skipInitialLoad]);

  const cancel = useCallback(
    async (bookingId: string) => {
      // Find the row + its token. If we don't have the row in state we can't
      // cancel it (the manage endpoint is token-gated, not session-gated).
      const target = rows.find((r) => r.id === bookingId);
      if (!target) {
        setError('Booking not found.');
        return;
      }
      if (!target.reschedule_token) {
        setError('This booking can no longer be cancelled.');
        return;
      }

      // Optimistic: drop the row from local state and remember the previous
      // list so we can revert on failure.
      const previous = rows;
      setRows((prev) => prev.filter((r) => r.id !== bookingId));
      setCancelling(bookingId);
      setError(null);
      try {
        await schedulingPost(basePath, '/bookings/manage', {
          token: target.reschedule_token,
          action: 'cancel',
        });
        onCancelledRef.current?.(bookingId);
        // Re-fetch so the row reappears under "past" with status=cancelled.
        await refresh();
      } catch (err) {
        // Revert the optimistic removal.
        setRows(previous);
        const message =
          err instanceof SchedulingClientError ? err.message
          : err instanceof Error ? err.message
          : 'Cancellation failed.';
        setError(message);
      } finally {
        setCancelling(null);
      }
    },
    [basePath, rows, refresh],
  );

  // Recompute upcoming/past whenever rows change. `now` is captured at render
  // — fine for the typical "open the page, look at bookings" path; long-lived
  // sessions can call refresh() to re-bucket if a booking just transitioned.
  const { upcoming, past } = useMemo(() => partition(rows, Date.now()), [rows]);

  return {
    basePath,
    upcoming,
    past,
    loading,
    cancelling,
    error,
    refresh,
    cancel,
  };
}
