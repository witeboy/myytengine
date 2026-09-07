# myytengine — Base44 → Vercel/Cloudflare Migration Plan

**Architect:** Claude · **Implementer:** Codex
**Prime directive:** *no functionality, feature, copy or UI changes.* This is a substrate swap.
The only permitted UI edits are removals of nav/tabs that point at explicitly-dropped features.

---

## 0. Locked scope

### Migrating
| Area | IDs |
|---|---|
| Platform | A1 A2 A3 A4 A5 A6 |
| Channel factory | C1 C2 C3 C4 C5 + `researchNicheStrategy` (lone survivor of B) |
| Script pipeline | D1 D2 D3 D4 D5 D6 |
| Scene & visual | E1 E2 E3 E4 E5 E6 E7 E8 E9 |
| Audio | F1 F2 F3 F4 F5 F6 |
| Timeline editor | G1 G2 G3 G4 G5 G6 G7 *(in-browser export only)* |
| Thumbnails | H1 H2 H3 H4 H5 H6 |
| Shorts & clips | I1 I2 I3 I4 I5 I6 I7 *(scheduling queue only — no auto-post)* |
| Niche pipelines | L1 L2 L3 |
| SEO generation | N3 |

### Dropped
**B1–B5** niche intelligence · **all J** repurpose/cross-platform · **all K** UGC ·
**M1** auto-edit · **N1 N2 N4 N5** all publishing · **all O** media library / versions / cloud
exports / template galleries

### Deletions this produces
- **11 pages:** ResearchTerminal, ResultsGrid, ChannelAuditor, CompetitorMonitor,
  ContentRepurpose, UGCPipeline, BulkUGCPipeline, MediaLibrary, VersionHistory,
  AutoEditReview, QuickPublish, YouTubeCallback
- **~48 components** (audit/, competitors/, niche/, ugc/, bulk-ugc/, repurpose/,
  crossplatform/, autoedit/, media/, versions/, templates/, quickpublish/, and 6 from channels/)
- **7 entities retired:** NicheAudits, TrendingNiches, CachedVideos, Searches,
  InfluencerTemplates, ProjectVersions, AutoEditJobs → **32 → 25 tables**
- **~28 backend functions**

### Survivors that look droppable but are not
| Thing | Kept because |
|---|---|
| `proxyFetchAsset` | used by `useVideoExport` (G7) and `ContentGeneration` (E) |
| `MediaAssets` entity | read by `OverlayPanel` (G6) even though MediaLibrary page dies |
| `UploadMetadata` entity | N3 SEO + `TopicAssetsPanel` (C1) + `scheduleClipPost` (I7) |
| `uploadToR2` | it *is* A5 storage, not the O3 panel |
| `extractBestMoments` | I3, not N4 |
| `detectSilencesAndFillers` | G5, not N4 |

### Known degradations (accepted)
1. **No YouTube upload.** SEO copy is generated, you post manually.
2. **I7 clip scheduler** becomes a scheduling *queue* — calendar, SEO copy and clip selection
   all work, `scheduleClipPost` still writes rows; the channel picker (`useYouTubeChannels`)
   and auto-posting are removed.
3. **G7 cloud render gone** (Creatomate dropped) — export is in-browser mp4-muxer/FFmpeg only.
4. **ASR provider change** — AssemblyAI → Whisper on Workers AI. Auto-chapters becomes an
   LLM call over the transcript. See Phase 5 spike.

---

## 1. Target architecture

```
Vercel — Vite SPA (static)
   │  fetch(API_BASE + '/api/…')  with Neon Auth bearer token
   ▼
Cloudflare Worker  api.<domain>
   ├─ /api/auth/me          → Neon Auth JWT verify (JWKS)
   ├─ /api/db/:entity/:op   → entity CRUD          [replaces base44.entities.*]
   ├─ /api/fn/:name         → migrated functions   [replaces base44.functions.invoke]
   └─ /api/upload           → R2 direct/presigned  [replaces Core.UploadFile]
        │
        ├── D1  ....... hot rows (27 tables)
        ├── R2  ....... media + cold JSON blobs
        ├── AI Gateway  ┬─ google-ai-studio  (Gemini, incl. vision/video)
        │               ├─ anthropic         (Claude)
        │               ├─ openai            (GPT)
        │               └─ workers-ai        (Whisper ASR)
        ├── KIE.ai  ... image · video · music · (avatar unused)
        ├── AI33.pro .. TTS · voice list · voice cloning
        ├── YouTube Data API (read-only: stats, search)
        └── Pexels · Pixabay · Cobalt
```

