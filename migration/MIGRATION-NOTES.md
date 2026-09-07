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

