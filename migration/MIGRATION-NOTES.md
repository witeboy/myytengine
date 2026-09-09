# Migration notes

Append-only log. Anything noticed but deliberately not changed goes here, plus anything
that turned out differently from the plan.

---

## Owner decisions — all closed

Nothing is left open. Every finding from the design pass has been ruled on.

### Fixed

- **Scene assets are now re-hosted.** `pollSceneImage`, `pollSceneVideo` and
  `pollThumbnailBlend` previously wrote raw KIE URLs (`file.aiquickdraw.com`) into entity
  rows; those expire, so the rows eventually pointed at nothing. All three now
  `ingestUrl(..., { tier: 'durable' })` before the write. PHASE-7 §5.

- **Gender comes from the script.** `lib/gender.ts` derives it from the director's
  description of that character. When the description says nothing — or says both — no
  substitution happens. Neither original could produce that outcome; both invented a
  gender. PHASE-6 §3.3.

- **ffmpeg** runs in a Cloudflare Container (`workers/ffmpeg/`). Original flags copied
  verbatim. The in-browser path is untouched and stays the interactive default.

- **Media on Bunny with tiered retention.** `ephemeral/` swept at ~48h, `durable/` never
  on a timer, R2 cold storage separate.

### Tier rule — read this before adding any storage call

**If a URL is written into an entity row, the asset is `durable`.**

An earlier draft tiered scene images, thumbnails, voiceovers, music and SFX as
`ephemeral`. That was wrong: all of them are referenced by entity columns, and a project
may sit open for weeks. A 48h sweep would have emptied live projects — strictly worse
than the expiring provider URLs the re-hosting fixes. Only the export-time proxy cache is
genuinely `ephemeral`.

The 48h timer therefore applies to a small surface. The real cost lever for project media
is **`ARCHIVE_SWEEP_ENABLED`**: on the daily schedule, media belonging to projects marked
`archived` is deleted and the columns blanked. **Default off** — it removes generated
work, so it is never inferred. `Projects.archived` already exists and the Dashboard
already sets it.

### Model substitutions — decided, quality over cost

- `gemini-2.0-flash` → `gemini-2.5-flash`, **not** `gemini-3.1-flash-lite`. 39 call sites
  including the whole prompt engine. flash-lite is ~40% cheaper on output (the dominant
  cost), but a "lite" model doing nuanced visual direction is where a regression would be
  expensive and hard to attribute. Worth A/B-ing on real scene prompts once usage data
  exists — one line in `lib/models.ts`.
- `gpt-4o` → `gpt-5.4`, **not** `gpt-5-mini`. Only two live functions use it, so the 10×
  saving is noise and there is nothing to buy by risking Flow/Re-make output.

### Still open — but not blocking

- **`ImageProviderSelector.jsx:8` copy is now false.** It reads "Base44 image generation
  first, then your configured API fallback." Auto now runs the KIE cascade. User-visible
  text; owner to reword. PHASE-12 §5.
- **Whisper word-timing quality is unmeasured.** If it disappoints, adding an AssemblyAI
  key restores the original engine with no code change.

## Noted during design, deliberately unchanged

- **`enhancePrompt`** is byte-identical to `rephraseScenePrompt` and only an orphan calls
  it. Not ported.
- **`extract_best_moments`** in `quickPublishTranscribe` is dead — no caller. Dropped.
- **The OpenShorts manifest keeps its lost-update race** (concurrent saves, last writer
  wins). Preserved from the Bunny original. The fix would be a real table, not a lock.
- **`voiceover_chunks` / `voiceover_total_chunks`** on `ProductionSettings` are almost
  certainly vestigial — AI33 accepts 1,000,000 characters per TTS call. Still written on
  every path; left alone.

## Codex log

_Append below as you work. One line per thing you noticed and did not change, and one
per deviation from a phase doc._

