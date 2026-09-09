import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxyNeonAuth } from '../src/routes/neon-auth';
import type { Env } from '../src/types';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Managed Better Auth same-origin relay', () => {
  it('targets the Neon hostname, streams the body, and keeps cookies host-only', async () => {
    let forwardedUrl = '';
    let forwardedHeaders = new Headers();
    const upstreamHeaders = new Headers({ 'content-type': 'application/json' });
    upstreamHeaders.append(
      'set-cookie',
      'better-auth.session_token=test; Domain=auth.example; Path=/; HttpOnly; Secure; SameSite=Lax',
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        forwardedUrl = String(input);
        forwardedHeaders = new Headers(init?.headers);
        return new Response('{"ok":true}', { status: 200, headers: upstreamHeaders });
      }),
    );

    const env = {
      NEON_AUTH_JWKS_URL: 'https://auth.example/neondb/auth/.well-known/jwks.json',
    } as Env;
    const req = new Request('https://worker.example/api/neon-auth/sign-in/email?source=phase3', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': 'myytengine.vercel.app',
      },
      body: '{}',
    });

    const response = await proxyNeonAuth(req, env);

    expect(forwardedUrl).toBe('https://auth.example/neondb/auth/sign-in/email?source=phase3');
    expect(forwardedHeaders.has('host')).toBe(false);
    expect(forwardedHeaders.has('x-forwarded-host')).toBe(false);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.getSetCookie()).toEqual([
      'better-auth.session_token=test; Path=/; HttpOnly; Secure; SameSite=Lax',
    ]);
  });
});

