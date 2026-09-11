# Claude master handoff — finish myytengine migration

Status snapshot: 10 September 2026. Verify live state before acting; this describes the last observed state, not a guarantee that deployments or browser sessions have stayed unchanged.

## Your assignment

Take over the existing myytengine migration from Base44 to Vercel + Cloudflare Workers, finish verification and integration, then complete Phases 12 and 13. Work on the existing implementation, preserve working changes, and continue autonomously through authorized implementation, testing, deployment, and checkpoint commits. Report concrete blockers instead of claiming a phase passed because its code compiles.

The owner has repeatedly authorized continuation through Phases 5–13 and deployment. The owner has now explicitly authorized pushing to GitHub; the earlier “do not push yet” instruction is superseded. This does not authorize force-pushing, deleting the Base44 app, wiping existing D1 data, or discarding local work.

## 1. Start in the correct checkout

Local Windows repo:

`C:\Users\user\Documents\Codex\2026-09-06\files-mentioned-by-the-user-migrationnotes`

GitHub: `https://github.com/witeboy/myytengine.git`

Branch: `main`

GitHub and local committed HEAD were verified equal at:

`e84353ec0b4e73e82d81c291361af15185ca55b5`

**Critical: a fresh GitHub clone is missing the uncommitted Phase 11 work.** Use the local checkout when possible. If you only have a cloud checkout, obtain the listed working files from the owner/local environment before proceeding. This prompt describes those edits but does not contain their full source. Do not regenerate completed batches over adapted handlers or assume the deployed application matches GitHub HEAD.

An accompanying `myytengine-claude-handoff-*.zip`, if attached, contains this prompt and the 13 working files listed below at their repository-relative paths. It is an overlay, not a full repo. Inspect it and apply it to the matching GitHub checkpoint in a clean checkout; do not blindly overwrite a checkout containing newer work. It excludes credentials, dependencies and user data.

Run `git status --short`, inspect the diff and untracked files, and check for any applicable `AGENTS.md`. Preserve overlapping work. Do not use reset/checkout to clear it.

Read these documents in full before implementing:

1. `migration/START-HERE.md`
2. `migration/codex/00-PREAMBLE.md` — apply before each phase.
3. `migration/MIGRATION-NOTES.md` — owner decisions and actual migration findings.
4. `migration/codex/PHASE-9-10-11.md`
5. `migration/codex/PHASE-12.md`
6. `migration/codex/PHASE-13.md`
7. `migration/codex/FFMPEG.md` when addressing server-side video.

Read `MIGRATION-PLAN.md`, `AUDIT.md`, `PORT-RECIPE.md` and other referenced instructions as needed. Prefer verified code and recorded owner decisions over stale assumptions in the original migration bundle. Log contradictions explicitly.

## 2. Non-negotiable migration rules

- This is a runtime/storage migration. Preserve original generation prompts, pinned model IDs, parameters, temperatures, schemas, retries, timeouts, signatures, response fields and UI flow unless the owner or phase explicitly directs a change.
- Fix migration-introduced adapter/runtime defects. Record unrelated original bugs rather than quietly redesigning behavior.
- The frontend is ground truth for inputs it sends and response fields it reads. Do not alter JSX call sites merely to accommodate a wrong backend contract; fix the adapter.
- One handler per `workers/api/src/fn/<name>.ts`, registered under its original name in `registry.ts`.
- Never merge duplicate versions. The dedup audit is closed; do not repeat it or restore rejected files. The manifest and batch source paths were corrected. In particular, keep the section-batched `explainerSceneBreakdown/entry.ts`, the corrected `shortsGenerateScript` source, and asynchronous `submitTranscription/entry.ts`. `analyzeViralMoments/entry.ts` remains canonical.
- `// v2 — redeployed` is a mass redeployment stamp, not proof of a later version. Descriptive v3+ headers and actual call sites outrank size.
- Provider keys are BYOK, encrypted in D1. Never embed them in source, frontend environment variables, handoff documents, or logs.
- Never generate a replacement `KEYVAULT_MASTER_KEY` for the existing vault. The original is already set as a Worker secret. The owner was told to back it up; loss makes existing stored API keys undecryptable. Confirm secure backup status without printing its value.
- Neon is AUTH ONLY. Do not migrate application tables into Neon Postgres.
- If a media URL is persisted in an entity or project manifest, use `tier: 'durable'`. Keep archive deletion disabled. `ARCHIVE_SWEEP_ENABLED=false` is intentional.
- Use scoped, reviewable edits and checkpoint commits. Do not blindly stage credentials, production data exports, or unrelated files.

