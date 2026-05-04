import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveSchedulingBasePath,
  schedulingGet,
  schedulingPost,
  SchedulingClientError,
} from '../lib/schedulingClient';
import type { SchedulingCalendarSummary } from '../types/scheduling';

export type GoogleCalendarConnectStatus =
  | 'unknown'
  | 'disconnected'
  | 'connected'
  | 'connecting';

export interface UseGoogleCalendarConnectOptions {
  /** Override the API base path. Default: auto-detect via resolveSchedulingBasePath(). */
  apiBase?: string;
  /**
   * Override the path to the calendars list endpoint, relative to apiBase.
   * Default: '/admin/google/calendars'.
   *
   * Per Phase C-2 the per-site UI may instead read availableCalendars from
   * the project's `/_bffless/integrations` endpoint — consumers that want
   * that wiring should override this and the `oauthStartPath` below.
   */
  calendarsPath?: string;
  /**
   * Override the path that initiates the OAuth handoff. Default:
   * '/admin/google/oauth/start'. The endpoint is expected to return either
   * a JSON `{ authUrl }` or a 302 redirect; the hook handles both.
   */
  oauthStartPath?: string;
  /** Skip the initial status probe (e.g. SSR). */
  skipInitialLoad?: boolean;
}

export interface UseGoogleCalendarConnectResult {
  status: GoogleCalendarConnectStatus;
  connectedEmail: string | null;
  availableCalendars: SchedulingCalendarSummary[];
  error: string | null;

  refresh: () => Promise<void>;
  start: () => Promise<void>;
}

interface CalendarsResponse {
  // Servers are inconsistent — accept whichever shape the per-site or CE
  // endpoint returns.
  email?: string | null;
  connectedEmail?: string | null;
  calendars?: SchedulingCalendarSummary[];
  availableCalendars?: SchedulingCalendarSummary[];
}

interface OAuthStartResponse {
  authUrl?: string;
  url?: string;
}

export function useGoogleCalendarConnect(
  opts: UseGoogleCalendarConnectOptions = {},
): UseGoogleCalendarConnectResult {
  const basePath = useMemo(
    () => opts.apiBase ?? resolveSchedulingBasePath(),
    [opts.apiBase],
  );
  const calendarsPath = opts.calendarsPath ?? '/admin/google/calendars';
  const oauthStartPath = opts.oauthStartPath ?? '/admin/google/oauth/start';

  const [status, setStatus] = useState<GoogleCalendarConnectStatus>('unknown');
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [availableCalendars, setAvailableCalendars] = useState<
    SchedulingCalendarSummary[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef(false);

  const setErr = useCallback((err: unknown, fallback: string) => {
    if (err instanceof SchedulingClientError) setError(err.message);
    else if (err instanceof Error) setError(err.message);
    else setError(fallback);
  }, []);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const data = await schedulingGet<CalendarsResponse>(
        basePath,
        calendarsPath,
        undefined,
        // 401 = not connected; 404 = no per-site endpoint at all (Google
        // managed exclusively in CE Settings — common when consumers pass
        // externalSetupUrl and never provision a per-site calendars pipeline).
        // Either way: render the disconnected card, don't throw.
        { treat401AsEmpty: true, treat404AsEmpty: true },
      );
      if (!data) {
        setStatus('disconnected');
        setConnectedEmail(null);
        setAvailableCalendars([]);
        setError(null);
        return;
      }
      const calendars = data.calendars ?? data.availableCalendars ?? [];
      const email = data.email ?? data.connectedEmail ?? null;
      setAvailableCalendars(calendars);
      setConnectedEmail(email);
      setStatus(calendars.length > 0 || email ? 'connected' : 'disconnected');
      setError(null);
    } catch (err) {
      // Treat any non-401 error as "still unknown" — better than flipping to
      // disconnected and hiding a transient outage from the consumer.
      setErr(err, 'Failed to check Google Calendar status.');
    } finally {
      inFlightRef.current = false;
    }
  }, [basePath, calendarsPath, setErr]);

  useEffect(() => {
    if (opts.skipInitialLoad) return;
    refresh();
  }, [refresh, opts.skipInitialLoad]);

  const start = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    try {
      const data = await schedulingPost<OAuthStartResponse>(
        basePath,
        oauthStartPath,
      );
      const url = data?.authUrl ?? data?.url;
      if (typeof window === 'undefined') {
        // SSR fallback — surface the URL via error so the caller can render
        // an anchor instead.
        if (url) setError(`Open ${url} to connect Google.`);
        else setError('Could not start Google OAuth.');
        return;
      }
      if (url) {
        window.location.assign(url);
      } else {
        // Some servers redirect directly via 3xx. The fetch above wouldn't
        // complete in that case, so this branch is best-effort.
        setError('Could not start Google OAuth.');
        setStatus('disconnected');
      }
    } catch (err) {
      setStatus('disconnected');
      setErr(err, 'Could not start Google OAuth.');
    }
  }, [basePath, oauthStartPath, setErr]);

  return {
    status,
    connectedEmail,
    availableCalendars,
    error,
    refresh,
    start,
  };
}