### Repo layout
```
myytengine/
├─ apps/web/                    # Vite SPA → Vercel
│  ├─ src/                      # existing src/, pruned
│  │  ├─ api/client.js          # ← replaces api/base44Client.js
│  │  └─ lib/…
│  ├─ vite.config.js            # base44 plugin removed
│  └─ vercel.json
├─ workers/api/                 # Cloudflare Worker
│  ├─ src/
│  │  ├─ index.ts               # router
│  │  ├─ middleware/auth.ts
│  │  ├─ db/
│  │  │  ├─ schema.sql
│  │  │  ├─ registry.ts         # per-entity column map + cold-field list
│  │  │  ├─ client.ts           # db.Entity.filter/create/update/…
│  │  │  └─ cold.ts             # R2 offload/rehydrate
│  │  ├─ lib/
│  │  │  ├─ ai.ts   asr.ts   r2.ts   kie.ts
│  │  │  └─ ai33.ts youtube.ts stock.ts  http.ts
│  │  └─ fn/                    # one file per migrated function
│  └─ wrangler.toml
└─ packages/shared/             # entity field names shared FE/BE
```

---

## 2. The four contracts Codex must not deviate from

### C-1 · Function transport
```
POST /api/fn/:name          body: <payload>           →  200 { data: <result> }
                                                          4xx/5xx { error: string }
```
Frontend shim keeps the exact old signature so **no call site changes**:
```js
api.functions.invoke(name, payload) // → { data }
```
The `KNOWN_FLAT` set, the `resolvedShape` cache and the 404-retry hack in
`src/api/base44Client.js` are **deleted** — there is one canonical path per function now.

### C-2 · Entity transport
```
POST /api/db/:entity/filter      { where }                  → { data: Row[] }
POST /api/db/:entity/list        { sort, limit }            → { data: Row[] }
POST /api/db/:entity/get         { id }                     → { data: Row }
POST /api/db/:entity/create      { values }                 → { data: Row }
POST /api/db/:entity/bulkCreate  { values: [] }             → { data: Row[] }
POST /api/db/:entity/update      { id, values }             → { data: Row }
POST /api/db/:entity/delete      { id }                     → { data: { ok } }
```
Semantics that must match Base44 exactly:
- `filter(where)` = equality AND across all keys; returns `[]` when nothing matches (never null)
- `list(sort, limit)` where sort is `'-created_date'` / `'created_date'`; default sort `-created_date`
- `create`/`update` return the **full row**, including server-set `id`, `created_date`, `updated_date`
- `update` is a **partial merge**, not a replace

### C-3 · Table shape (this is the schema-drift answer)
Every table:
```sql
CREATE TABLE Projects (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  -- declared columns from base44/entities/Projects.jsonc, typed
  name          TEXT,
  niche         TEXT,
  …
  attrs         TEXT NOT NULL DEFAULT '{}'   -- JSON overflow for undeclared fields
);
```
`db/client.ts` **splits on write** (known column → column; unknown key → `attrs`) and
**merges on read** (`{...columns, ...JSON.parse(attrs)}`). Calling code therefore behaves
identically to Base44's schemaless store. This is non-negotiable: 15 entities write
undeclared fields today.

### C-4 · Cold storage (D1 hot / R2 cold)
`db/registry.ts` marks large fields per entity. On write, any marked field whose serialized
length exceeds **65,536 bytes** is written to R2 at `cold/{entity}/{id}/{field}.json` and the
column stores the sentinel `{"__r2":"<key>"}`. On read the client rehydrates transparently.

