# myytengine migration — deliverables index

Everything Codex needs. Read in this order.

## Documents

| File | Purpose |
|---|---|
| `../AUDIT.md` | Repo audit — features, providers, the 5 Base44 coupling points |
| `../MIGRATION-PLAN.md` | Architecture, the 4 contracts, all 13 phases |
| `codex/00-PREAMBLE.md` | **Prepend to every phase prompt.** The rules |
| `codex/PHASE-0.md` | Restructure, dedup, prune |
| `codex/PHASE-0-DEDUP-MANIFEST.md` | Generated: canonical file per function |
| `codex/PHASE-1-2-3-4.md` | Infra, data layer, auth, transport + Settings |
| `codex/PORT-RECIPE.md` | How to port one function, by hand |
| `codex/PHASE-6.md` | Core text batch — 18 functions, 1,205 prompt strings |
| `codex/PHASE-7.md` | Image & video — 14 codemod + 2 hand-written (S3 SDK → R2 binding) |
| `codex/PHASE-8.md` | Audio — 11 codemod + 2 hand-written (Bunny retired, AI33 owns audio) |
| `codex/PHASE-9-10-11.md` | Thumbnails, clips, topics, SEO, b-roll — 17 codemod + 2 hand-written |
| `codex/PHASE-12.md` | Frontend finalisation — drop Base44, rename imports, Vercel |
| `codex/PHASE-13.md` | Data cutover — 25 entities out of Base44 into D1 + R2 |
| `codex/FFMPEG.md` | Server-side video on Cloudflare Containers |

## Tools (run these; do not hand-port the big files)

```
tools/
├─ port-fn.mjs               Deno -> Worker codemod for ONE function
├─ verify-prompts.mjs        proves no prompt string changed. Exit 1 = do not ship
├─ port-batch.mjs            runs both across a phase manifest
├─ batches/phase6.json       the 18 core-text functions
├─ batches/phase7.json       the 14 image/video functions
├─ batches/phase8.json       the 11 audio functions
├─ batches/phase9.json       thumbnails & LLM plumbing
├─ batches/phase10.json      shorts & clips
├─ batches/phase11.json      topics, SEO & b-roll
├─ debase44.mjs              Phase 12: the 104-import rename
├─ export-base44.mjs         Phase 13: dump 25 entities to JSON
└─ import-to-worker.mjs      Phase 13: load into D1 + R2 through the API
```

```bash
node migration/tools/port-batch.mjs migration/tools/batches/phase6.json
#  -> 18 pass / 0 fail  (1205 strings compared)
node migration/tools/port-batch.mjs migration/tools/batches/phase7.json
#  -> 14 pass / 0 fail  ( 244 strings compared)
node migration/tools/port-batch.mjs migration/tools/batches/phase8.json
#  -> 11 pass / 0 fail  (  37 strings compared)
# ... phase9 / phase10 / phase11 likewise
#
# All six batches:  60 pass / 0 fail  (1578 prompt strings verified)
```

Both scanners are string-aware state machines with regex-literal handling. That is not
incidental: these files nest backticks inside `${...}` interpolations and contain patterns
like `/['"]?\s*/g`. A naive scanner desyncs on those and will splice unrelated `fetch()`
calls together — which is exactly what happened before the tokenizers were fixed.

## Code (ready to place)

