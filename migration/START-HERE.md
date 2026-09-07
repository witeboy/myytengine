# START HERE — myytengine migration, master brief

You are implementing a **substrate migration**: moving a working YouTube content engine
off Base44 and onto Vercel (frontend) + Cloudflare Workers (backend). The architecture,
all shared code, and a step-by-step prompt for every phase are already written and in
this bundle. Your job is to execute them in order.

**This is not a rewrite.** The app works today. Every prompt, every model id, every
button, every string of copy must behave identically afterwards. The only things that
change are where the code runs and which vendor answers.

---

## 0. The prime directive

**Do not change behaviour.**

No prompt text, model id, temperature, response schema, retry, timeout, copy string,
className, layout or UX flow may change. You are moving code between runtimes.

If something looks like a bug, **leave it and write it in `MIGRATION-NOTES.md`**. Several
real bugs were found during design; the ones the owner chose to fix are called out
explicitly in their phase docs. Everything else stays as-is, on purpose.

Three rules follow from this:

1. **Do not change call signatures.** Shims exist so the ~440 existing call sites stay
   untouched. If you find yourself editing a `.jsx` page to make a backend change work,
   **stop** — the shim is wrong, fix the shim.
2. **Port, don't rewrite.** Copy function bodies verbatim. Change only the import header,
   the handler wrapper, `Deno.env.get` → `ctx.keys`, `base44.entities` → `ctx.db`, and
   provider base URLs.
3. **When two things disagree, ask.** Do not merge, guess, or split the difference.

---

## 1. What this migration is worth knowing about before you start

Four facts about the source repo that shape everything:

**The export duplicates every function up to 4 times.** `foo.ts`, `foo/entry.ts`,
`foo/entry/entry.ts`, `foo/entry/entry/entry.ts` — with *different content* and 5
different pinned SDK versions. 283 files collapse to 111. `codex/PHASE-0-DEDUP-MANIFEST.md`
names the canonical file for each.

**Base44 stored entities schemalessly.** The `.jsonc` schemas are stale — 15 entities
write fields their schema never declared. That is why every table has an `attrs` JSON
overflow column. Do not "fix" a write to match a schema.

**~380KB of the code is hand-tuned prompt engineering.** It is the product. A codemod
plus a verifier exist specifically so no model ever retypes it. **1,578 prompt strings
are checked byte-for-byte on every run.**

**Two functions are called by a dynamic name** (`AutoBrollButton.jsx` builds `fnName`
from a ternary). Grep says they are dead. They are not. See PHASE-9-10-11 §11a.

---

## 2. What is in this bundle

```
START-HERE.md              ← you are here
AUDIT.md                   full repo audit: features, providers, coupling points
MIGRATION-PLAN.md          architecture, the four contracts, all 14 phases
README.md                  index of everything

codex/                     one prompt per phase — read the matching one before you work
tools/                     scripts you run; do not hand-do what these automate
workers/api/               Worker source — place as-is
workers/ffmpeg/            ffmpeg container — place as-is
apps/web/                  frontend files — place as-is
```

**Prepend `codex/00-PREAMBLE.md` to every phase.** It carries the rules, the provider
routing table, the model-id mapping warning and the four contracts.

---

## 3. Target repo layout

Restructure the existing repo into a monorepo (this is Phase 0):

```
myytengine/
├─ apps/web/          the existing src/, index.html, tailwind + postcss + eslint configs
├─ workers/api/       the Worker
├─ workers/ffmpeg/    the ffmpeg container
├─ base44/            KEEP as reference through Phase 11; delete at Phase 12
└─ migration/         this bundle — tools/ is run from the repo root
```

Root `package.json` with npm workspaces: `["apps/*", "workers/*"]`.

---

## 4. Where every file goes

Paths are relative to the repo root. Everything is placed as-is unless noted.

### Worker API — `workers/api/`

| From this bundle | To |
|---|---|
| `workers/api/wrangler.toml` | `workers/api/wrangler.toml` — **fill every `REPLACE_ME`** |
| `workers/api/package.json` · `tsconfig.json` · `.gitignore` | same paths |
| `workers/api/src/index.ts` | router: `/api/{health,auth,db,fn,upload,keys}` + the daily sweep |
| `workers/api/src/types.ts` | `Env` / `Ctx` / `FnHandler` |
| `workers/api/src/ffmpeg-do.ts` | Durable Object fronting the container |
| `workers/api/src/middleware/auth.ts` | Neon Auth JWKS verification |
| `workers/api/src/db/schema.sql` | 27 tables — **generated, do not hand-edit** |
| `workers/api/src/db/registry.ts` | column map + cold-field list — generated |
| `workers/api/src/db/client.ts` | the `base44.entities.*` replacement |
| `workers/api/src/db/cold.ts` | D1-hot / R2-cold offload |
| `workers/api/src/routes/db.ts` · `keys.ts` | entity + BYOK routes |
| `workers/api/src/lib/*.ts` | 12 shared modules — see below |
| `workers/api/src/fn/*.ts` | 7 hand-written functions + `registry.ts` |

