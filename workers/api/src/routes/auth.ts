// Self-hosted auth endpoints, ported from the `api/auth.js` used by jobmatch.ai,
// hihealth and snapsync.
//
//   GET  /api/auth/me               current user, or null
//   GET  /api/auth/login            start sign-in (?provider=google)
//   GET  /api/auth/callback/google  OAuth return
//   POST /api/auth/logout           revoke the session
//
// Google is called directly — authorization code plus PKCE — so the consent
// screen carries the RC Inc branding from your own OAuth client rather than a
// hosted provider's.
//
// The public origin comes from APP_ORIGIN rather than the request URL: this
// Worker sits behind a Vercel rewrite, so `req.url` is the workers.dev host and
// would produce a redirect_uri Google has never seen.

import { badRequest, HttpError } from '../lib/http';
import { mailConfigured, sendEmail, signInCodeEmail } from '../lib/mailer';
import {
  consumeCode,
  consumeEmailCode,
  currentUser,
  endSession,
  issueCode,
  issueEmailCode,
  rememberCookie,
  startSession,
  upsertUser,
} from '../lib/session';
import type { Env } from '../types';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

const googleConfigured = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

function appOrigin(env: Env): string {
  const origin = (env.APP_ORIGIN || '').replace(/\/$/, '');
  if (!origin) throw new HttpError(500, 'APP_ORIGIN is not configured.');
  return origin;
}

const redirectUri = (env: Env) => `${appOrigin(env)}/api/auth/callback/google`;

/** Only ever redirect within our own origin — never to a caller-supplied host. */
function safeRedirect(target: string | null, origin: string): string {
  if (!target) return origin;
  try {
    const url = new URL(target, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

const json = (body: unknown, cors: Record<string, string>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });

function seeOther(location: string, cors: Record<string, string>, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, ...cors });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 302, headers });
}

export async function handleAuth(
  req: Request,
  env: Env,
  path: string,
  cors: Record<string, string>,
): Promise<Response> {
  const url = new URL(req.url);
  const origin = appOrigin(env);
  const action = path.replace(/^\/api\/auth\/?/, '').split('/');
  const route = action[0] || 'me';

  // ── current user ──────────────────────────────────────────────────────────
  if (route === 'me') {
    return json({ data: await currentUser(env, req) }, cors);
  }

  // ── start sign-in ─────────────────────────────────────────────────────────
  if (route === 'login') {
    const provider = url.searchParams.get('provider') || 'google';
    const redirectTo = safeRedirect(url.searchParams.get('redirect'), origin);

    if (provider !== 'google') throw badRequest(`Unsupported sign-in provider "${provider}".`);
    if (!googleConfigured(env)) {
      throw badRequest('Google sign-in is not configured on this deployment.');
    }

    const { verifier, challenge } = await pkce();
    const state = await issueCode(env, {
      kind: 'oauth_state',
      payload: { verifier, redirectTo, provider: 'google' },
      ttlSeconds: 600,
    });

    const authUrl = new URL(GOOGLE_AUTH);
    authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID!);
    authUrl.searchParams.set('redirect_uri', redirectUri(env));
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('prompt', 'select_account');

    return seeOther(authUrl.toString(), cors);
  }

  // ── OAuth return ──────────────────────────────────────────────────────────
  if (route === 'callback') {
    if (action[1] !== 'google') throw new HttpError(404, 'Unknown OAuth callback.');

    const failed = url.searchParams.get('error');
    if (failed) {
      return seeOther(`${origin}/handler/sign-in?error=${encodeURIComponent(failed)}`, cors);
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) throw badRequest('The sign-in response was incomplete. Please try again.');

    const stateRow = await consumeCode(env, 'oauth_state', state);
    if (!stateRow) throw badRequest('This sign-in link has expired. Please start again.');

    const tokenResponse = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(env),
        grant_type: 'authorization_code',
        code_verifier: String(stateRow.payload?.verifier || ''),
      }),
    });

    if (!tokenResponse.ok) {
      const detail = (await tokenResponse.text()).slice(0, 300);
      throw new HttpError(502, `Google token exchange failed: ${detail}`);
    }

    const tokens = (await tokenResponse.json()) as { access_token?: string };
    const profileResponse = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) throw new HttpError(502, 'Could not read the Google profile.');

    const profile = (await profileResponse.json()) as {
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
      sub?: string;
    };
    if (!profile.email || profile.email_verified === false) {
      throw badRequest('Your Google account does not have a verified email address.');
    }

    const user = await upsertUser(env, {
      email: profile.email,
      fullName: profile.name,
      avatarUrl: profile.picture,
      provider: 'google',
      providerUid: profile.sub,
    });

    const session = await startSession(env, req, user.id);
    const target = safeRedirect(String(stateRow.payload?.redirectTo || '/'), origin);
    return seeOther(`${origin}${target.startsWith('/') ? target : `/${target}`}`, cors, [
      session,
      rememberCookie(user.email),
    ]);
  }

  // ── email one-time code ───────────────────────────────────────────────────
  // Two actions on one route, as in the other apps: without `code` it sends one,
  // with `code` it verifies. This is the way back in when Google is unavailable.
  if (route === 'otp') {
    if (req.method !== 'POST') throw new HttpError(405, 'POST required.');

    const body = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
      throw badRequest('Enter a valid email address.');
    }

    if (!body.code) {
      if (!mailConfigured(env)) {
        throw new HttpError(503, 'Email sign-in is not configured on this deployment.');
      }
      const code = await issueEmailCode(env, email);
      await sendEmail(env, { to: email, ...signInCodeEmail(code) });
      // Deliberately the same answer whether or not the address has an account:
      // this endpoint must not report who is registered.
      return json({ data: { success: true, sent: true } }, cors);
    }

    if (!(await consumeEmailCode(env, email, String(body.code)))) {
      throw badRequest('That code is incorrect or has expired.');
    }

    const user = await upsertUser(env, { email });
    const session = await startSession(env, req, user.id);
    const headers = new Headers({ 'Content-Type': 'application/json', ...cors });
    headers.append('Set-Cookie', session);
    headers.append('Set-Cookie', rememberCookie(user.email));
    return new Response(JSON.stringify({ data: { success: true, user } }), { status: 200, headers });
  }

  // ── sign out ──────────────────────────────────────────────────────────────
  if (route === 'logout') {
    const cleared = await endSession(env, req);
    if (req.method === 'GET') return seeOther(`${origin}/handler/sign-in`, cors, [cleared]);

    const headers = new Headers({ 'Content-Type': 'application/json', ...cors });
    headers.append('Set-Cookie', cleared);
    return new Response(JSON.stringify({ data: { success: true } }), { status: 200, headers });
  }

  throw new HttpError(404, `No auth route for ${req.method} ${path}`);
}
