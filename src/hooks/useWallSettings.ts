import { useCallback, useEffect, useState } from 'react';

export interface UseWallSettingsOptions {
  /**
   * GET/POST endpoint for the per-site wall settings. Defaults to
   * '/api/admin/wall-settings'. The endpoint is hosted centrally by BFFless
   * and forwarded to your project automatically once your alias references
   * the wall-generation rule set.
   */
  endpoint?: string;
  /**
   * When true, the setter is callable. The endpoint itself enforces ownership
   * via auth — this flag is just a UI guard so a non-admin doesn't see the
   * "save" button at all.
   */
  isAdmin?: boolean;
}

export interface UseWallSettingsResult {
  /**
   * Latest known value of the site's AI photobooth flag. Defaults to `false`
   * until the GET resolves. Treat the wall as AI-off until `loaded` is true.
   */
  wallAiEnabled: boolean;
  /** True once the initial GET completes (success or failure). */
  loaded: boolean;
  /** True while a save is in flight. */
  saving: boolean;
  /** Owner-only setter — POSTs and reflects the new value locally on success. */
  setWallAiEnabled: (enabled: boolean) => Promise<void>;
  /** Manual refetch. */
  refresh: () => Promise<void>;
}

/**
 * Reads (and optionally writes) the per-site Wall feature settings stored on
 * the central `parents_sites` row keyed by the calling site's repo. Public
 * GET so the wall page can read it on every load; POST is owner-only via
 * `auth_required` + ownership guard on the central rule.
 *
 * Pair with `useWallToken({ enabled: settings.wallAiEnabled, ... })` to gate
 * the URL token capture and AI scene generation on the runtime flag.
 */
export function useWallSettings(opts?: UseWallSettingsOptions): UseWallSettingsResult {
  const endpoint = opts?.endpoint ?? '/api/admin/wall-settings';
  const isAdmin = opts?.isAdmin ?? false;

  const [wallAiEnabled, setWallAiEnabledState] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return;
      const data: { wallAiEnabled?: boolean } = await res.json();
      setWallAiEnabledState(!!data.wallAiEnabled);
    } catch {
      /* silent — keep last known value */
    }
  }, [endpoint]);

  useEffect(() => {
    let cancelled = false;
    fetch(endpoint, { credentials: 'include', cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { wallAiEnabled?: boolean } | null) => {
        if (cancelled) return;
        if (data) setWallAiEnabledState(!!data.wallAiEnabled);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const setWallAiEnabled = useCallback(
    async (enabled: boolean) => {
      if (!isAdmin) return;
      setSaving(true);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ wallAiEnabled: enabled }),
        });
        if (res.ok) {
          const data: { wallAiEnabled?: boolean } = await res.json();
          setWallAiEnabledState(!!data.wallAiEnabled);
        }
      } finally {
        setSaving(false);
      }
    },
    [endpoint, isAdmin],
  );

  return { wallAiEnabled, loaded, saving, setWallAiEnabled, refresh };
}