**`src/lib/` — what each one is for:**

| File | Role |
|---|---|
| `http.ts` | response envelope, `HttpError`, `fetchJson` |
| `ai.ts` | LLM routing. `AI_PROVIDER_MODE` picks CheaperInference or CF AI Gateway |
| `gemini-compat.ts` | native Gemini ⇄ OpenAI translation, so 51 call sites don't change |
| `models.ts` | **model id map** — the code's ids differ from the catalogue's. Load-bearing |
| `kie.ts` | KIE: image, image-to-image, image-to-video. Called directly |
| `ai33.ts` | AI33: TTS, dialogue, cloning, Suno music + SFX. Called directly |
| `asr.ts` | transcription: AssemblyAI ⇄ Whisper behind one interface |
| `storage.ts` | **tiered media** — Bunny, `ephemeral` swept at 48h / `durable` kept |
| `r2.ts` | cold storage only; re-exports storage's media helpers |
| `ffmpeg.ts` | client for the ffmpeg container |
| `vault.ts` | BYOK: AES-GCM encryption + per-request key resolution |
| `providers.ts` | BYOK catalogue — drives the Settings page and key tests |
| `gender.ts` | character gender from the director's description (Phase 6 §3.3) |

### ffmpeg container — `workers/ffmpeg/`

`main.go`, `Dockerfile`, `go.mod`, `.dockerignore` → same paths. Built and deployed by
`wrangler deploy` from `workers/api`. Docker must be running locally.

### Frontend — `apps/web/`

| From this bundle | To | Note |
|---|---|---|
| `apps/web/src/api/client.js` | same | the SDK replacement |
| `apps/web/src/api/entities.js` | same | generated entity list |
| `apps/web/src/api/base44Client.js` | same | **compat shim — overwrites the existing file.** This is why 104 imports don't change |
| `apps/web/src/lib/AuthContext.jsx` | same | **overwrites** — identical exported shape |
| `apps/web/src/pages/Settings.jsx` | same | new page — register it in `pages.config.js` |
| `apps/web/src/components/settings/ApiKeyField.jsx` | same | new |
| `apps/web/vercel.json` | same | SPA rewrites |

### Tools — run from the repo root

| Tool | Used in |
|---|---|
| `port-fn.mjs` | one-function Deno→Worker codemod |
| `verify-prompts.mjs` | proves no prompt string changed. **Exit 1 = do not ship** |
| `port-batch.mjs` | runs both across a phase manifest |
| `debase44.mjs` | Phase 12 — the 104-import rename |
| `export-base44.mjs` | Phase 13 — dump entities to JSON |
| `import-to-worker.mjs` | Phase 13 — load into D1 + R2 through the API |

---

## 5. Order of work

Do not start a phase until the previous one's acceptance criteria pass.

| # | Phase | Read | Gate |
|---|---|---|---|
| 0 | Dedup & prune | `PHASE-0.md` + `PHASE-0-DEDUP-MANIFEST.md` | build clean · 283→111 files |
| 1 | Infrastructure | `PHASE-1-2-3-4.md` §1 | `/api/health` reachable from Vercel |
| 2 | Data layer | §2 | 9-point parity suite passes on **remote** D1 |
| 3 | Auth | §3 | 401 unauthenticated · Dashboard loads |
| 4 | Transport + BYOK Settings | §4 | HealthCheck green · keys round-trip masked |
| 5 | Provider adapters | (in the lib files) | smoke each adapter once |
| 6 | Core text — 18 fns | `PHASE-6.md` | **18 pass / 0 fail (1205 strings)** |
| 7 | Image & video — 16 | `PHASE-7.md` | 14 pass / 0 fail · no AI33 in image code |
| 8 | Audio — 13 | `PHASE-8.md` | 11 pass / 0 fail · no `BUNNY_`/S3 leftovers |
| 9–11 | Thumbnails, clips, topics, SEO, b-roll — 19 | `PHASE-9-10-11.md` | 3 + 6 + 8 pass / 0 fail |
| — | ffmpeg container | `FFMPEG.md` | `/health` ok · a real clip plays |
| 12 | Frontend finalisation | `PHASE-12.md` | `grep -ri base44 apps/web/src` clean |
| 13 | Data cutover | `PHASE-13.md` | row counts match · relationships hold |

