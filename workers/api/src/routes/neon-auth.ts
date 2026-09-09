import type { Env } from '../types';

const JWKS_SUFFIX = '/.well-known/jwks.json';

function authBaseUrl(env: Env): string {
  if (!env.NEON_AUTH_JWKS_URL.endsWith(JWKS_SUFFIX)) {
    throw new Error('NEON_AUTH_JWKS_URL does not contain the expected JWKS suffix');
  }
  return env.NEON_AUTH_JWKS_URL.slice(0, -JWKS_SUFFIX.length);
}

function withoutUpstreamDomain(cookie: string): string {
  // The browser reaches this response through the SPA origin. A Neon host Domain
  // attribute would make the first-party proxy cookie invalid, so keep it host-only.
  return cookie.replace(/;\s*Domain=[^;]+/gi, '');
}

/**
 * Same-origin relay for Managed Better Auth.
 *
 * Vercel rewrites `/api/auth/*` here. This Worker then performs the only external
 * hop with Neon's real hostname, avoiding third-party browser cookies and Safari ITP.
 * Response bodies remain streamed; session cookies are never read by application code.
 */
export async function proxyNeonAuth(req: Request, env: Env): Promise<Response> {
  const requestUrl = new URL(req.url);
  const suffix = requestUrl.pathname.replace(/^\/api\/neon-auth\/?/, '');
  const baseUrl = authBaseUrl(env);
  const upstreamUrl = new URL(`${baseUrl}/${suffix}`);
  upstreamUrl.search = requestUrl.search;

  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(upstream.headers);
  const cookies = upstream.headers.getSetCookie();
  if (cookies.length) {
    responseHeaders.delete('set-cookie');
    for (const cookie of cookies) responseHeaders.append('set-cookie', withoutUpstreamDomain(cookie));
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

