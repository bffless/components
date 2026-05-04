import type { ReactNode } from 'react';
import type { UseGoogleCalendarConnectResult } from '../../../hooks/useGoogleCalendarConnect';

export interface SchedulingCalendarConnectProps {
  connect: UseGoogleCalendarConnectResult;
  className?: string;
  buttonClassName?: string;
  /**
   * Custom renderer. Receives the connect result so the consumer can build
   * any UI shape they like. When omitted, a minimal "Connect Google" /
   * "Connected as <email>" panel is rendered.
   */
  children?: (connect: UseGoogleCalendarConnectResult) => ReactNode;
  /** Label for the connect CTA button. Defaults to 'Connect Google Calendar'. */
  connectLabel?: ReactNode;
  /**
   * If your project completes OAuth in CE Settings → Integrations rather than
   * via per-site `start()`, pass the URL here so the button becomes a link
   * instead of triggering the per-site OAuth route.
   */
  externalSetupUrl?: string;
}

export function SchedulingCalendarConnect({
  connect,
  className,
  buttonClassName,
  children,
  connectLabel,
  externalSetupUrl,
}: SchedulingCalendarConnectProps) {
  if (children) return <>{children(connect)}</>;

  const { status, connectedEmail, availableCalendars, error, start, refresh } =
    connect;

  return (
    <div className={className}>
      {status === 'connected' ? (
        <div>
          <strong>Connected{connectedEmail ? `: ${connectedEmail}` : ''}</strong>
          {availableCalendars.length > 0 ? (
            <small>
              {availableCalendars.length} calendar
              {availableCalendars.length === 1 ? '' : 's'} available
            </small>
          ) : null}
          <button type="button" className={buttonClassName} onClick={refresh}>
            Refresh
          </button>
        </div>
      ) : (
        <div>
          <strong>Google Calendar is not connected.</strong>
          <p>
            Connecting lets bookings mirror to a sub-calendar and reads free /
            busy windows from the connected account.
          </p>
          {externalSetupUrl ? (
            <a
              href={externalSetupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClassName}
            >
              {connectLabel ?? 'Connect Google Calendar'}
            </a>
          ) : (
            <button
              type="button"
              className={buttonClassName}
              onClick={start}
              disabled={status === 'connecting'}
            >
              {status === 'connecting'
                ? 'Connecting…'
                : (connectLabel ?? 'Connect Google Calendar')}
            </button>
          )}
        </div>
      )}
      {error ? <div role="alert">{error}</div> : null}
    </div>
  );
}
