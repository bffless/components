import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { generateToken, sanitizeTokenInput } from '../lib/token';

export interface UseWallTokenOptions {
  /** Endpoint for GET/POST owner-token operations. Defaults to '/api/admin/wall-scene-token'. */
  adminEndpoint?: string;
  /** Set true after admin role is confirmed; gates the GET fetch. */
  isAdmin?: boolean;
  /** URL search-param key carrying the token. Defaults to 't'. */
  paramKey?: string;
  /**
   * Site-level AI photobooth switch. Defaults to `'token'` (legacy behaviour:
   * `aiEnabled` flips true when the URL carries `?t=<token>`). Pass `'off'` for
   * sites that don't want the AI scene flow at all — URL token capture is
   * skipped and `aiEnabled` stays false even if a token sneaks into the URL.
   * The admin token panel still renders for `isAdmin` users in either mode so
   * an owner can pre-configure a token before flipping AI on later.
   */
  aiMode?: 'token' | 'off';
  /**
   * Runtime override for the AI photobooth switch — typically wired to
   * `useWallSettings().wallAiEnabled`. When `false`, behaves exactly like
   * `aiMode: 'off'` (URL token capture skipped, `aiEnabled` forced false).
   * When `true` or omitted, the static `aiMode` controls behaviour. Lets a
   * site flip AI on/off at runtime via the admin checkbox without a redeploy.
   */
  enabled?: boolean;
}

export interface WallTokenAdmin {
  currentToken: string;
  input: string;
  setInput: (v: string) => void;
  generate: (len?: number) => void;
  save: () => Promise<void>;
  saving: boolean;
  loaded: boolean;
  shareUrl: string;
  qrCanvasRef: RefObject<HTMLCanvasElement | null>;
  downloadQR: () => void;
  clear: () => void;
}

export interface UseWallTokenResult {
  /** True iff the URL carried a token at mount; AI scene generation should be enabled. */
  aiEnabled: boolean;
  /** Live token value, in-memory only, captured once at mount. */
  tokenRef: RefObject<string | null>;
  /** Owner-only admin panel state. Always returned, but `loaded` stays false until an admin GET completes. */
  admin: WallTokenAdmin;
}

/**
 * Captures a one-shot wall-access token from the URL (`?t=<token>`) on mount and
 * strips it from the address bar via `history.replaceState`. Held in-memory only —
 * never persisted in localStorage / sessionStorage.
 *
 * When `isAdmin` is true, also fetches and exposes the admin token panel state
 * (current token, editable input, generate/save handlers, QR canvas ref + download).
 */
export function useWallToken(opts?: UseWallTokenOptions): UseWallTokenResult {
  const adminEndpoint = opts?.adminEndpoint ?? '/api/admin/wall-scene-token';
  const isAdmin = opts?.isAdmin ?? false;
  const paramKey = opts?.paramKey ?? 't';
  const aiMode = opts?.aiMode ?? 'token';
  const runtimeEnabled = opts?.enabled;
  // The runtime flag short-circuits the static one. Either knob can force
  // AI off: `enabled === false` (runtime, e.g. owner unchecked the box) or
  // `aiMode === 'off'` (static, hardcoded by the site author).
  const aiOff = runtimeEnabled === false || aiMode === 'off';

  const tokenRef = useRef<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [aiEnabled, setAiEnabled] = useState(false);

  const [currentToken, setCurrentToken] = useState('');
  const [input, setInput] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  // Capture URL token once when AI is on and strip it from the address bar.
  // Skipped when aiOff — the site has opted out of the AI photobooth flow, so
  // a stray ?t= param in the URL must not flip aiEnabled or be retained.
  // Note: if the runtime flag flips on AFTER mount (owner ticks the checkbox
  // post-load) the URL token has already been replaceState'd away on initial
  // capture, so guests need a refresh to get a fresh photobooth session —
  // intentional, since the toggle is a rare admin action.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (aiOff) {
      tokenRef.current = null;
      setAiEnabled(false);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const t = params.get(paramKey);
    if (t) {
      tokenRef.current = t.trim();
      setAiEnabled(true);
      params.delete(paramKey);
      const qs = params.toString();
      const newUrl =
        window.location.pathname +
        (qs ? '?' + qs : '') +
        window.location.hash;
      window.history.replaceState(null, '', newUrl);
    }
  }, [paramKey, aiOff]);

  // Fetch the persisted token for the admin panel, once we know the user is admin.
  useEffect(() => {
    if (!isAdmin || typeof window === 'undefined') return;
    let cancelled = false;
    fetch(adminEndpoint, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : { token: '' }))
      .then((data: { token?: string }) => {
        if (cancelled) return;
        const t = (data.token as string) || '';
        setCurrentToken(t);
        setInput(t || generateToken(6));
        setShareUrl(window.location.origin + window.location.pathname);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, adminEndpoint]);

  const setInputSafe = useCallback((v: string) => {
    setInput(sanitizeTokenInput(v));
  }, []);

  const generate = useCallback((len = 6) => {
    setInput(generateToken(len));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(adminEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: input }),
      });
      if (res.ok) {
        const data: { token?: string } = await res.json();
        setCurrentToken(data.token || '');
      }
    } finally {
      setSaving(false);
    }
  }, [adminEndpoint, input]);

  const downloadQR = useCallback(() => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !currentToken) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `wall-qr-${currentToken}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [currentToken]);

  const clear = useCallback(() => {
    setInput('');
  }, []);

  return {
    aiEnabled,
    tokenRef,
    admin: {
      currentToken,
      input,
      setInput: setInputSafe,
      generate,
      save,
      saving,
      loaded,
      shareUrl,
      qrCanvasRef,
      downloadQR,
      clear,
    },
  };
}
