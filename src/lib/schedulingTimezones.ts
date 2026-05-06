// Curated IANA timezone list grouped by region.
//
// Owners pick once at setup, customers never see this. Goal: cover the common
// cases without drowning the dropdown. Anything exotic falls back to the
// Custom… text input. Templates can pass their own groups via
// SchedulingSettingsPanel.Timezone's `groups` prop, or pass `null` to render
// a free-text input only.

export interface SchedulingTimezoneOption {
  tz: string;
  label: string;
}

export interface SchedulingTimezoneGroup {
  region: string;
  values: SchedulingTimezoneOption[];
}

export const DEFAULT_TIMEZONE_GROUPS: SchedulingTimezoneGroup[] = [
  {
    region: 'United States',
    values: [
      { tz: 'America/New_York', label: 'Eastern (New York)' },
      { tz: 'America/Chicago', label: 'Central (Chicago)' },
      { tz: 'America/Denver', label: 'Mountain (Denver)' },
      { tz: 'America/Phoenix', label: 'Mountain — no DST (Phoenix)' },
      { tz: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
      { tz: 'America/Anchorage', label: 'Alaska (Anchorage)' },
      { tz: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
    ],
  },
  {
    region: 'Canada',
    values: [
      { tz: 'America/Toronto', label: 'Eastern (Toronto)' },
      { tz: 'America/Vancouver', label: 'Pacific (Vancouver)' },
    ],
  },
  {
    region: 'Australia & New Zealand',
    values: [
      { tz: 'Australia/Sydney', label: 'AEST/AEDT (Sydney)' },
      { tz: 'Australia/Melbourne', label: 'AEST/AEDT (Melbourne)' },
      { tz: 'Australia/Brisbane', label: 'AEST — no DST (Brisbane)' },
      { tz: 'Australia/Perth', label: 'AWST (Perth)' },
      { tz: 'Pacific/Auckland', label: 'NZST/NZDT (Auckland)' },
    ],
  },
  {
    region: 'Europe',
    values: [
      { tz: 'Europe/London', label: 'GMT/BST (London)' },
      { tz: 'Europe/Dublin', label: 'GMT/IST (Dublin)' },
      { tz: 'Europe/Paris', label: 'CET/CEST (Paris)' },
      { tz: 'Europe/Berlin', label: 'CET/CEST (Berlin)' },
      { tz: 'Europe/Madrid', label: 'CET/CEST (Madrid)' },
      { tz: 'Europe/Stockholm', label: 'CET/CEST (Stockholm)' },
    ],
  },
  {
    region: 'Asia',
    values: [
      { tz: 'Asia/Tokyo', label: 'JST (Tokyo)' },
      { tz: 'Asia/Singapore', label: 'SGT (Singapore)' },
      { tz: 'Asia/Hong_Kong', label: 'HKT (Hong Kong)' },
      { tz: 'Asia/Dubai', label: 'GST (Dubai)' },
      { tz: 'Asia/Kolkata', label: 'IST (Kolkata)' },
    ],
  },
];

/**
 * Membership lookup. Useful for rendering a dropdown vs. switching to the
 * "Custom…" text input when the current value isn't in the curated set.
 */
export function isInTimezoneGroups(
  tz: string,
  groups: SchedulingTimezoneGroup[],
): boolean {
  for (const g of groups) {
    for (const v of g.values) if (v.tz === tz) return true;
  }
  return false;
}

/**
 * Detect the browser's IANA timezone name. Returns null in non-browser
 * environments (SSR, tests) or when the platform doesn't expose
 * Intl.DateTimeFormat().resolvedOptions().
 */
export function detectBrowserTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || null;
  } catch {
    return null;
  }
}