Fields to mark (post-drop): `ProductionSettings.timeline_video_clips`,
`.timeline_caption_clips`, `.timeline_overlay_clips`, `.caption_data`, `.voiceover_chunks`,
`.beat_durations`, `.beat_start_times`, `.story_analysis` · `Scripts.full_script` ·
`ScriptBatches.content` · `Transcripts.word_timings` · `Channels.ai_insights` ·
`ThumbnailTemplates.composition_blueprint`.

---

## 3. Provider migration rules

### Text / vision → Cloudflare AI Gateway
AI Gateway's per-provider endpoints are **transparent passthroughs**. The migration for all
~170 LLM call sites is therefore a **base-URL swap with request bodies untouched**:

| Old | New |
|---|---|
| `https://generativelanguage.googleapis.com/v1beta/…` | `{GW}/google-ai-studio/v1beta/…` |
| `https://api.anthropic.com/v1/messages` | `{GW}/anthropic/v1/messages` |
| `https://api.openai.com/v1/…` | `{GW}/openai/v1/…` |

where `{GW}` = `https://gateway.ai.cloudflare.com/v1/{CF_ACCOUNT_ID}/{GATEWAY_ID}`.

This is why Gemini vision and video-file calls keep working unchanged — the single biggest
de-risking fact in this migration. **Codex must not "modernise" any prompt, model id,
temperature, schema or retry.** `lib/ai.ts` exists only to build URLs and attach keys.

### Everything else
| Concern | Old | New |
|---|---|---|
| `Core.InvokeLLM` | Base44 | `lib/ai.ts` → gateway (already shimmed once in `src/lib/invokeLLM.js` — reuse that shape) |
| `Core.UploadFile` | Base44 | `POST /api/upload` → R2 |
| `Core.GenerateImage` | Base44 | KIE via `lib/kie.ts` |
| Bunny CDN | `bunnyUpload`, `bunnyConfig` | delete; `directApi.uploadToCloudinary` re-points at `/api/upload` |
| AssemblyAI | `submitTranscription`/`pollTranscription` | Workers AI Whisper, **same submit/poll API shape** so `lib/transcribeASR.js` and `lib/directApi.js` are untouched |
| Auto-chapters | AssemblyAI | LLM call, same `{chapters:[{start,end,headline,summary}]}` output |
| MiniMax TTS/SFX | direct | AI33 (TTS) / KIE (SFX) |
| Inworld, Freepik, Kling, Runway, Creatomate | direct | deleted |

---

## 4. Phases

Each phase is independently verifiable. Do not start a phase until the previous one's
acceptance criteria pass.

### Phase 0 — Dedup & prune *(no new infra; pure deletion)*
The export has each function at up to 4 paths with **different content and 5 different pinned
SDK versions**. Collapse to one file per function.
- Rule: **largest file wins** (verified against `AUDIT.md` canonical table). Where two versions
  differ semantically, diff them and keep the one whose call signature matches the frontend.
- Delete all dropped features (§0) and prune nav: `pages.config.js`, `App.jsx` routes,
  `QuickShortcuts.jsx` (5 tiles), `ToolsHub.jsx` (6 tiles), `Layout.jsx` (the whole
  `nichePages` branch → Layout becomes a passthrough), `Dashboard.jsx` (Cloud Exports +
  Multi-Platform tabs), `ChannelDetail.jsx` (Niche Insights, Competitors, Auto-Edit panels),
  `PostProduction.jsx` (Publish tab only — **keep Titles/Descriptions/Thumbnails**).
- ✅ **Accept:** `npm run build` clean, `npm run lint` no unresolved imports, 148→~100 function files.

### Phase 1 — Infrastructure skeleton *(no app logic)*
Wrangler project, D1 database, two R2 buckets (`media`, `cold`), AI Gateway, Neon project for
Neon Auth, Vercel project, all secrets set. `GET /api/health` returns `{ok:true}`.
- ✅ **Accept:** Worker deploys; SPA on Vercel reaches `/api/health` through CORS.

