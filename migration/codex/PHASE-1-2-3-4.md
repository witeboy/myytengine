# Phases 1–4 — Infrastructure, data layer, auth, transport

> Prepend `codex/00-PREAMBLE.md`.
>
> **All source files for these phases are written and provided.** Your job is to place
> them, wire the accounts, fill the `REPLACE_ME` values and prove the acceptance criteria.
> Do not rewrite the provided files; if one is wrong, report it.

---

## Phase 1 — Infrastructure skeleton

### 1.1 Place the provided Worker

Copy `migration/workers/api/` → `workers/api/`. It contains:

```
wrangler.toml  package.json  tsconfig.json  .gitignore
src/index.ts              router
src/types.ts              Env / Ctx
src/middleware/auth.ts    Neon Auth JWKS verification
src/db/schema.sql         27 tables (25 entities + UserApiKeys + UserSettings)
src/db/registry.ts        column map + cold-field list
src/db/client.ts          the base44.entities.* replacement
src/db/cold.ts            D1-hot / R2-cold offload
src/lib/http.ts           envelope, HttpError, fetchJson
src/lib/ai.ts             AI Gateway client + invokeLLM
src/lib/asr.ts            AssemblyAI / Whisper behind one interface
src/lib/vault.ts          BYOK encryption + per-request key resolver
src/lib/providers.ts      BYOK catalog (drives Settings UI + key tests)
src/routes/db.ts          /api/db/:entity/:op
src/routes/keys.ts        /api/keys/*
src/fn/registry.ts        function registry (healthCheck only, for now)
src/fn/healthCheck.ts     canary
```

### 1.2 Provision

```bash
cd workers/api && npm install

npx wrangler d1 create myytengine                    # -> database_id
npx wrangler r2 bucket create myytengine-media
npx wrangler r2 bucket create myytengine-cold
```

Create an **AI Gateway** named `myytengine` in the Cloudflare dashboard
(AI → AI Gateway). Note the gateway id and your account id.

Attach a **custom domain** to the `myytengine-media` bucket (R2 → Settings → Public
access). That hostname is `MEDIA_PUBLIC_BASE`.

Create a **Neon project**. Enable **Neon Auth** on it. Neon Auth is Stack Auth
underneath; from its config take the project id and build:
- `NEON_AUTH_JWKS_URL` = `https://api.stack-auth.com/api/v1/projects/<id>/.well-known/jwks.json`
- `NEON_AUTH_ISSUER` = `https://api.stack-auth.com/api/v1/projects/<id>`

> The Neon Postgres database itself stays empty — app data lives in D1. Neon is here
> only for identity. This is deliberate; do not migrate tables into it.

### 1.3 Fill `wrangler.toml`

Replace every `REPLACE_ME`. Then set the one secret:

```bash
openssl rand -base64 32                      # 32 bytes, base64
npx wrangler secret put KEYVAULT_MASTER_KEY  # paste it
```

⚠ **Back this value up.** Losing it makes every stored API key undecryptable and users
must re-enter them. It is the only secret in the system — provider keys are BYOK.

### 1.4 Create the schema

```bash
npm run db:init:local   # local dev
npm run db:init         # remote
```

### 1.5 Vercel

Create a Vercel project rooted at `apps/web`. Env var:
`VITE_API_BASE=https://myytengine-api.<subdomain>.workers.dev`
Add both the Vercel domain and `http://localhost:5173` to `ALLOWED_ORIGINS` in
`wrangler.toml`, then redeploy the Worker.

**Accept:** `curl https://<worker>/api/health` → `{"data":{"ok":true,…}}`, and the
deployed SPA can reach it without a CORS error.

---

## Phase 2 — Data layer

`db/client.ts`, `db/registry.ts`, `db/cold.ts`, `routes/db.ts` are provided. Place
`migration/apps/web/src/api/client.js`, `entities.js` and `base44Client.js` into
`apps/web/src/api/`.

