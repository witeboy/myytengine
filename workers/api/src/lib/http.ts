// HTTP helpers. The response envelope here is the contract the frontend shim depends on
// (MIGRATION-PLAN.md C-1/C-2): success -> { data }, failure -> { error }.

import type { Env } from '../types';

/**
 * Throw this anywhere inside a ported function. The router turns it into
 * `{ error: message }` with the given status — exactly what the old Deno
 * `Response.json({ error }, { status })` produced.
 */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const unauthorized = (m = 'Unauthorized') => new HttpError(401, m);
export const notFound = (m = 'Not found') => new HttpError(404, m);

export function corsHeaders(req: Request, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin') || '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(body: unknown, init: ResponseInit = {}, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...extra, ...(init.headers || {}) },
  });
}

export const ok = (data: unknown, extra: HeadersInit = {}) => json({ data }, { status: 200 }, extra);

export function fail(err: unknown, extra: HeadersInit = {}) {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : String(err);
  if (status >= 500) console.error('[api]', message, err instanceof Error ? err.stack : '');
  return json({ error: message }, { status }, extra);
}

/** Fetch with timeout + one retry on 429/5xx. Used by every provider adapter. */
export async function fetchJson(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {},
): Promise<any> {
  const { timeoutMs = 60_000, retries = 1, ...rest } = init;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...rest, signal: ctl.signal });
      const text = await res.text();
      let parsed: any;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      if (!res.ok) {
        const detail =
          (parsed && (parsed.error?.message || parsed.error || parsed.message)) ||
          (typeof parsed === 'string' ? parsed.slice(0, 300) : '') ||
          res.statusText;
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          lastErr = new HttpError(res.status, `${url.split('?')[0]} -> ${res.status}: ${detail}`);
          continue;
        }
        throw new HttpError(res.status, `${url.split('?')[0]} -> ${res.status}: ${detail}`);
      }
      return parsed;
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status < 500 && e.status !== 429) throw e;
      if (attempt === retries) throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export const nowIso = () => new Date().toISOString();

/** the original platform ids were opaque strings; any collision-free id works. */
export const newId = () => crypto.randomUUID().replace(/-/g, '');