Preserve the four contracts:

- C-1: functions return `{ data }`; failures use `{ error }` plus HTTP status.
- C-2: entity filters return arrays, updates partially merge, writes return complete rows.
- C-3: typed columns plus `attrs` JSON preserve schemaless fields.
- C-4: designated cold fields exceeding 64 KB offload to R2 and hydrate on reads.

## 3. Infrastructure and provider routing

- SPA: `https://myytengine.vercel.app`
- Worker: `https://myytengine-api.tolu-adebisi.workers.dev`
- Health: `GET /api/health`
- Cloudflare account ID: `902e34ea24639ebe15562116add415bd`
- D1 database: `myytengine`
- D1 ID: `cf8429cf-dcc7-40ec-8129-5f4941bcd3d5`
- AI Gateway ID: `myytengine`
- R2 MEDIA bucket: `myytengine-media`
- R2 COLD bucket: `myytengine-cold`
- Media public base: `https://media.radiantmemory.ca`
- Production uses `MEDIA_BACKEND="r2"`, despite older Bunny wording in supplied docs.
- Vercel project ID: `prj_Z6ZAAagcXivu0KXeRE8YNgc484el`
- Vercel team ID: `team_pQUUZaPX4iTPB153Tzl71lsZ`

LLM text/vision uses CheaperInference through `lib/ai.ts` with `CHEAPER_INFERENCE_API_KEY`. `AI_PROVIDER_MODE="aggregator"` is the default. Gateway mode remains an escape hatch. Use `hasAiProvider(ctx, provider)` for logical availability checks: checking only direct Gemini/Claude/OpenAI keys breaks aggregator-only accounts. Keep routing decisions out of ported handlers. Model substitutions live in `lib/models.ts`; retain pinned source model IDs.

Image/edit/video generation uses KIE. Voice generation, music and SFX use AI33. ASR uses AssemblyAI when selected/configured, otherwise Workers AI. **Actual Workers AI implementation uses `@cf/deepgram/nova-3`, not Whisper**: Phase 5 proved genuine word timestamps through Nova-3 after Whisper binding-input failures. Preserve `workers-ai` setting and submit/poll response contracts. Some existing copy still says Whisper; do not undo the tested implementation based on that label.

Neon authentication is Managed Better Auth, not the obsolete Stack Auth configuration from the bundle. The SPA uses Neon SDKs and the same-origin `/api/auth/*` rewrite through the Worker's `/api/neon-auth/*` relay. Keep that relay and rewrite. JWT verification supports Ed25519 with configured issuer/audience/JWKS. Use the current public Neon auth variable rather than resurrecting `VITE_STACK_*`.

Last confirmed deployments, before subsequent Git-push automation may have run:

- Worker `c1da059e-5304-43d5-9595-132f7ba7a410`: includes Phase 11 and the response-schema adapter correction.
- Vercel `dpl_4QjAtuxWQX5vqWaWG3Dsjza11bBw`: READY, aliased to production; includes cloud-client cleanup.

Check deployment history before redeploying or rolling back. A push may trigger a Git-integrated deployment; do not let older committed code unintentionally replace newer verified working-tree changes.

## 4. Committed and pushed checkpoints

All these commits are now on GitHub `main`:

