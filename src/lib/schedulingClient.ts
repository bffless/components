// Same hostname rules as resolveAuthBasePath (per
// feedback_authdialog_basepath.md): bffless.app subdomains use the workspace
// /api/* namespace, custom domains use the /_bffless/* relay namespace.
export function resolveSchedulingBasePath(hostnameOverride?: string): string {
  let hostname = hostnameOverride;
  if (hostname == null) {
    if (typeof window === 'undefined' || !window.location) {
      return '/api/scheduling';
    }
    hostname = window.location.hostname;
  }
  const lower = hostname.toLowerCase();
  if (lower === 'bffless.app' || lower.endsWith('.bffless.app')) {
    return '/api/scheduling';
  }
  return '/_bffless/scheduling';
}

export class SchedulingClientError extends Error {
  readonly code: string;
  readonly status: number | undefined;
  readonly body: unknown;

  constructor(code: string, message: string, status?: number, body?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.body = body;
    this.name = 'SchedulingClientError';
  }
}

const HEADERS_JSON = { 'Content-Type': 'application/json' } as const;

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  // Some admin reads (notably GET /admin/google/calendars) treat a 401 as
  // "not connected" and the caller wants a structured outcome rather than
  // an error. The default throws on any non-2xx.
  treat401AsEmpty?: boolean;
  // Same idea, but for endpoints that may not exist as per-site pipelines
  // (e.g. when Google Calendar is managed in CE Settings only). 404 then
  // means "not configured here," not an error.
  treat404AsEmpty?: boolean;
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'include',
      headers: body ? HEADERS_JSON : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    throw new SchedulingClientError('network', 'Network error. Please try again.');
  }

  if (res.status === 401 && opts.treat401AsEmpty) {
    return null as T;
  }
  if (res.status === 404 && opts.treat404AsEmpty) {
    return null as T;
  }

  const data = await readJson(res);
  if (!res.ok) {
    const code =
      (data && typeof data.code === 'string' && data.code) ||
      (res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : 'http_error');
    const message =
      (data && typeof data.message === 'string' && data.message) ||
      `Request failed (${res.status})`;
    throw new SchedulingClientError(code, message, res.status, data);
  }

  // 204 / empty body → null. Callers that expect a value type should pick
  // endpoints that return one.
  return (data ?? null) as T;
}

export function schedulingGet<T>(
  basePath: string,
  path: string,
  query?: Record<string, string | number | undefined | null>,
  opts: RequestOptions = {},
): Promise<T> {
  const url = buildUrl(basePath, path, query);
  return request<T>('GET', url, undefined, opts);
}

export function schedulingPost<T>(
  basePath: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  return request<T>('POST', basePath + path, body, opts);
}

export function schedulingPatch<T>(
  basePath: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  return request<T>('PATCH', basePath + path, body, opts);
}

export function schedulingDelete<T>(
  basePath: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  return request<T>('DELETE', basePath + path, undefined, opts);
}

function buildUrl(
  basePath: string,
  path: string,
  query?: Record<string, string | number | undefined | null>,
): string {
  if (!query) return basePath + path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return basePath + path + (qs ? `?${qs}` : '');
}
