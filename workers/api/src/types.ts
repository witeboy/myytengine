// Shared types for the myytengine Worker API.
// Ported functions receive `Ctx` and never touch `Request`/`Response` directly.

import type { Db } from './db/client';
import type { KeyResolver } from './lib/vault';

export interface Env {
  // Bindings (wrangler.toml)
  DB: D1Database;
  MEDIA: R2Bucket;          // user-facing assets: images, audio, video, thumbnails
  COLD: R2Bucket;           // oversized JSON columns offloaded from D1
  AI: Ai;                   // Workers AI (Whisper ASR fallback)

  // Secrets (wrangler secret put ...)
  KEYVAULT_MASTER_KEY: string;   // base64, 32 bytes — encrypts the BYOK vault

  // Vars
  // 'aggregator' (default) = CheaperInference · 'gateway' = Cloudflare AI Gateway.
  // See lib/ai.ts. Only 'gateway' supports Gemini video understanding.
  AI_PROVIDER_MODE?: 'aggregator' | 'gateway';
  AI_AGGREGATOR_BASE_URL?: string;

  CF_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
  // Media storage. 'bunny' (default) or 'r2'. See lib/storage.ts — retention is tiered:
  // ephemeral/ is swept after ~48h, durable/ never is, and R2 cold storage is separate.
  MEDIA_BACKEND?: 'bunny' | 'r2';
  BUNNY_STORAGE_ZONE?: string;
  BUNNY_STORAGE_REGION?: string;
  BUNNY_CDN_URL?: string;
  BUNNY_STORAGE_PASSWORD?: string;   // SECRET — server side only, never sent to a client
  /** "true" enables deletion of media for ARCHIVED projects. Default off — this
   *  removes user-generated work, so it must be switched on deliberately. */
  ARCHIVE_SWEEP_ENABLED?: string;

  // ── self-hosted auth (see routes/auth.ts) ──────────────────────────────────
  /** Public origin of the SPA, e.g. https://myytengine.rcinc.app. The Worker sits
   *  behind a Vercel rewrite, so the request URL cannot supply this. */
  APP_ORIGIN?: string;
  /** Neon Postgres connection string — AUTH TABLES ONLY. Secret. */
  AUTH_DATABASE_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;   // SECRET
  /** Comma-separated addresses promoted to role 'admin' on sign-in. */
  ADMIN_EMAILS?: string;
  /** Email sign-in fallback. Cloudflare Email Sending is tried first, then Resend.
   *  Without one of these, only Google sign-in is available. */
  CLOUDFLARE_EMAIL_API_TOKEN?: string;  // SECRET
  RESEND_API_KEY?: string;              // SECRET
  MAIL_FROM?: string;

  MEDIA_PUBLIC_BASE: string;     // R2 backend only (no trailing slash)
  ALLOWED_ORIGINS: string;       // comma-separated exact origins
  NEON_AUTH_JWKS_URL: string;
  NEON_AUTH_ISSUER: string;
  NEON_AUTH_AUDIENCE: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
}

/**
 * Everything a ported function needs. Auth is already enforced before this is built,
 * so `user` is always present — the old `if (!user) return 401` guard is gone.
 */
export interface Ctx {
  env: Env;
  user: User;
  db: Db;
  keys: KeyResolver;
  waitUntil(p: Promise<unknown>): void;
}

/** A ported the original platform function. Return value is wrapped by the router as `{ data }`. */
export type FnHandler = (body: any, ctx: Ctx) => Promise<unknown>;
