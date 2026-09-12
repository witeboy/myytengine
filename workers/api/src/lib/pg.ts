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
 * Tagged-template query function bound to this deployment's auth database.
 * Values interpolated into the template are sent as bind parameters, never
 * concatenated into the statement.
 */
export function db(env: Env): Sql {
  const url = env.AUTH_DATABASE_URL;
  if (!url) {
    throw new Error('AUTH_DATABASE_URL is not configured — set it with `wrangler secret put`.');
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