**Phase 0 can start immediately.** It is pure deletion against the current repo and
depends on nothing else. Phase 1's outputs (database id, gateway id) are inputs to
everything after, so do 0 and 1 together if you can.

The ffmpeg container can be built any time after Phase 5. Until it exists,
`clip_video` returns a 501 naming the in-browser path and nothing else breaks.

---

## 6. The four contracts

These exist so call sites never move. Never deviate.

**C-1 · Functions** — `POST /api/fn/:name` → `{ data }` on success, `{ error }` with an
HTTP status on failure. A handler returns the **inner** value; the router wraps it.

**C-2 · Entities** — `POST /api/db/:entity/:op`. `filter` returns `[]` never null.
`update` is a **partial merge**. `create`/`update` return the full row.

**C-3 · Tables** — typed declared columns **plus an `attrs` JSON overflow column**,
because Base44 was schemaless.

**C-4 · Cold storage** — fields marked `cold` in `db/registry.ts` offload to R2 above
64KB and rehydrate transparently. This is what keeps the timeline editor working.

---

## 7. Provider routing

| Concern | Provider | How |
|---|---|---|
| All LLM text + vision — Claude, GPT, Gemini | **CheaperInference** | one key, via `lib/ai.ts` |
| Image, image-to-image, image-to-video | **KIE.ai** | direct — never through a gateway |
| TTS, dialogue, cloning, SFX, music | **AI33.pro** | direct — Suno for music and SFX |
| Speech-to-text | AssemblyAI → Workers AI Whisper | switchable in Settings |
| Working media | **Bunny** | `ephemeral/` swept at ~48h |
| Finished exports · database · auth | R2 · D1 · Neon Auth | bindings, no credentials |
| Server-side video | Cloudflare Containers | real ffmpeg binary |

**All provider keys are BYOK** — entered by the user in Settings, AES-GCM encrypted
under one `KEYVAULT_MASTER_KEY` secret, stored in D1. **No provider key goes in
`wrangler.toml`.** Read them via `ctx.keys.require()` / `ctx.keys.get()`.

⚠ **Model ids are remapped in transit** (`lib/models.ts`). The code pins ids that mostly
do not exist in the catalogue — `claude-sonnet-4-6` vs `claude-sonnet-4.6` is dash-vs-dot,
and `gemini-2.0-flash` has 39 call sites and no upstream equivalent. **Leave the pinned
id in the ported function exactly as written.** Editing one in `src/fn/` is a behaviour
change and breaks the one place the substitution is documented.

---

## 8. How the porting actually works

You are not hand-writing 60 functions. For each batch:

```bash
node migration/tools/port-batch.mjs migration/tools/batches/phase6.json
```

It runs the codemod and the prompt verifier over every function in the manifest and
prints a pass/fail table plus a list of the things that need a human. Expected totals:

```
phase6   18 pass / 0 fail   1205 prompt strings
phase7   14 pass / 0 fail    244
phase8   11 pass / 0 fail     37
phase9    3 pass / 0 fail     19
phase10   6 pass / 0 fail     23
phase11   8 pass / 0 fail     50
────────────────────────────────────────
TOTAL    60 pass / 0 fail   1578
```

**If a pass count comes back lower than this, something upstream changed. Stop and
report it. Never edit a prompt to make the verifier green.**

The tool is deterministic and overwrites its own output, so re-run it freely.

---

## 9. Stop and ask when

- two duplicate versions of a function differ by more than formatting
- the verifier reports a lost or altered prompt string
- a fix would require editing a page or component to make a backend change work
- a model id, prompt, or generation parameter seems wrong
- an entity write needs a column that does not exist
- anything about Phase 13 looks off — that is the only irreversible phase

Everything you notice but do not change goes in `MIGRATION-NOTES.md` under
"Behaviour preserved that the owner may want to change".

---

## 10. Done looks like

- all 14 phase gates passed
- `npm run typecheck` clean in `workers/api`; `npm run build` + `lint` clean in `apps/web`
- 67 handlers registered; every `invoke(...)` name in the frontend resolves
- `grep -ri base44 apps/web/src` returns nothing
- `grep -rn "aws-sdk\|S3Client\|CLOUDFLARE_R2_" workers/api/src` returns nothing
- HealthCheck reports green across D1, R2, every configured key, and the model map
- a project generates end-to-end in the real UI: topics → hooks → script → scenes →
  prompts → images → video → voiceover → timeline → thumbnail → SEO
- row counts after cutover match the export manifest, and a project still has its scenes