| Commit | Work |
|---|---|
| `964a0bf7` | Phase 0: monorepo restructure, function dedup 283→111, dropped-feature pruning |
| `f944a30b` | Phases 1–4: infrastructure, D1/R2 parity, Neon auth, compatibility client, BYOK |
| `74f7b8bb` | Phase 5: provider adapters and genuine ASR word timestamps |
| `744a3d9f` | Phase 6: core text generation pipeline |
| `69ed72ea` | Phase 7: image/video generation and durable media |
| `63a48df4` | Phase 8: audio, transcription, durable uploads and owner-requested voiceover UI |
| `567e7559` | Phase 9: thumbnail analysis and LLM plumbing |
| `e84353ec` | Phase 10: clip analysis, durable downloads, scheduling |

**A commit is a restorable checkpoint, not proof that every deferred live gate passed.** Phases 7–10 have explicitly documented cross-phase/deferred acceptance checks.

Completed evidence:

- Local and remote D1/R2 parity: partial merges, overflow fields, IDs, types, cold-field hydration/purge.
- Production sign-in/sign-out, JWT verification, unauthenticated API rejection, exact-origin CORS.
- BYOK encrypted storage and masked responses; real configured provider probes.
- Real project script → scene breakdown → prompts: 89 scenes reached `prompts_ready` during the Phase 6 gate.
- A real scene image and animation were generated, polled, displayed and persisted on the owned media domain.
- Browser exports at 480p and 1080p completed and played, but were below 10 MB because most scenes had no media. This does NOT close the >10 MB multipart gate.
- Live audio catalog/preview, generated narration, music and SFX worked and used durable URLs.
- OpenShorts uploaded `yes.mp4`, stored it in R2, and completed transcription. It then failed on missing `analyzeViralMoments`, which is now ported; retry is still needed.
- Phase 9: 3 handlers, all 19 strings preserved; Phase 10: 6 handlers, actual AI prompts preserved. Download storage replacement intentionally removed three retired log/error strings, documented in notes.
- `scheduleClipPost.process` marks due posts `ready_to_post`; it does not publish. The source's old `youtubeAuth.uploadVideo` branch was removed because the phase explicitly forbids publishing.

## 5. Owner-requested voiceover change — implemented, finish verification

The owner asked to discard the separate MiniMax-via-AI33 and Inworld cards shown in screenshots and allow personal voiceover uploads in Content Generation.

Implemented in `apps/web/src/components/script/VoiceoverPanel.jsx` and deployed:

- Removed those two unwanted UI sections.
- Added “Use your own voiceover” with supported audio selection, filename/size validation, local preview and upload progress/error handling.
- Upload uses authenticated `Core.UploadFile` → `/api/upload` → durable R2.
- Saves `ProductionSettings.voiceover_url`, `voiceover_status='completed'`, `selected_voice_id='uploaded'`, and clears stale generation state.
- Mirrors the URL onto the project and supports playback after reload.

Local MP3 selection/preview was observed, but the final “Use this voiceover” persistence and timeline/export consumption were NOT verified end to end. Use an owner-approved sample or a clearly controlled test fixture. Do not overwrite the owner's active narration without a recoverable plan. Verify duration detection, playback after reload, timeline audio, captions/ASR where appropriate, and exported audio. Keep AI33's remaining working voice option.

## 6. Uncommitted Phase 11 and integration work — preserve it

Modified tracked files at handoff:

```
apps/web/src/lib/renderShortCloud.js
workers/api/src/fn/registry.ts
workers/api/src/lib/ai.ts
workers/api/test/phase9.spec.ts
```

New working files:

```
workers/api/src/fn/autoBrollPopulate.ts
workers/api/src/fn/generateSeoDescriptions.ts
workers/api/src/fn/generateSeoTitlesDescriptions.ts
workers/api/src/fn/generateTopics.ts
workers/api/src/fn/parseAndScheduleTopics.ts
workers/api/src/fn/researchNicheStrategy.ts
workers/api/src/fn/searchBrollVideos.ts
workers/api/src/fn/sleepBrollPopulate.ts
workers/api/test/phase11.spec.ts
```

This handoff document is also newly created and is not part of the pushed checkpoint.