### Phase 2 — Data layer
`schema.sql` (25 tables + 2 BYOK, C-3 shape), `registry.ts`, `client.ts`, `cold.ts`, `/api/db/*` routes,
and `apps/web/src/api/client.js` entity shim.
- ✅ **Accept:** a parity suite exercising every op against every entity, including: filter
  returns `[]` not null · update merges partially · undeclared field round-trips through
  `attrs` · a >64KB field round-trips through R2 · `list('-created_date', 500)` ordering.

### Phase 3 — Auth
Neon Auth on the SPA; Worker JWKS middleware injecting `user`; `/api/auth/me`. Rewrite
`lib/AuthContext.jsx` keeping its **exact exported shape** (`user, isAuthenticated,
isLoadingAuth, isLoadingPublicSettings, authError, logout, navigateToLogin, checkAppState`) so
`App.jsx` and `UserNotRegisteredError.jsx` are untouched. Delete `lib/app-params.js` and the
`/api/apps/public/...` probe.
- ✅ **Accept:** unauthenticated request to any `/api/db` or `/api/fn` route → 401; logged-in
  user reaches the Dashboard; logout clears and redirects.

### Phase 4 — Function transport
`/api/fn/:name` router with a `fn/` module registry. Port `healthCheck` first as the canary.
Replace `base44Client.js` with `client.js` (invoke shim, no 404 hack).
- ✅ **Accept:** HealthCheckButton renders a green report; one 404 for an unknown name.

### Phase 5 — Provider adapters *(+ one spike)*
`lib/ai.ts` `asr.ts` `r2.ts` `kie.ts` `ai33.ts` `youtube.ts` `stock.ts` `http.ts`.

> **⚠ Spike required before F5 work begins.** Verify `@cf/openai/whisper-large-v3-turbo` on
> Workers AI returns **word-level** timestamps, not just segments. G4 caption auto-sync, G5
> silence trim and `lib/asrAutoSync.js` (443 lines) all consume `words:[{word,start,end}]`.
> If word timings are absent or low quality, fall back to Groq or Deepgram Whisper behind the
> same `lib/asr.ts` interface — **do not** change the interface or any caller.

- ✅ **Accept:** a smoke script hits each adapter once and asserts response shape.

### Phase 6 — Core text functions *(largest batch, highest value)*
D3 D4 D5 · E1 E2. Includes the ~380KB prompt engine: `generateScenePrompts`,
`enhanceScenePrompts`, `enhancePrompt`, `cleanScenePrompt`, `fixScenePrompts`,
`rephraseScenePrompt`, `dedupScenes`, plus `generateFullScript`, `generateScriptBatches`,
`initializeScriptBatches`, `generateHooks`, `selectHook`, `generateSceneBreakdown`.
- ✅ **Accept:** generate a project end-to-end through StoryScript; byte-compare the produced
  script/prompts against a Base44 run on the same seed input.

### Phase 7 — Image & video generation
E3 E4 E5 E9 · H2 H3. KIE-backed: `generateSceneImage`, `pollSceneImage`, `generateSceneVideo`,
`pollSceneVideo`, `extractCharacterDNA`, `generateProgression*`, `generateThumbnailImage`,
`generateNewThumbnailImage`, `pollThumbnailTask`, `thumbnailBlend`, `pollThumbnailBlend`,
`detectFaceRegion`, `proxyFetchAsset`, `uploadToR2`.

### Phase 8 — Audio
F1–F5. `generateVoiceover`, `pollVoiceover`, `listVoices`, `listVoicesByProvider`,
`previewVoice`, `inworldVoiceover`→AI33, `generateMusic`, `checkMusicStatus`,
`generateSoundEffect`, `submitTranscription`, `pollTranscription`, `quickPublishTranscribe`
(keep — `directApi.js` calls it for bunny_config/submit/poll/clip_video; re-point at R2).

### Phase 9 — Thumbnails, remainder
H1 H4 H5 H6 · C5.

### Phase 10 — Shorts & clips
I1–I7. `shortsGenerateScript`, `shortsSceneBreakdown`, `analyzeViralMoments`,
`extractBestMoments`, `downloadYouTubeVideo` (Cobalt), `enhanceClipForFYP`, `clipAndVoice`,
`scheduleClipPost`, `detectSilencesAndFillers`.

