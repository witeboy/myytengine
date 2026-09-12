// Neon Postgres access for the auth tables.
//
// The rest of the app lives in D1; Postgres holds identity only, which is the
// same split every other rcinc.app app uses and keeps the "Neon is AUTH ONLY"
// rule from the migration plan intact.
//
// `neon()` speaks Postgres over HTTP, so it works inside a Worker with no TCP
// socket and no connection pool to manage. One round trip per statement, which
// is the right shape for auth: a handful of small queries per request.

import { neon } from '@neondatabase/serverless';
import type { Env } from '../types';

export type Sql = ReturnType<typeof neon>;

let cached: { url: string; sql: Sql } | null = null;

/**
 * Accepts the forms a connection string actually arrives in.
 *
 * The Neon console offers both a bare URL and a ready-to-run `psql '…'`
 * command, and a value pasted into a terminal prompt often keeps its quotes or
 * a trailing newline. `neon()` rejects all of those with the same unhelpful
 * message, so normalise here rather than making setup a guessing game.
 */
export function normalizeConnectionString(raw: string): string {
  let value = String(raw).trim();
  value = value.replace(/^psql\s+/i, '').trim();
  value = value.replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
  // postgres:// and postgresql:// are the same scheme; the driver only takes the latter.
  if (value.startsWith('postgres://')) {
    value = `postgresql://${value.slice('postgres://'.length)}`;
  }
  return value;
}

/** Describes a malformed value without echoing the credential itself. */
function shapeOf(value: string): string {
  const scheme = value.split('://')[0] || '(none)';
  let host = '(unparseable)';
  try {
    host = new URL(value).host || '(empty)';
  } catch {
    /* leave as unparseable */
  }
  return `scheme "${scheme}", host "${host}", length ${value.length}`;
}

/**
 * Tagged-template query function bound to this deployment's auth database.
 * Values interpolated into the template are sent as bind parameters, never
 * concatenated into the statement.
 */
export function db(env: Env): Sql {
  if (!env.AUTH_DATABASE_URL) {
    throw new Error('AUTH_DATABASE_URL is not configured — set it with `wrangler secret put`.');
  }
  const url = normalizeConnectionString(env.AUTH_DATABASE_URL);

  if (!/^postgresql:\/\/[^:@/]+:[^@]*@[^/]+\/.+/.test(url)) {
    throw new Error(
      'AUTH_DATABASE_URL is not a Postgres connection string. Expected ' +
        'postgresql://user:password@host/dbname — got ' +
        shapeOf(url) +
        '. The Neon console gives this under Connect; the auth service URL (…neonauth…) is a different value.',
    );
  }
  // Workers reuse an isolate across requests; rebuilding the client per request
  // would discard its keep-alive state for no benefit.
  if (!cached || cached.url !== url) cached = { url, sql: neon(url) };
  return cached.sql;
}

/** First row of a result set, or null. Mirrors `one()` in the other apps. */
export function one<T = Record<string, any>>(rows: unknown): T | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0] as T;
}
