# Phase 12 — Frontend finalisation

> Prepend `codex/00-PREAMBLE.md`. Run this **after** the app is green on the new backend,
> not before. It is the step that removes the safety net.

Small phase, four jobs: drop the Base44 packages, rename the client import, wire the
environment, and configure Vercel.

---

## Step 1 — Delete two dead files

**`apps/web/src/functions/callClaudeProxy.js`** — a Deno function stranded in the
frontend source tree. It imports `npm:@base44/sdk`, which only resolves in Deno, and
**nothing imports it**. It survived because Vite never touched it. Delete it. The real
one is `workers/api/src/fn/callClaudeProxy.ts`.

**`apps/web/src/lib/app-params.js`** — the Base44 URL/localStorage parameter reader
(`?app_id=`, `?access_token=`, `base44_*` keys). Phase 3 removed its last consumer.

## Step 2 — Rename the client import

104 files import the API client, and every one uses the identical form. So this is an
exact-string swap, not a regex:

```bash
node migration/tools/debase44.mjs apps/web/src            # dry run first
node migration/tools/debase44.mjs apps/web/src --write
```

```
import { base44 } from '@/api/base44Client'
  ->
import { api as base44 } from '@/api/client'
```

**The local identifier stays `base44`.** Only the import line changes; not one usage
line moves. Renaming the identifier as well would touch ~440 call sites for cosmetic
gain and would put the migration's "no behaviour change" claim at risk for nothing. If
you want the name gone, do it as a separate commit after cutover.

Then delete `apps/web/src/api/base44Client.js` — the compat shim has done its job.

The tool reports any file still mentioning `base44` and needs no further action for
files Phase 0 already deleted. Two text-only leftovers are covered in Step 5.

## Step 3 — Drop the packages

`apps/web/package.json`:

```diff
-    "@base44/sdk": "^0.8.41",
-    "@base44/vite-plugin": "^1.0.30",
```

`apps/web/vite.config.js` — the plugin goes and the file collapses to:

```js
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The Base44 plugin used to provide this. `@/...` is used by every import in the app.
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

> ⚠ **The `@` alias is load-bearing.** `@base44/vite-plugin` was supplying it. Remove the
> plugin without adding the alias and every one of the ~440 `@/...` imports fails to
> resolve. Confirm `jsconfig.json` also maps `@/*` → `./src/*` for editor tooling.
>
> Also gone with the plugin: `hmrNotifier`, `navigationNotifier` and `visualEditAgent` —
> Base44 Builder hooks with no local equivalent. Nothing in the app calls them.

Then `npm install` and check the lockfile no longer contains `@base44`.

## Step 4 — Environment

`apps/web/.env.example` (commit this; never commit `.env.local`):

```
VITE_API_BASE=https://myytengine-api.<subdomain>.workers.dev
VITE_STACK_PROJECT_ID=
VITE_STACK_PUBLISHABLE_CLIENT_KEY=
```

Set the same three in Vercel → Settings → Environment Variables, for Preview and
Production. All three are public by design — `VITE_` values are compiled into the
bundle, so **nothing secret may ever go in one**. Every provider key lives in the BYOK
vault behind the Worker.

Delete the old `VITE_BASE44_APP_ID`, `VITE_BASE44_APP_BASE_URL` and
`VITE_BASE44_FUNCTIONS_VERSION` wherever they are set.

`apps/web/vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

The rewrite matters: this is a client-routed SPA, so a hard refresh on `/TimelineEditor`
must serve `index.html` rather than 404.

## Step 5 — Two stale strings

**`src/components/content/ImageProviderSelector.jsx:8`** is **user-visible copy** on the
"Auto (Best Available)" option:

> `desc: 'Base44 image generation first, then your configured API fallback.'`

After the migration that sentence is false — there is no Base44, and Auto now runs the
KIE cascade (`seedream-edit` → `z-image` → `grok-imagine` → `seedream-4.5`). This is the
one place the migration leaves user-facing text describing a vendor that no longer
exists.

**Do not invent replacement wording.** Report it and let the owner choose. A minimal
accurate version would be *"Best available model, with automatic fallback."* — but that
is their call, not yours.

**`src/pages/ClipExtractor.jsx:8`** is a stale code comment about Base44 not supporting
`@ffmpeg/ffmpeg`. Harmless; delete the line or leave it.

## Step 6 — Prove it

```bash
cd apps/web
npm run build          # must succeed
npm run lint           # no unresolved imports

grep -ri "base44" src            # -> nothing (or only the copy string from Step 5)
grep -ri "base44" package.json   # -> nothing
```

## Acceptance

- [ ] `npm run build` and `npm run lint` clean
- [ ] `grep -ri base44 apps/web/src` returns nothing beyond the Step 5 copy string
- [ ] no `@base44` entry in `package.json` or the lockfile
- [ ] the `@` alias resolves — a page deep in `components/timeline/` still imports fine
- [ ] deployed to Vercel; a **hard refresh** on `/TimelineEditor` loads the app, not a 404
- [ ] sign-in works end to end against the deployed Worker
- [ ] Settings → API Keys loads and a key round-trips
- [ ] the Step 5 copy string is recorded in `MIGRATION-NOTES.md`

## Do not

- Do not run this before the app works on the new backend — it deletes the compat shim.
- Do not rename the `base44` identifier at the ~440 usage sites; only the import.
- Do not remove the vite plugin without adding the `@` alias.
- Do not put any secret in a `VITE_` variable.
- Do not rewrite the Step 5 user-visible copy on your own judgement.