### Phase 11 — Niche pipelines & remainder
L1 L2 L3 · C2 C3 C4 · N3 · `researchNicheStrategy` · E7 E8.

### Phase 12 — Frontend finalisation
Remove `@base44/vite-plugin`, drop `@base44/sdk` deps, env wiring (`VITE_API_BASE`),
`vercel.json`, monorepo workspace config.
- ✅ **Accept:** `grep -ri base44 apps/web/src` returns nothing.

### Phase 13 — Data cutover
Export the 25 live entities from Base44 → transform → load into D1 + R2. Verify row counts and
spot-check the largest `ProductionSettings` and `Scripts` rows.

---

## 5. Rules for Codex (put at the top of every prompt)

1. **Do not change behaviour.** No prompt text, model id, parameter, retry, timeout, copy,
   className, layout or UX flow may change. If something looks like a bug, leave it and
   note it in `MIGRATION-NOTES.md`.
2. **Do not change call signatures.** The shims exist so call sites stay untouched. If you
   find yourself editing a `.jsx` page to make a backend change work, stop — the shim is wrong.
3. **One function per file** under `workers/api/src/fn/`, named exactly as the old function.
4. **Port, don't rewrite.** Copy the Deno body; change only: the import header, the
   `Deno.serve` wrapper, `Deno.env.get(X)` → `env.X`, `base44.entities.*` → `db.*`,
   `base44.auth.me()` → the injected `user`, and provider base URLs.
5. **Never invent an env var.** The full key list is in `AUDIT.md §3`.
6. **When two duplicate versions of a function disagree, ask** — do not merge them.

### Deno → Worker port recipe
```ts
// BEFORE (Base44 / Deno)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const key = Deno.env.get('GEMINI_API_KEY');
  const scenes = await base44.entities.Scenes.filter({ project_id: body.project_id });
  …
});

// AFTER (Cloudflare Worker) — workers/api/src/fn/<name>.ts
import type { Ctx } from '../types';          // { env, db, user, ai, r2 }
export default async function handler(body: any, ctx: Ctx) {
  const { env, db, user, ai } = ctx;          // auth already enforced by middleware
  const key = env.GEMINI_API_KEY;             // routed via ai.ts in practice
  const scenes = await db.Scenes.filter({ project_id: body.project_id });
  …
  return { /* what used to go in Response.json */ };   // router wraps as { data }
}
```
Error handling: `throw new HttpError(status, message)` — the router converts it to
`{ error }` with that status, matching the old `Response.json({error}, {status})` exactly.

---

## 6. Open items to resolve during implementation
- **P5-spike:** Whisper word-timestamp quality (blocks F5, G4, G5).
- **D1 size:** confirm no surviving row exceeds 1MB after cold-field offload; re-measure on
  real data at Phase 13 and extend `registry.ts` cold list if needed.
- **`quickPublishTranscribe`** is a multi-action grab-bag (`bunny_config`, `submit`, `poll`,
  `clip_video`) called from `directApi.js`. Keep the action interface; swap Bunny→R2 and
  AssemblyAI→Whisper inside.
- **Runtime limits (revised after reading the call sites).** Workers cap **CPU time, not
  wall time**, and these functions are I/O-bound on Gemini/Claude — awaiting a slow API
  costs almost no CPU. Better still, the frontend already drives resumable loops:
  `ContentGeneration.jsx:534` loops on `generateScenePrompts` until `done === true`, with
  explicit 500/502/504 retry, and the backend processes `BASE_BATCH_SIZE = 12` scenes per
  invocation. Preserve those `done` / `remaining` contracts and no Durable Object, Queue
  or Workflow is required. What to actually watch: **subrequest count** (50 free / 1000
  paid — assume paid), genuine CPU work such as the heavy regex passes in
  `generateScenePrompts`, and the 300s client timeout in `apps/web/src/api/client.js`.
  Escalate only on an observed `Exceeded CPU limit` in `wrangler tail`.
