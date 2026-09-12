import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearSessionCookie,
  hashToken,
  publicUser,
  randomToken,
  readCookie,
  rememberCookie,
  sessionCookie,
  SESSION_COOKIE,
} from '../src/lib/session';
import { handleAuth } from '../src/routes/auth';
import type { Env } from '../src/types';

const env = (over: Partial<Env> = {}): Env =>
  ({
    APP_ORIGIN: 'https://myytengine.rcinc.app',
    AUTH_DATABASE_URL: 'postgres://user:pw@example.neon.tech/neondb',
    GOOGLE_CLIENT_ID: '326814117883-test.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    ...over,
  }) as Env;

const CORS = { 'Access-Control-Allow-Origin': 'https://myytengine.rcinc.app' };
const request = (url: string, init?: RequestInit) => new Request(url, init);

// The routes talk to Postgres through lib/pg; stub it so these stay unit tests.
const statements: string[] = [];
vi.mock('../src/lib/pg', () => ({
  db: () => {
    const sql = (strings: TemplateStringsArray) => {
      statements.push(strings.join('?').replace(/\s+/g, ' ').trim());
      return Promise.resolve([]);
    };
    return sql;
  },
  one: (rows: unknown) => (Array.isArray(rows) && rows.length ? rows[0] : null),
}));

afterEach(() => {
  statements.length = 0;
  vi.unstubAllGlobals();
});

describe('session primitives', () => {
  it('hashes tokens deterministically and never stores the token itself', async () => {
    const token = randomToken(32);
    expect(token).not.toMatch(/[+/=]/); // base64url
    expect(await hashToken(token)).toBe(await hashToken(token));
    expect(await hashToken(token)).toHaveLength(64);
    expect(await hashToken(token)).not.toContain(token);
    expect(randomToken(32)).not.toBe(randomToken(32));
  });

  it('issues an httpOnly, Lax, Secure session cookie and clears it with Max-Age=0', () => {
    const set = sessionCookie('abc123');
    expect(set).toContain(`${SESSION_COOKIE}=abc123`);
    expect(set).toContain('HttpOnly');
    expect(set).toContain('SameSite=Lax');
    expect(set).toContain('Secure');
    expect(set).toContain('Max-Age=2592000');
    // Host-only: no Domain attribute, so the cookie cannot leak to sibling apps.
    expect(set).not.toContain('Domain=');

    expect(clearSessionCookie()).toContain('Max-Age=0');
  });

  it('keeps the remembered-email hint readable by the page but not a credential', () => {
    const set = rememberCookie('person@example.com');
    expect(set).not.toContain('HttpOnly');
    expect(set).toContain('person%40example.com');
  });

  it('reads one cookie out of a header without matching prefixes', () => {
    const req = request('https://x.test', {
      headers: { cookie: `other=1; ${SESSION_COOKIE}_x=wrong; ${SESSION_COOKIE}=right` },
    });
    expect(readCookie(req, SESSION_COOKIE)).toBe('right');
    expect(readCookie(req, 'absent')).toBeNull();
  });

  it('exposes name and is_admin without inventing them', () => {
    expect(publicUser({ email: 'a@b.c', full_name: null, role: 'user' })).toMatchObject({
      name: 'a@b.c',
      is_admin: false,
    });
    expect(publicUser({ email: 'a@b.c', full_name: 'Ada', role: 'admin' })).toMatchObject({
      name: 'Ada',
      is_admin: true,
    });
    expect(publicUser(null)).toBeNull();
  });
});

describe('sign-in start', () => {
  it('redirects to Google with PKCE and the registered redirect_uri', async () => {
    const res = await handleAuth(
      request('https://api.test/api/auth/login?provider=google'),
      env(),
      '/api/auth/login',
      CORS,
    );
    expect(res.status).toBe(302);

    const target = new URL(res.headers.get('location')!);
    expect(target.host).toBe('accounts.google.com');
    expect(target.searchParams.get('client_id')).toBe(env().GOOGLE_CLIENT_ID);
    // Must match the URI registered on the RC Inc web apps client exactly.
    expect(target.searchParams.get('redirect_uri')).toBe(
      'https://myytengine.rcinc.app/api/auth/callback/google',
    );
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    expect(target.searchParams.get('code_challenge')).toBeTruthy();
    expect(target.searchParams.get('state')).toBeTruthy();
    // The verifier is held server-side, never sent to Google.
    expect(target.search).not.toContain('code_verifier');
  });

  it('refuses when Google credentials are absent rather than redirecting nowhere', async () => {
    await expect(
      handleAuth(
        request('https://api.test/api/auth/login'),
        env({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined }),
        '/api/auth/login',
        CORS,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuses an unknown provider', async () => {
    await expect(
      handleAuth(request('https://api.test/api/auth/login?provider=github'), env(), '/api/auth/login', CORS),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('OAuth callback', () => {
  it('rejects a callback with no code or state', async () => {
    await expect(
      handleAuth(request('https://api.test/api/auth/callback/google'), env(), '/api/auth/callback/google', CORS),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an unknown provider callback', async () => {
    await expect(
      handleAuth(request('https://api.test/api/auth/callback/github'), env(), '/api/auth/callback/github', CORS),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('sends a Google-reported error back to the sign-in page, not to a blank 500', async () => {
    const res = await handleAuth(
      request('https://api.test/api/auth/callback/google?error=access_denied'),
      env(),
      '/api/auth/callback/google',
      CORS,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'https://myytengine.rcinc.app/handler/sign-in?error=access_denied',
    );
  });

  it('rejects a state that was never issued', async () => {
    await expect(
      handleAuth(
        request('https://api.test/api/auth/callback/google?code=x&state=forged'),
        env(),
        '/api/auth/callback/google',
        CORS,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('session endpoints', () => {
  it('reports an anonymous caller as null rather than erroring', async () => {
    const res = await handleAuth(request('https://api.test/api/auth/me'), env(), '/api/auth/me', CORS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: null });
  });

  it('clears the cookie on logout and revokes the row', async () => {
    const res = await handleAuth(
      request('https://api.test/api/auth/logout', {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE}=live-token` },
      }),
      env(),
      '/api/auth/logout',
      CORS,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(statements.join(' ')).toContain('UPDATE sessions SET revoked_at');
  });

  it('404s an unknown auth route', async () => {
    await expect(
      handleAuth(request('https://api.test/api/auth/nope'), env(), '/api/auth/nope', CORS),
    ).rejects.toMatchObject({ status: 404 });
  });
});
