# MyYTEngine

A faceless YouTube content engine: topic to script to scenes to images, voiceover,
music and timeline export, with thumbnails and SEO packaging at the end.

Live at [myytengine.rcinc.app](https://myytengine.rcinc.app).

## Layout

```
apps/web/       React + Vite SPA, deployed to Vercel
workers/api/    Cloudflare Worker — the whole backend
migration/      records of the migration off the original hosted platform
```

| Concern | Where it lives |
|---|---|
| Application data | Cloudflare D1 (`myytengine`) |
| Media and finished exports | Cloudflare R2, served from `media.radiantmemory.ca` |
| Oversized columns | R2 cold storage, offloaded above 64 KB and rehydrated on read |
| Identity | Neon Postgres — **auth tables only** |
| Provider keys | AES-GCM encrypted in D1, entered per user in Settings |

## Auth

Self-hosted session auth, the same model as the other rcinc.app apps. An opaque
random token lives in an httpOnly, SameSite=Lax cookie; only its SHA-256 hash is
stored, so a database leak cannot be replayed as a login and revocation is
instant. Two ways in: Google OAuth (authorization code with PKCE) and a one-time
code emailed to the address.

The SPA reaches the Worker same-origin through a Vercel rewrite, which is what
lets the cookie travel with every API call.

## Running locally

```bash
npm install
npm run dev --workspace @myytengine/web
```

The dev server proxies `/api` to the deployed Worker, so local sessions behave
the same as production. To run the Worker itself, `npm run dev --workspace
@myytengine/api`.

## Deploying

Both halves deploy from `main`:

- **Frontend** — Vercel builds on push.
- **Worker** — Cloudflare Workers Builds runs from `workers/api`.

Nothing needs deploying by hand. Worker secrets are set with
`npx wrangler secret put <NAME>` from `workers/api`, never committed.

## Tests

```bash
npm run typecheck --workspace @myytengine/api
npm test --workspace @myytengine/api
npm run lint --workspace @myytengine/web
npm run build --workspace @myytengine/web
```