Phase 11 batch result: 8/8 passed, 50 strings preserved, zero generated manual items. Additional inspection still found real migration defects and corrected them:

- Shared-key availability instead of requiring direct provider keys.
- Missing `ctx` propagation through SEO tag/hashtag and provider-fallback helpers.
- Two invalid codemod `HttpError(..., raw: ...)` statements corrected to the standard error envelope. Raw output remains logged by the existing statements.
- `renderShortCloud.js` had two remaining calls to deliberately dropped Creatomate handlers. It now directly uses its existing basic ffmpeg clip fallback, preserving its return shape; no paid renderer was reintroduced.
- `lib/ai.ts` originally accepted `response_json_schema` but never transmitted its contents. In the live thumbnail summary flow the model returned a non-string summary, causing `summary.trim` to crash the form. The adapter now includes the supplied JSON Schema in its system instruction while keeping the caller's prompt unchanged. A regression test asserts schema forwarding. The corrected Worker is deployed, but a successful live rerun was not observed before browser sessions ended.

Latest checks: **42 tests passed across 10 Worker test files**, Worker typecheck clean, web lint/build clean, and `git diff --check` clean. Tests cover nested thumbnail/clip inference, Gemini fallback, thumbnail persistence, Cobalt media rehosting/URL aliases, scheduling without publishing, full SEO package→description persistence, and auto-b-roll 20-scene resume behavior.

Important verification caveat: many faithful JavaScript ports use `@ts-nocheck`. A clean typecheck alone is not enough. A separate in-memory TypeScript audit with suppression removed found zero missing-name/arity diagnostics in Phase 10–11 after the fixes. Keep exercising nested helpers and runtime branches rather than trusting suppression.

Registry contains **67 handlers and 67 handler files**, not the document's expected 66. The earlier literal-call audit found only the two Creatomate names, subsequently removed in the local cloud-client cleanup. Re-run the complete literal and dynamic call audit cleanly; the very last attempted rerun had a syntax typo in the diagnostic command, so do not cite that attempt as a pass.

Update the Codex log with these Phase 11 findings and acceptance evidence, then commit and push the verified work. Do not label the combined live gate complete prematurely.

## 7. Exact remaining acceptance work

### A. Close combined Phase 9–11 live checks

- Thumbnail summary returns a string and the form stays mounted after the adapter fix.
- Create concepts, render an image, poll to completion, reload, and confirm persisted durable URL.
- Use an existing generated scene via “Select from Generated Scenes” to avoid needing a new photo upload. This option was found and selected successfully; it is available on the Apollo test project below.
- Generate topics; import channel topics; schedule a topic to a calendar day.
- Create a controlled test channel and confirm `researchNicheStrategy` saves its strategy.
- PostProduction: titles/tags/hashtags and descriptions generate and persist after reload.
- Clip Extractor: real YouTube URL → actual Cobalt download → transcription → viral moments → playable clip.
- OpenShorts: retry the earlier upload/transcription/analysis path; verify project save/list/reload/delete on a clearly disposable fixture and preserve user projects.
- Auto B-roll: a scene lacking footage becomes populated; verify the real frontend loop completes. Confirm both dynamic handler names resolve.
- HealthCheck: D1, both R2 buckets and actually configured provider keys; investigate misleading success rows rather than treating existence of a binding as proof of a running service.

Observed UI state at interruption: the Phase 8 fixture's SEO flow reached “Phase 2: Generating descriptions...”. Titles had progressed, but completed description output was not observed. On the Apollo project, a generated scene and “Beast Formula — Arrow Object Showcase” template were selected while auto-summary was pending. Temporary browser tabs were subsequently unavailable. Reopen fresh tabs; do not reuse stale tab IDs or claim these operations finished.

### B. Resolve known discrepancies/blockers