```
workers/ffmpeg/                 the ffmpeg container
├─ main.go · Dockerfile · go.mod

workers/api/
├─ wrangler.toml · package.json · tsconfig.json · .gitignore
└─ src/
   ├─ index.ts                 router: /api/{health,auth,db,fn,upload,keys}
   ├─ types.ts                 Env / Ctx / FnHandler
   ├─ middleware/auth.ts       Neon Auth JWKS verification
   ├─ db/
   │  ├─ schema.sql            27 tables — GENERATED from the .jsonc schemas
   │  ├─ registry.ts           column map + cold-field list — GENERATED
   │  ├─ client.ts             the base44.entities.* replacement
   │  └─ cold.ts               D1-hot / R2-cold offload
   ├─ lib/
   │  ├─ http.ts               envelope, HttpError, fetchJson
   │  ├─ ai.ts                 LLM routing + invokeLLM. AI_PROVIDER_MODE picks
   │  │                        CheaperInference (default) or Cloudflare AI Gateway
   │  ├─ gemini-compat.ts      native Gemini <-> OpenAI translation, so all ~51
   │  │                        Gemini call sites stay byte-identical either way
   │  ├─ kie.ts                KIE createTask/recordInfo — called DIRECTLY, not via gateway
   │  ├─ ai33.ts               AI33 TTS / voices / cloning — also direct, xi-api-key
   │  ├─ asr.ts                AssemblyAI ⇄ Whisper behind one interface
   │  ├─ r2.ts                 putMedia / ingestUrl — replaces all S3 SDK usage
   │  ├─ storage.ts            tiered media: Bunny ephemeral/durable + 48h sweep
   │  ├─ ffmpeg.ts             client for the ffmpeg container
   │  ├─ gender.ts             character gender from the director's description
   │  ├─ models.ts             model id map — code's ids -> the catalogue's
   │  ├─ vault.ts              BYOK: AES-GCM + per-request key resolver
   │  └─ providers.ts          BYOK catalog — drives Settings and key tests
   ├─ ffmpeg-do.ts             Durable Object fronting the ffmpeg container
   ├─ routes/{db,keys}.ts
   └─ fn/
      ├─ registry.ts           function registry
      ├─ healthCheck.ts        canary
      ├─ uploadToR2.ts         hand-written: R2 native multipart
      ├─ proxyFetchAsset.ts    hand-written: R2 binding + safe base64
      └─ quickPublishTranscribe.ts  hand-written: ASR switch + R2 manifest;
                                    clip_video returns 501 (needs a decision)

apps/web/src/
├─ api/client.js               the SDK replacement
├─ api/entities.js             GENERATED entity name list
├─ api/base44Client.js         2-line re-export → ZERO call-site changes
├─ lib/AuthContext.jsx         Neon Auth, identical exported shape
├─ pages/Settings.jsx          BYOK key management
└─ components/settings/ApiKeyField.jsx
```

## Scope at a glance

| | |
|---|---|
| Files in the Base44 export | 283 |
| Unique functions | 148 |
| **Functions to actually port** | **64** |
| Orphans kept but not ported | 47 |
| Deleted (out of scope) | 37 |
| Tables | 25 entities + `UserApiKeys` + `UserSettings` |

## BYOK

No provider key lives in `wrangler.toml`. Users enter keys in **Settings → API Keys**;
they are encrypted with AES-GCM under `KEYVAULT_MASTER_KEY` (the only wrangler secret)
and stored in D1. Plaintext exists only inside a request and is never returned to the
browser.

Provider ownership, after the owner's routing decisions:

| Concern | Provider |
|---|---|
| All LLM text + vision | **CheaperInference** — one key for Claude, GPT and Gemini |
| Image gen, image-to-image, image-to-video | **KIE.ai** |
| TTS, voice cloning, sound effects, background music | **AI33.pro** |
| Speech-to-text | AssemblyAI, falling back to Workers AI Whisper |

Three tiers, so the app degrades rather than breaks:

- **core** — Gemini, KIE, AI33. Without these nothing generates.
- **recommended** — Anthropic, OpenAI, Pexels, Pixabay. A feature is weaker without them.
- **optional** — AssemblyAI, MiniMax, Inworld, YouTube, Cobalt. Each unlocks an
  alternative code path that already exists; absent, the primary provider is used.

That tiering is why no provider had to be ripped out of the codebase: MiniMax, Inworld
and AssemblyAI branches stay exactly as written and simply lie dormant without a key.
It also removes the Phase-5 Whisper risk from the critical path — if Workers AI word
timings disappoint, the user pastes an AssemblyAI key and the original path resumes.

⚠ **Back up `KEYVAULT_MASTER_KEY`.** Lose it and every stored key must be re-entered.

## Two things to verify early

1. **Whisper word timings** (Phase 5 spike) — `lib/asr.ts` prefers word-level timings and
   falls back to segment-level. Caption auto-sync, silence trim and `asrAutoSync.js`
   (443 lines) consume `words:[{word,start,end}]`. Measure before building on it.
2. **The 30s CPU wall** — Base44 tolerated long runs; Workers do not. See the Traps
   section of `PORT-RECIPE.md`.