- 2026-09-06 — Phase 0 blocked before repository changes: the selected repo root contains only the migration bundle; the Base44 export (`src/`, root `package.json`, and `base44/functions/`) is not present, so restructuring, deduplication, build, lint, and live-app verification cannot be performed.
- 2026-09-07 — `analyzeViralMoments`: kept manifest canonical `base44/functions/analyzeViralMoments/entry.ts`; rule 2 (provider/model superset) and rule 3 (newer model path) decided it.
- 2026-09-07 — `generateSceneBreakdown`: kept manifest canonical `base44/functions/generateSceneBreakdown/entry.ts`; rule 0 decided it because `src/lib/directApi.js` sends `__claude_passthrough` and consumes its `{ text }` response, which only this version implements.
- 2026-09-07 — `fixScenePrompts`: kept manifest canonical `base44/functions/fixScenePrompts.ts`; rule 1 confirmed the same-contract deepest copy, while `base44/functions/fixScenePrompts/entry/entry.ts` is a misfiled `explainerSceneBreakdown` handler with a different contract and was deleted as a duplicate-path misfile.
- 2026-09-07 — `pollSceneImage`: kept manifest canonical `base44/functions/pollSceneImage.ts`; rule 0 decided it because `src/pages/ContentGeneration.jsx` reads `pollData.errors`, which only the root file returns. The owner's parenthetical `entry.ts` label was inconsistent with both the manifest and verified file contents, so the call-site evidence controlled.
- 2026-09-07 — `generateScriptBatches`: kept manifest canonical `base44/functions/generateScriptBatches.ts`; rule 3 decided it because its descriptive `v6 — Sleep story FULL REWRITE` header supersedes both `v4` alternatives and explains the intentional two-way prompt replacement.
- 2026-09-07 — `shortsSceneBreakdown`: kept manifest canonical `base44/functions/shortsSceneBreakdown/entry.ts`; rule 2 (31-versus-5 prompt expansion) plus the identical deepest copy decided it. The extra `sentence_count` response field is not consumed by the frontend.
- 2026-09-07 — `explainerSceneBreakdown`: **manifest error** — kept `base44/functions/explainerSceneBreakdown/entry.ts` and rejected manifest-selected `base44/functions/explainerSceneBreakdown.js`; rule 0 decided it because `src/pages/ContentGeneration.jsx` sends `start_section` and loops on `next_section`, supported only by the section-batched `entry.ts` version. Do not re-apply the manifest selection for this function.
- 2026-09-07 — `callClaudeProxy`: kept manifest canonical `base44/functions/callClaudeProxy/entry.ts`; rule 0/2 decided it because it preserves the live prompt contract and adds the asset-proxy action without removing that path.
- 2026-09-07 — `detectFaceRegion`: kept manifest canonical `base44/functions/detectFaceRegion/entry/entry.ts`; rule 4 decided it after confirming the retained frontend sends only `image_base64` and consumes fields shared by both live-compatible versions.
- 2026-09-07 — `extractCharacterDNA`: kept manifest canonical `base44/functions/extractCharacterDNA/entry.ts`; rule 3 decided it because its descriptive v3 Gemini-primary/Claude-backup header supersedes v2.
- 2026-09-07 — `generateFullScript`: kept manifest canonical `base44/functions/generateFullScript/entry/entry.ts`; rule 2 decided it because it preserves merge mode and adds `init_explainer`.
- 2026-09-07 — `generateProgressionImage`: kept manifest canonical `base44/functions/generateProgressionImage/entry/entry.ts`; rule 2 decided it because it retains the reference-chain path and adds the later handling present only in the larger version.
- 2026-09-07 — `generateProgressionVideo`: kept manifest canonical `base44/functions/generateProgressionVideo.ts`; rule 4 decided it after the retained call-site contract matched and neither version had a decisive descriptive v3+ header.
- 2026-09-07 — `generateSceneImage`: kept manifest canonical `base44/functions/generateSceneImage.ts`; rule 0 decided it because retained callers send `preferred_provider`, which the z-image-only duplicate does not handle.
- 2026-09-07 — `generateScenePrompts`: kept manifest canonical `base44/functions/generateScenePrompts.ts`; rule 4 decided it after confirming matching call-site contracts and no decisive descriptive version header.
- 2026-09-07 — `generateSeoDescriptions`: kept manifest canonical `base44/functions/generateSeoDescriptions/entry.ts`; rule 3 decided it because its Gemini-to-Claude migration is the newer provider path.
- 2026-09-07 — `generateSeoTitlesDescriptions`: kept manifest canonical `base44/functions/generateSeoTitlesDescriptions.ts`; rule 4 decided it after matching contracts and no descriptive v3+ version marker.
- 2026-09-07 — `generateThumbnailImage`: kept manifest canonical `base44/functions/generateThumbnailImage.ts`; rule 2 decided it because it contains the AI33 SeedDream primary plus Ideogram fallback paths. The only `char_photos` callers belong to the Phase 0-dropped Quick Publish feature.
- 2026-09-07 — `generateVoiceover`: kept manifest canonical `base44/functions/generateVoiceover/entry/entry.ts`; rule 0/3 decided it because the retained voiceover panel sends both `voice_category` and `provider`, and this is the descriptive v3 three-path implementation.
- 2026-09-07 — `initializeScriptBatches`: kept manifest canonical `base44/functions/initializeScriptBatches.ts`; rule 4 decided it after confirming the retained `project_id` call contract and its matching sleep-story rewrite pipeline.
- 2026-09-07 — `listVoicesByProvider`: kept manifest canonical `base44/functions/listVoicesByProvider/entry/entry.ts`; rule 4 decided it because all retained callers use the shared `source` input and read only `voices`.
- 2026-09-07 — `longViralGenerateScript`: kept manifest canonical `base44/functions/longViralGenerateScript/entry/entry.ts`; rule 4 decided it after matching the retained call contract and finding no decisive descriptive version header.
- 2026-09-07 — `longViralSceneBreakdown`: kept manifest canonical `base44/functions/longViralSceneBreakdown/entry.ts`; rule 0 decided it because `ContentGeneration.jsx` sends `start_batch` and loops on partial responses.
- 2026-09-07 — `pollVoiceover`: kept manifest canonical `base44/functions/pollVoiceover.ts`; rule 4 decided it because the retained caller's `status`/`voiceover_url` contract is preserved and the root keeps the broader response handling.
- 2026-09-07 — `proxyFetchAsset`: kept manifest canonical `base44/functions/proxyFetchAsset/entry/entry.ts`; rule 0 decided it because retained callers consume inline `data`, which the older duplicate does not return.
- 2026-09-07 — `quickPublishTranscribe`: kept manifest canonical `base44/functions/quickPublishTranscribe/entry.ts`; rule 0/2 decided it because retained `OpenShorts` and `directApi` callers use its submit, poll, clip, and Bunny actions.
- 2026-09-07 — `selectHook`: kept manifest canonical `base44/functions/selectHook/entry/entry.ts`; rule 0 decided it because `timeline/useVideoExport.jsx` sends `action: 'proxyAsset'` and reads inline `data`.
- 2026-09-07 — `shortsGenerateScript`: **manifest error** — kept `base44/functions/shortsGenerateScript/entry/entry.ts` and rejected manifest-selected root `.ts`; rule 3 decided it because the duplicate has the descriptive v3 migration header and identifies itself as engine v5, while the root is engine v4 with the non-semantic `v2 — redeployed` stamp.
- 2026-09-07 — `sleepSceneBreakdown`: kept manifest canonical `base44/functions/sleepSceneBreakdown/entry/entry.ts`; rule 3 decided it because its descriptive v5 Gemini-primary/Claude-fallback header supersedes v3.
- 2026-09-07 — `submitTranscription`: **manifest error** — kept `base44/functions/submitTranscription/entry.ts` and rejected manifest-selected root `.ts`; rule 0 decided it because `src/lib/transcribeASR.js` reads `transcript_id` and then polls, and only `entry.ts` implements that live contract. The descriptive v5 header confirms the selection.
- 2026-09-07 — Phase 0 acceptance-gate cleanup: removed remaining dead-feature launch controls from `NewProject` and `ChannelsHub`, removed stale dashboard routing special-cases, and reworded one retained-code comment so the required dropped-feature grep is clean. `QuickShortcuts` also lost its dead Quick Publish tile because its page is deleted and the acceptance gate explicitly forbids that identifier.
- 2026-09-07 — Updated the generated dedup manifest and the Phase 6/8 batch source paths for the three verified manifest exceptions (`explainerSceneBreakdown`, `shortsGenerateScript`, `submitTranscription`) so later tooling cannot re-apply the rejected selections.
- 2026-09-07 — Removed retained-component imports and controls for deleted `AutoEditButton` and `ClipAutoPublish`; the first Phase 0 build caught these two stale references after their feature files were pruned.
- 2026-09-07 — Ran the repository ESLint fixer to remove 114 unused imports exposed by the Phase 0 lint gate. This was import-only mechanical cleanup; existing unused-variable warnings remain non-blocking under the prescribed `eslint . --quiet` command.
- 2026-09-08 — Phase 1 media configuration uses the provisioned R2 buckets and `https://media.radiantmemory.ca`; the unused Bunny variables were left empty so no placeholder or Bunny credential is mistaken for a live dependency.
- 2026-09-08 — Phase 1 Neon documentation drift: the current Neon dashboard provisions Better Auth and exposes a direct issuer/JWKS URL, not the document's legacy Stack Auth project URLs. The Worker is configured against the live Neon Auth issuer/JWKS, Neon remains AUTH ONLY, and Phase 3 must reconcile the provided `@stackframe/react` frontend adapter before auth integration proceeds.
- 2026-09-08 — Wrangler v4 warns that the provided container instance type `standard` is now named `standard-1`; retained the supplied configuration during Phase 1 unless deployment proves the legacy alias is rejected.
- 2026-09-08 — Phase 1 host limitation: Docker CLI/daemon is unavailable, so Wrangler cannot build the supplied ffmpeg image. The API is deployed with `--containers-rollout=none` for the Phase 1 health/CORS gate; the container binding/config remains intact and its image rollout must be completed before ffmpeg-dependent execution is accepted.
- 2026-09-08 — Phase 1 tooling correction: the supplied `workers/api/package.json` pinned Wrangler 3 even though the supplied `[[containers]]` syntax requires Wrangler 4. Updated the workspace dev dependency to Wrangler 4.129.1; the documented `npm run db:init:local` and `npm run db:init` commands now execute successfully.
- 2026-09-08 — The Phase 1 Vercel deployment loads, but its retained Base44-era runtime currently logs repeated `filter/map is not a function` errors. This is not a CORS failure and was not altered during provisioning; investigate while replacing the Base44 data/auth adapter in Phases 3–4.
- 2026-09-08 — Phase 1 gate passed: `myytengine-api.tolu-adebisi.workers.dev/api/health` returned HTTP 200 with `{data:{ok:true,...}}`; GET and OPTIONS probes carrying Origin `https://myytengine.vercel.app` returned that exact `Access-Control-Allow-Origin`. Remote D1 contains the expected 27 tables; Neon Postgres remains untouched.
- 2026-09-08 — Phase 2 placed the supplied frontend compatibility client files unchanged (apart from line-ending normalization): the existing `@/api/base44Client` path now re-exports the Cloudflare API client, so retained call sites were not edited.
- 2026-09-08 — Phase 2 dependency rationale: upgraded the existing `@cloudflare/vitest-pool-workers` dev dependency from 0.5 to 0.22 and Vitest from 2 to 4.1. The supplied versions predate current remote-binding support; the mandated pool package now runs the same suite against local bindings and the provisioned remote D1/R2 bindings without adding a test-only API route.
- 2026-09-08 — Phase 2 test configs use compatibility date `2026-08-22`, the newest date supported by `@cloudflare/vitest-pool-workers@0.22.0`'s bundled workerd. This is test-only; the production Worker compatibility date and behavior were not changed.
- 2026-09-08 — Phase 2 acceptance passed: all nine D1/R2 parity cases passed locally and against remote bindings, including partial merges, attrs overflow, promoted `UploadMetadata.record_type`, type preservation, ordering, and the >64 KB cold-field round-trip plus purge. Remote cleanup left the four exercised tables empty.
- 2026-09-08 — `npm install` reports 29 transitive dependency advisories (2 low, 8 moderate, 18 high, 1 critical). No automatic audit fix was applied because that could introduce behavior-changing upgrades outside this migration phase.
- 2026-09-08 — Phase 3 documentation correction: Neon replaced its legacy Stack Auth integration with Managed Better Auth. The supplied `@stackframe/react` adapter and `VITE_STACK_*` variables were not installed; the SPA now uses the current `@neondatabase/neon-js` React adapter plus `@neondatabase/auth-ui` and the branch's single `VITE_NEON_AUTH_URL`, as prescribed by Neon's current React and legacy-auth migration guides.
- 2026-09-08 — Phase 3 dependency rationale: added `@neondatabase/neon-js@0.7.0-beta` for the branch-aware Managed Better Auth session/JWT client and `@neondatabase/auth-ui@0.3.0-beta` for the sign-in/sign-up handler views. These are Neon's current documented packages; `@stackframe/react` would target the retired provider contract provisioned by neither the live project nor the current Neon console.
- 2026-09-08 — Phase 3 Worker auth correction: the live JWKS reports `kty=OKP`, `alg=EdDSA`, `crv=Ed25519`; added Ed25519 verification and corrected issuer/audience validation to the Neon Auth host origin. A generated Ed25519 JWT test now exercises this exact contract, and all 10 Worker tests pass.
- 2026-09-08 — Phase 3 partial gate: the deployed signed-out SPA redirects to `/handler/sign-in` with no browser warnings, and unauthenticated production requests to both `/api/db/*` and `/api/fn/*` return HTTP 401 with the Vercel CORS origin. The signed-in Dashboard and sign-out checks remain pending a trusted-domain update and a test user/session.
- 2026-09-08 — The broad `apps/web` JavaScript typecheck remains non-gating because it reports the existing generated JSX prop-inference backlog across many retained pages plus Phase 2 client JS inference. Phase 3's production bundle, full ESLint gate, Worker typecheck, and focused auth/parity tests pass; no unrelated page typings were changed.
- 2026-09-08 — Phase 3 same-origin auth correction: a direct Vercel external rewrite to Neon Auth returned `INVALID_HOSTNAME` because the original host header was preserved. Added a streamed `/api/neon-auth/*` Worker relay, rewrote the SPA's `/api/auth/*` path through it, removed upstream cookie `Domain` attributes, and retained all other response headers (including Neon's JWT header). This also avoids relying on third-party cookies for the production session.
- 2026-09-08 — Phase 3 types-only dependency correction: upgraded `@cloudflare/workers-types` to `5.20260908.1` so the relay's standards-based `Headers.getSetCookie()` use is represented by the current Worker type definitions. Runtime dependencies were not changed by this upgrade.
- 2026-09-08 — Phase 3 trusted-domain and test-user gate: added `https://myytengine.vercel.app` to Neon Auth trusted domains. Created disposable users `phase3-gate-20260908132820@myytengine.invalid` and `phase3-gate-20260908190039@myytengine.invalid`; the second replaces the first only for testing because the first one's intentionally unpersisted password was lost when the browser-control session reset. Neither user was deleted because deletion was not authorized.
- 2026-09-08 — Phase 3 SDK correction: the Managed Better Auth React adapter does not expose a `token()` client action. It injects the short-lived JWT from the `set-auth-jwt` response header into `getSession().data.session.token`; the API token provider now resolves that supported value at request time, avoiding a first-render null-session race.
- 2026-09-08 — Phase 3 acceptance passed in production: signed-out `/` redirects to `/handler/sign-in`; the disposable user signs in and reaches the Dashboard with D1-backed zero-count cards and no browser warnings/errors; the browser sends a JWT that passes Worker Ed25519 issuer/audience verification; `/handler/sign-out` clears the session; and revisiting `/` redirects to sign-in. Local gates are Worker typecheck, 11/11 Worker tests, web ESLint, web production build, and `git diff --check`. Production versions: Worker `0b720820-5284-4b4f-9350-886982216211`, SPA `dpl_E3XG6HsNTPW5G4SY2k6xHk8pdW7G`.
- 2026-09-08 — Phase 4 supplied-client correction: `apps/web/src/api/client.js` still contained the retired `KNOWN_FLAT`/`resolvedShape` compatibility branch and stripped `/entry` suffixes, contradicting Phase 4's explicit zero-match gate. Removed that normalization so function names are sent directly to `/api/fn/:name`.
- 2026-09-08 — Phase 4 supplied-key-route correction: `POST /api/keys/set` returned only `{ provider, configured }`, while the phase requires the write response itself to return a masked hint. Added `hintOf(value)` to the response and regression coverage proving neither the write nor list response exposes plaintext, ciphertext, or IV.
- 2026-09-08 — Phase 4 CORS hardening: an adversarial live probe found that an unapproved Origin received the first configured origin instead of receiving no allow-origin header. Browsers still rejected the mismatch, but this did not express the exact-origin policy correctly. `corsHeaders` now emits `Access-Control-Allow-Origin` only for an exact configured match; regression tests cover allowed, disallowed, absent, and wildcard-free behavior.
- 2026-09-08 — Phase 4 live test fixture: the disposable Phase 3 account stores the non-secret Worker URL under `COBALT_API_URL` solely to exercise encrypted persistence, masked reload hints, Test All, and the configured-provider health row without transmitting a real provider credential. It is not a production Cobalt endpoint and must be replaced or removed before Clip Extractor execution.
- 2026-09-08 — Phase 4 acceptance passed in production: Settings renders the complete grouped catalog and tier badges; deliberately invalid input fails its probe; the owner configured CheaperInference, KIE.ai, and AI33.pro and each live probe succeeds; Test All reports all four configured entries successful; a full reload leaves all 13 entry fields empty and shows masked hints only; and remote D1 reports four non-empty ciphertext/IV rows with four masked hints. Dashboard health reports `9 OK` with D1, both R2 buckets, model mapping, ffmpeg binding, and every configured provider. No plaintext provider credential was read into logs, shell output, or repository files. Production versions remain Worker `b3032956-f0b0-4858-98e4-33d7ca43f54e` and SPA `dpl_BSXrb8xC3WJVhfQcp1aoP7te8Cbt`.
- 2026-09-09 — Phase 5 bundle correction: `MIGRATION-PLAN.md` requires `lib/youtube.ts` and `lib/stock.ts`, but neither file existed in the supplied migration tree. Added thin raw-response adapters for the retained read-only YouTube Data API and Pexels/Pixabay request paths; upload/publish behavior remains absent as required by Phase 0.
- 2026-09-09 — Phase 5 adapter smoke found and fixed two contained normalization defects: the OpenAI convenience wrapper now applies the same aggregator-only model remapping as `openaiFetch`, and KIE `recordInfo` now includes `.video_url` in `urls` instead of allowing an empty-array fallback to short-circuit it.
- 2026-09-09 — Phase 5 ASR spike: direct binary REST inference with `@cf/openai/whisper-large-v3-turbo` returned 90 genuine `{word,start,end}` objects, but its Workers AI binding rejected the documented string/array/structured-binary forms in both remote tests and a temporary deployed Worker. The prescribed fallback `@cf/deepgram/nova-3` accepted the same audio stream through the binding and returned 87 genuine word timestamps. `lib/asr.ts` now uses Nova-3 internally while preserving the existing `submit`/`poll` interface and `workers-ai` setting value. The isolated `myytengine-phase5-smoke` Worker was deleted after the measurement.
- 2026-09-09 — Phase 5 acceptance passed: all eight named adapter modules are present; the deterministic adapter suite hits AI, ASR, R2, KIE, AI33, YouTube, stock, and HTTP response shapes (26/26 total Worker tests), Worker typecheck passes, the live remote ASR smoke passes with 87 word timestamps, and Phase 4's live provider probes remain green for the configured CheaperInference, KIE, and AI33 credentials.
- 2026-09-09 — Deployed the Phase 5 adapter checkpoint as Worker version `1f90221b-1540-42ec-a877-8f2a7a2c01f0` with container rollout still disabled. Production `/api/health` returned HTTP 200 `{data:{ok:true}}` and the exact Vercel CORS origin after deployment.