1. **Cobalt:** a disposable test account has the Worker URL stored as `COBALT_API_URL` solely for the old vault round-trip test. This is NOT a working Cobalt server. Inspect the current user's configuration. Obtain or provision a real approved Cobalt endpoint; never substitute an arbitrary public server or treat the fake fixture's HTTP 200 as successful downloading.
2. **ffmpeg deployment:** Docker was unavailable on this Windows host. Deployments used `npx wrangler deploy --containers-rollout=none`, which does not build or roll out the ffmpeg container. The container Dockerfile/Go server/DO binding exist but runtime acceptance is open. Resolve Docker/build capability or an approved build environment, then deploy and prove health/probe/6-second 720×1280 clip with audio.
3. **ffmpeg storage mismatch:** `workers/api/src/lib/ffmpeg.ts` still constructs a Bunny upload target while production media uses R2 and Bunny configuration is empty. Installing Docker alone will not fix cloud clipping. Reconcile the container output path with the established R2 architecture without exposing storage credentials to the browser or changing ffmpeg flags. `ffmpegAvailable()` currently checks only that the binding exists; that can falsely report an undeployed container healthy. The supplied documentation's claim that a skipped container rollout makes the binding undefined is unreliable.
4. **Sleep b-roll document mismatch:** `autoBrollPopulate` genuinely has the documented 20-scene invocation limit and `{populated,total,remaining,done}` response. The selected `sleepBrollPopulate` source processes its scene batches in one call and returns `{success,populated,total,results}` with no `done`/`remaining`. It was ported faithfully. Check actual frontend behavior and record/resolve this discrepancy under the preservation rule; do not claim both implementations already share the documented resume contract or silently rewrite the sleep algorithm.
5. **Storage grep drift:** server-only optional Bunny support remains in shared storage/ffmpeg files by prior design; R2 is selected in production. Historical `bunny_*` OpenShorts action names are compatibility contracts, not proof of browser credentials. Do not blindly delete them to satisfy stale greps.
6. **Multipart/export gate:** finish the >10 MB upload/export test with a complete-media fixture; prior short exports did not qualify.

### C. Phase 12 — only after the app's preceding gate is satisfied

- Read preamble and phase doc again for execution.
- Remove the dead frontend Deno proxy and old app-parameter reader after checking imports.
- Run `migration/tools/debase44.mjs` dry-run, then its exact import rewrite. Keep the local `base44` identifier; do not rename hundreds of use sites.
- Remove the compatibility re-export only after all imports point to the real client.
- Remove `@base44/sdk` and `@base44/vite-plugin`; retain/add the explicit `@` path alias and preserve other required Vite config.
- Remove obsolete Base44 environment settings, preserve the working Neon Better Auth settings and auth relay rewrite, and keep SPA fallback routing.
- The document's “grep base44 returns nothing” contradicts its explicit instruction to retain the `base44` local identifier. Verify no legacy SDK/plugin/import/runtime dependency remains; do not mass-rename symbols to satisfy that contradictory grep.
- Record the stale ImageProviderSelector copy and obtain the owner's wording if it remains. The proposed wording in the doc is not recorded approval.
- Hard-refresh TimelineEditor, verify authentication and key round-trip, then commit/push/deploy the checkpoint.

### D. Phase 13 — backup and verified cutover

- Establish whether legacy Base44 data needs migration and obtain access securely. Do not infer that all data was migrated just because new D1 test projects work.
- Re-run remote parity tests appropriately, especially large cold fields and ID-preserving imports.
- **Do not follow the old instruction to wipe remote D1 blindly.** The new app already contains projects and encrypted API keys. Inventory and back up the current D1/R2 state, identify ownership/ID conflicts, and use an isolated dry-run target or an owner-approved scoped plan.
- Prepare the exporter/importer and credentials without logging tokens. Pause source writes before the final offset-paginated export; coordinate that final cutover window with the owner.
- Preserve IDs, timestamps, relationships, `attrs`, types and cold fields using the real API import path. Do not use `bulkCreate` or raw SQL as an import shortcut.
- Validate all 25 entity counts and sample relationships, >64 KB fields, undeclared fields and media references. Keep export snapshots out of Git and archive them durably.
- Remove the temporary `import` operation from the live API after successful cutover. It is still enabled in `workers/api/src/routes/db.ts` at handoff.
- Keep Base44 available as rollback; do not delete it. Validate the rollback procedure against the actual old build/auth rather than assuming only swapping environment values will suffice.
- Record cutover counts/date and final evidence, commit and push.

