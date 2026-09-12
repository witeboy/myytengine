// Session auth, ported from the pattern shared by jobmatch.ai, hihealth and
// snapsync so every rcinc.app app authenticates the same way.
//
// Model: an opaque random session token in an httpOnly, SameSite=Lax cookie.
// The token itself is never stored — only its SHA-256 hash — so a database leak
// cannot be replayed as a login. No JWT, because revocation has to be instant.
//
// Differences from the Node original, all forced by the Worker runtime:
//   • `crypto.randomBytes`/`createHash` become Web Crypto, so hashing is async.
//   • Cookies are returned as strings for the caller to append to a `Headers`,
//     rather than written onto a mutable `res`.

import { db, one } from './pg';
import type { Env } from '../types';

export const SESSION_COOKIE = 'myyt_session';

/** Not httpOnly: the sign-in page reads it to greet a returning visitor. It is
 *  a hint about the device, never a credential. */
export const REMEMBER_COOKIE = 'myyt_last_email';

const SESSION_TTL_DAYS = 30;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 86400;

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  name: string;
  is_admin: boolean;
  [key: string]: unknown;
}

// ── token helpers ────────────────────────────────────────────────────────────

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── cookies ──────────────────────────────────────────────────────────────────

function cookie(name: string, value: string, maxAge: number, httpOnly: boolean): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    httpOnly ? 'HttpOnly' : '',
    // Lax, not Strict: the Google callback is a top-level cross-site redirect
    // back to us and must be allowed to carry the cookie it just set.
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    'Secure',
  ];
  return parts.filter(Boolean).join('; ');
}

export const sessionCookie = (token: string) => cookie(SESSION_COOKIE, token, SESSION_TTL_SECONDS, true);
export const clearSessionCookie = () => cookie(SESSION_COOKIE, '', 0, true);
export const rememberCookie = (email: string) =>
  cookie(REMEMBER_COOKIE, encodeURIComponent(email), 180 * 86400, false);

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

// ── sessions ─────────────────────────────────────────────────────────────────

function sessionTokenFrom(req: Request): string | null {
  const fromCookie = readCookie(req, SESSION_COOKIE);
  if (fromCookie) return fromCookie;

  // Bearer support for non-browser callers (scripts, health probes), matching
  // the other apps. Browsers always use the cookie.
  const header = req.headers.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return null;
}

/** Creates a session row and returns the cookie to set. */
export async function startSession(env: Env, req: Request, userId: string): Promise<string> {
  const sql = db(env);
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const agent = (req.headers.get('user-agent') || '').slice(0, 400);
  const ip = req.headers.get('cf-connecting-ip') || null;

  await sql`
    INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
    VALUES (${userId}, ${await hashToken(token)}, ${agent}, ${ip}, ${expiresAt})
  `;
  await sql`UPDATE users SET last_login_at = now() WHERE id = ${userId}`;

  return sessionCookie(token);
}

/** Revokes the caller's session. Returns the cookie that clears it. */
export async function endSession(env: Env, req: Request): Promise<string> {
  const token = sessionTokenFrom(req);
  if (token) {
    const sql = db(env);
    await sql`UPDATE sessions SET revoked_at = now() WHERE token_hash = ${await hashToken(token)}`;
  }
  return clearSessionCookie();
}

/** Resolves the signed-in user, or null. Never throws for anonymous callers. */
export async function currentUser(env: Env, req: Request): Promise<AuthUser | null> {
  const token = sessionTokenFrom(req);
  if (!token) return null;

  const sql = db(env);
  const row = one(await sql`
    SELECT u.*
      FROM sessions s
      JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ${await hashToken(token)}
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND u.disabled = false
     LIMIT 1
  `);

  return publicUser(row);
}

/** The single place to strip anything that must not reach a client. */
export function publicUser(row: Record<string, any> | null): AuthUser | null {
  if (!row) return null;
  return {
    ...row,
    name: row.full_name || row.email,
    is_admin: row.role === 'admin',
  } as AuthUser;
}

// ── user provisioning ────────────────────────────────────────────────────────

function adminEmails(env: Env): string[] {
  return String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Finds or creates the user for a verified email address and links the
 * federated identity. Email is the identity key, so signing in with Google and
 * with a one-time code to the same address lands on one account.
 */
export async function upsertUser(
  env: Env,
  input: { email: string; fullName?: string | null; avatarUrl?: string | null; provider?: string; providerUid?: string },
): Promise<AuthUser> {
  const sql = db(env);
  const normalized = String(input.email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new Error('A valid email address is required to create an account.');
  }

  const role = adminEmails(env).includes(normalized) ? 'admin' : 'user';
  const fullName = input.fullName || null;
  const avatarUrl = input.avatarUrl || null;

  let user = one(await sql`SELECT * FROM users WHERE email_normalized = ${normalized} LIMIT 1`);

  if (!user) {
    user = one(await sql`
      INSERT INTO users (email, full_name, avatar_url, role, email_verified, created_by)
      VALUES (${input.email}, ${fullName}, ${avatarUrl}, ${role}, true, ${normalized})
      RETURNING *
    `);
  } else {
    user = one(await sql`
      UPDATE users
         SET full_name      = COALESCE(${fullName}, full_name),
             avatar_url     = COALESCE(${avatarUrl}, avatar_url),
             email_verified = true,
             updated_at     = now(),
             role           = CASE WHEN ${role} = 'admin' THEN 'admin' ELSE role END
       WHERE id = ${user.id}
       RETURNING *
    `);
  }

  if (input.provider && input.providerUid) {
    await sql`
      INSERT INTO user_identities (user_id, provider, provider_uid, profile)
      VALUES (${user!.id}, ${input.provider}, ${String(input.providerUid)},
              ${JSON.stringify({ email: input.email, fullName, avatarUrl })}::jsonb)
      ON CONFLICT (provider, provider_uid) DO UPDATE SET profile = EXCLUDED.profile
    `;
  }

  return publicUser(user)!;
}

// ── short-lived codes ────────────────────────────────────────────────────────

/** Issues a single-use code and returns the plaintext to hand out. */
export async function issueCode(
  env: Env,
  input: { kind: string; email?: string | null; payload?: Record<string, unknown>; ttlSeconds?: number },
): Promise<string> {
  const sql = db(env);
  const code = randomToken(32);
  const expiresAt = new Date(Date.now() + (input.ttlSeconds ?? 600) * 1000).toISOString();

  await sql`
    INSERT INTO auth_codes (kind, code_hash, email, payload, expires_at)
    VALUES (${input.kind}, ${await hashToken(code)}, ${input.email ?? null},
            ${JSON.stringify(input.payload || {})}::jsonb, ${expiresAt})
  `;
  return code;
}

/** Consumes a code exactly once. Returns its row, or null when invalid. */
export async function consumeCode(
  env: Env,
  kind: string,
  code: string | null,
): Promise<{ email: string | null; payload: Record<string, any> } | null> {
  if (!code) return null;
  const sql = db(env);

  // The UPDATE ... RETURNING is the guard: only the first caller to flip
  // consumed_at gets a row back, so a replayed code is inert.
  const row = one(await sql`
    UPDATE auth_codes
       SET consumed_at = now()
     WHERE code_hash = ${await hashToken(code)}
       AND kind = ${kind}
       AND consumed_at IS NULL
       AND expires_at > now()
     RETURNING email, payload
  `);

  return row ? { email: row.email, payload: row.payload || {} } : null;
}
