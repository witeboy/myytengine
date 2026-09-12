-- Self-hosted auth schema — Neon Postgres (AUTH ONLY).
--
-- Ported from the pattern used by jobmatch.ai, hihealth and snapsync so all
-- rcinc.app apps share one auth model. Application data stays in D1; nothing in
-- this file is an application table, which keeps the "Neon is AUTH ONLY" rule.
--
-- Model: an opaque random session token lives in an httpOnly SameSite=Lax
-- cookie. Only its SHA-256 hash is stored, so a database leak cannot be replayed
-- as a login, and revocation is instant because there is no self-contained JWT.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  email_normalized  text GENERATED ALWAYS AS (lower(email)) STORED,
  full_name         text,
  avatar_url        text,
  role              text NOT NULL DEFAULT 'user',      -- 'user' | 'admin'
  email_verified    boolean NOT NULL DEFAULT false,
  disabled          boolean NOT NULL DEFAULT false,
  timezone          text DEFAULT 'UTC',
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_login_at     timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized ON users (email_normalized);

-- ── federated identities ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_identities (
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider      text NOT NULL,                          -- 'google'
  provider_uid  text NOT NULL,
  profile       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_uid)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities (user_id);

-- ── sessions ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_live ON sessions (expires_at) WHERE revoked_at IS NULL;

-- ── short-lived codes (OAuth state, email one-time codes, magic links) ───────

CREATE TABLE IF NOT EXISTS auth_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,                            -- 'oauth_state' | 'email_code' | 'magic_link'
  code_hash   text NOT NULL UNIQUE,
  email       text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_auth_codes_kind_email ON auth_codes (kind, email);
CREATE INDEX IF NOT EXISTS idx_auth_codes_expiry ON auth_codes (expires_at);