## 8. Existing test fixtures and cleanup boundaries

- Apollo project: `f34e9749d15948c7b992d5dbc7ab5b63`
- Project title: “The hidden engineering decisions behind Apollo 11's guidance computer”
- Previously verified Scene: `6f023ff729d44b029c00472a6d3501bc`
- Disposable Phase 8 project: `phase8-gate-20260909`
- Script: `phase8-script-20260909`
- SFX Scene: `phase8-sfx-scene-20260909`
- Known temporary staging object: `ephemeral/phase8-gate/yes.mp4`
- Phase 8 also created durable media uploads and music rows. Inspect exact targets before cleaning; do not sweep all generated assets or delete the Apollo project.
- Disposable Neon auth test users recorded in the migration log remain. Their passwords were not retained in this handoff. Do not reset owner credentials or delete accounts to recover a browser session.

Browser sessions may expire. Authenticate through the normal flow with authorized credentials. Never extract unrelated browser profile data or print API keys/session tokens. Do not disturb the owner's active editing tab; use dedicated test tabs when available.

## 9. Verification and working commands

From repo root:

```powershell
git status --short
git log -10 --oneline
git diff --check
```

Worker:

```powershell
cd workers/api
npm run typecheck
npm test
```

Frontend:

```powershell
cd apps/web
npm run lint
npm run build
```

Prompt verification, run individually against the relevant batch's canonical source:

```powershell
node migration/tools/verify-prompts.mjs <canonical-source> workers/api/src/fn/<name>.ts
```

The verifier compares literal strings, including CRLF versus LF inside template literals. Whole-file rewrites normalized line endings once and caused apparent prompt changes; restoring original CRLF made the untouched prompts pass. Preserve that distinction. Do not hide real prompt changes by normalizing the verifier.

Remote tests have a separate config. Inspect its included tests/fixtures before invoking `npm run test:remote`, because it selects more than the original parity tests and can call real services. Scope remote execution to the gate being verified.

Existing Worker deploy workaround:

```powershell
cd workers/api
npx wrangler deploy --containers-rollout=none
```

Use normal container rollout only after resolving the container build/storage issues. Check installed CLI help and current official documentation for changed APIs/flags. `standard` container instance type produces a rename warning to `standard-1`; that is separate from the missing Docker/runtime problem.

Vercel deploy was successfully run from the linked repository root:

```powershell
npx vercel deploy --prod --yes
```

Verify actual project/root settings and secrets hygiene before uploads. After deployment, check health and CORS from the real SPA origin, and test the required authenticated flow. Provider usage may consume the owner's configured account credits, so use bounded fixtures and avoid repeatedly generating large content simply to poll status.

## 10. Your first work session and final handoff

Start by preserving/reviewing the existing dirty Phase 11 changes. Re-run the focused gates, finish the live checks above, log the integration findings, and commit/push the verified Phase 11 checkpoint. Then execute Phase 12 and the carefully coordinated Phase 13 cutover in order. Independent preparatory work is fine; do not remove compatibility code or import production data before prerequisites pass.

Only ask the owner for genuinely missing choices, credentials, a cutover window, or authority for a material destructive action. Do not stop merely to ask permission to continue ordinary already-authorized migration work. If blocked, state what specifically is missing and which useful work is already finished.

The final report must distinguish:

- Implemented code versus verified behavior.
- Local commits versus pushed commits.
- Deployed Worker versus deployed SPA versus actual container availability.
- Legacy data migration versus newly created test data.

Return final commit hashes, deployment URLs/versions, test evidence, data counts and backup location, remaining limitations, and a usable rollback plan. Do not call the migration finished while known live gates, voiceover integration, server-side video requirements, or data cutover remain unresolved.