> `base44Client.js` becomes a two-line re-export. Because the export name `base44` and
> the module path are unchanged, **none of the ~250 existing import sites change.**

### Write the parity suite — `workers/api/test/db.spec.ts`

Use `@cloudflare/vitest-pool-workers`. It must prove, for a representative sample of
entities (at minimum `Projects`, `Scenes`, `ProductionSettings`, `UploadMetadata`):

1. `filter({})` on an empty table returns `[]` — **not** `null`, **not** `undefined`
2. `create` returns the full row including `id`, `created_date`, `updated_date`, `created_by`
3. `update(id, { one_field })` leaves every other field intact (**partial merge**)
4. An **undeclared** field round-trips: write `{ totally_new: 'x' }`, read it back as `'x'`
5. Partial update preserves *previously written* undeclared fields
6. A field > 64KB on `ProductionSettings.timeline_video_clips` round-trips byte-identically
   through R2, and `delete` purges the blob
7. `list('-created_date', 500)` orders newest first; `filter({...}, 'scene_number')` orders ascending
8. `filter({ record_type: 'scheduled_post' })` on `UploadMetadata` works — this field is
   **undeclared in the original schema but promoted to a real column**; it is the reason
   the promotion exists
9. Types survive: booleans come back `true/false` not `1/0`; arrays and objects come back
   parsed, not as JSON strings

**Accept:** all nine pass locally and against remote D1.

---

## Phase 3 — Auth

1. `npm i @stackframe/react` in `apps/web`.
2. Replace `apps/web/src/lib/AuthContext.jsx` with the provided file.
3. Wrap the app in `StackProvider` / `StackTheme` in `apps/web/src/main.jsx`, inside
   which `AuthProvider` renders. Env: `VITE_STACK_PROJECT_ID`,
   `VITE_STACK_PUBLISHABLE_CLIENT_KEY`.
4. Add a sign-in route (`/handler/*`) per the Stack Auth React docs.
5. **Delete** `apps/web/src/lib/app-params.js` and every import of it.

> The provided AuthContext keeps `isLoadingPublicSettings` and `appPublicSettings` as
> inert values. They are Base44 leftovers, but removing them would mean editing
> `App.jsx`, which the migration forbids. Leave them.

**Accept:** signed-out user is redirected to sign-in; signed-in user reaches the
Dashboard; any `/api/db` or `/api/fn` call without a bearer token returns 401; logout
clears the session and redirects.

---

## Phase 4 — Function transport + BYOK Settings

1. `src/index.ts`, `src/fn/registry.ts`, `src/fn/healthCheck.ts` are already placed.
2. Place `migration/apps/web/src/pages/Settings.jsx` and
   `migration/apps/web/src/components/settings/ApiKeyField.jsx`.
3. Register `Settings` in `pages.config.js` (added in Phase 0.4).

### Verify the old hack is gone

`grep -n "KNOWN_FLAT\|resolvedShape\|/entry" apps/web/src/api/` must return nothing.
There is exactly one path per function now.

**Accept:**
- Settings renders every provider grouped by category, with Required/Recommended/Optional badges
- Saving a key returns a masked hint and **never** the plaintext — confirm in DevTools
  that no response body contains the key you typed
- **Test** on a deliberately wrong key reports failure; on a correct key reports success
- **Test all** runs every configured key
- `HealthCheckButton` on the Dashboard renders a report of D1, both R2 buckets and each
  configured provider
- Reloading Settings shows keys as configured with hints, and no plaintext anywhere

### Security check before moving on

Confirm all of these:
- [ ] `KEYVAULT_MASTER_KEY` is a wrangler secret, not in `wrangler.toml` or git
- [ ] no provider key appears in `wrangler.toml`, `.dev.vars`, or any committed file
- [ ] `/api/keys` responses contain only `hint`, never `ciphertext` or plaintext
- [ ] keys are never written to `console.log`
- [ ] `ALLOWED_ORIGINS` lists exact origins — no `*`
