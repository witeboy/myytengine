# myytengine — Repo Audit & Migration Feature Menu

**Audited:** 2026-09-06 · Source: `myytengine.zip` (Base44 export, React 18 + Vite + shadcn/ui)

---

## 1. What this repo actually is

A **faceless-YouTube content factory**: niche research → channel planning → script → scenes →
images/video → voiceover → browser timeline editor → thumbnails → SEO → YouTube publish,
plus Shorts/clips, UGC, sleep-content and repurposing side-pipelines.

| Metric | Count |
|---|---|
| Frontend source lines | ~54,200 |
| Backend function lines | ~80,200 |
| Pages (routes) | 32 files / 32 routes |
| Components | 208 (49 are shadcn/ui primitives) |
| Backend functions (unique) | **148** |
| Backend functions actually reachable from UI | **83** (65 are orphans) |
| Database entities | **32** |
| Distinct external APIs | 20 |

### Build / stack
- Vite 6 + React 18 + React Router 6 + TanStack Query 5
- Tailwind 3 + shadcn/ui (Radix) + framer-motion + lucide
- Browser-side video: `mp4-muxer`, `html2canvas`, `three`, `jspdf`, `jszip`
- Backend: **Deno** functions (`Deno.serve`) hosted by Base44, all using
  `createClientFromRequest()` from `npm:@base44/sdk` (5 different pinned versions)

---

## 2. The Base44 lock-in surface (everything that must be replaced)

There are exactly **five** coupling points. Nothing else in the repo is Base44-specific.

| # | Coupling | Where | Volume | Replacement |
|---|---|---|---|---|
| **L1** | `base44.entities.*` CRUD (`.filter/.list/.get/.create/.update/.delete/.bulkCreate`) | 190 backend + ~250 frontend call sites, 33 entities | huge | Cloudflare Worker REST/RPC over D1 or Neon Postgres, behind an identical `db.Entity.*` shim |
| **L2** | `base44.functions.invoke(name, payload)` + the 404 path-shape fallback hack in `src/api/base44Client.js` | 172 frontend call sites | medium | Single Worker router `POST /api/fn/:name` — the hack **disappears entirely** |
| **L3** | `base44.auth.me() / logout() / redirectToLogin()` + `AuthContext.jsx` + `/api/apps/public/...` public-settings probe | 3 frontend, 274 backend guards | small | Your auth provider + a Worker middleware that injects `user` |
| **L4** | `base44.integrations.Core.*` — `InvokeLLM` (23), `UploadFile` (18), `GenerateImage` (4) | 45 call sites | small | `InvokeLLM`→ aggregator · `UploadFile`→ R2 · `GenerateImage`→ KIE |
| **L5** | `@base44/vite-plugin` in `vite.config.js` + `src/lib/app-params.js` (`base44_*` localStorage, `?app_id=`/`?access_token=` URL params) | 2 files | tiny | Delete plugin; rewrite app-params to plain env |

**Critical structural note:** the export contains the *same function duplicated* at up to
4 paths (`foo.ts`, `foo/entry.ts`, `foo/entry/entry.ts`, `foo/entry/entry/entry.ts`) with
**different content and different `@base44/sdk` versions**. That is why `base44Client.js`
carries a KNOWN_FLAT set and a 404-retry cache. Migration must pick **one canonical version
per function** (rule used in this audit: largest file wins) and delete the rest. This alone
removes ~60% of the backend file count.

---

## 3. External API inventory (what routes where after migration)

| Provider | Env key | Used by | Calls | Migration target |
|---|---|---|---|---|
| Google Gemini | `GEMINI_API_KEY` | 116 refs, ~70 functions | text + **vision** + video understanding | → aggregator (needs multimodal support) |
| Anthropic Claude | `ANTHROPIC_API_KEY` | 29 refs, ~15 functions | text | → aggregator |
| OpenAI | `OPENAI_API_KEY` | 24 refs, ~8 functions | text | → aggregator |
| **KIE.ai** | `KIE_API_KEY` | 38 refs, ~20 functions | image gen, video gen, music, avatar | **keep — image/video/music** |
| **AI33.pro** | `AI33_API_KEY` | 41 refs, ~14 functions | TTS, voice list, voice clone | **keep — TTS/voice cloning** |
| Cloudflare R2 | `CLOUDFLARE_R2_*` | 24 refs, ~12 functions | asset storage | **keep — becomes the only store** |
| YouTube Data API | `YOUTUBE_API_KEY` | 21 refs | channel/video stats, search | keep (no alternative) |
| Google OAuth | `GOOGLE_CLIENT_ID/SECRET` | youtubeAuth | upload auth | keep |
| AssemblyAI | `ASSEMBLYAI_API_KEY` | 17 refs, 6 functions | ASR + word timings + chapters | **decision needed** |
| MiniMax | `MINIMAX_API_KEY` | 11 refs | TTS + SFX | fold into AI33 / KIE? |
| Pexels + Pixabay | `PEXELS_/PIXABAY_API_KEY` | 20 refs | stock b-roll | keep (free) |
| Bunny CDN | `BUNNY_*` | 7 refs | video upload/CDN | **retire → R2** |
| Inworld | `INWORLD_API_KEY` | 6 refs | alt TTS | drop (AI33 covers it) |
| Freepik | `FREEPIK_API_KEY` | 5 refs | video gen | drop (KIE covers it) |
| Kling | `KLING_ACCESS/SECRET_KEY` | 4 refs | avatar video | drop (KIE covers it) |
| Runway | `RUNWAY_API_KEY` | 2 refs | video gen | drop (KIE covers it) |
| Creatomate | `CREATOMATE_API_KEY` | 2 refs | cloud short render | **decision needed** |
| Cobalt | `COBALT_API_URL` | 6 refs | YouTube download | keep (self-hostable) |
| youtubetranscript.dev / supadata / kome.ai / RapidAPI | various | transcript fallback chain in `analyzeYouTubeVideo` | prune to 1–2 |

---

## 4. Database entities (32)

Projects · Scenes · Scripts · ScriptBatches · Topics · ChannelTopics · Channels · Hooks ·
ProductionSettings · Transcripts · TimelineBlocks · TimingEntries · MediaAssets · MusicTracks ·
ThumbnailConcepts · ThumbnailTemplates · ThumbnailNiches · ChannelThumbnailDNA · UploadMetadata ·
ProjectVersions · CalendarEntries · AssetPlans · BrandIdentities · VoiceProfiles · RetentionMaps ·
VisualPrompts · AutoEditJobs · NicheAudits · TrendingNiches · CachedVideos · Searches ·
InfluencerTemplates · Hooks

Schemas are plain JSON-Schema in `base44/entities/*.jsonc` — they translate 1:1 to SQL DDL.
Access pattern is overwhelmingly `filter({project_id})` / `filter({channel_id})`, so indexes
are obvious and no ORM is required.

---

## 5. FEATURE MENU — pick what migrates

Legend — **Effort**: S = lift-and-shift, M = rewire providers, L = significant work.
**Status**: ✅ wired to UI · ⚠️ partially wired · 💀 orphan code (in repo, never called)

### A · Platform (mandatory — not optional)
| ID | Feature | Files | Effort |
|---|---|---|---|
| A1 | App shell, 32 routes, Layout, 49 shadcn/ui primitives, toasts, react-query | `App.jsx`, `pages.config.js`, `components/ui/*` | S |
| A2 | Auth context + login/logout/user gate | `lib/AuthContext.jsx`, `UserNotRegisteredError.jsx` | M |
| A3 | Data layer — 33 entities | all pages | L |
| A4 | Function-invoke transport | `api/base44Client.js` | M |
| A5 | File upload + storage | `lib/directApi.js`, `uploadToR2`, `bunnyUpload` | M |
| A6 | Health check panel | `HealthCheckButton.jsx`, `healthCheck` | S |

### B · Niche Research & Intelligence
| ID | Feature | Backend fns | APIs | Effort |
|---|---|---|---|---|
| B1 | Research Terminal — keyword → scored video corpus | `analyzeNiche`💀 | YouTube | M |
| B2 | Results Grid — opportunity/profitability scoring, recent searches | — | — | S |
| B3 | Trending niches table + refresh | `fetchTrendingNiches`💀, `fetchNicheTrends`✅ | YouTube + Gemini | M |
| B4 | Channel Auditor — monetization likelihood, RPM, revenue est., profitability grade | `auditNicheChannels`, `deepNicheAnalysis` | YouTube | M |
| B5 | Competitor Monitor — track 3 channels, AI summary | `discoverCompetitors`, `analyzeCompetitors` | YouTube + Gemini | M |
| B6 | Niche DNA / entry-angle synthesis | `synthesizeNicheDna`💀, `researchNicheStrategy`✅ | Gemini | M |

### C · Channel / Content Factory
| ID | Feature | Backend fns | Effort |
|---|---|---|---|
| C1 | Channels Hub + Channel Detail (18 components) | — | S |
| C2 | Content calendar, topic scheduling, day panels | `generateContentCalendar`💀, `parseAndScheduleTopics`✅, `calendarToProject`💀 | M |
| C3 | Topic generation, bulk importer, AI title generator | `generateTopics`, `selectTopic`💀 | M |
| C4 | Brand identity generator (colors/type/intro/outro/sound) | `generateBrandIdentity`💀 | M |
| C5 | Channel Thumbnail DNA — locked face refs, palette, template bias | — (entity-driven) | S |

### D · Script Pipeline (long-form core)
| ID | Feature | Backend fns | Effort |
|---|---|---|---|
| D1 | New Project + project-mode picker (`resolveProjectMode`) | — | S |
| D2 | StoryTopics → StoryHooks → StoryDuration → StoryScript wizard | — | S |
| D3 | Script generation, batched long-script generation | `generateFullScript`, `generateScriptBatches`, `initializeScriptBatches`, `generateScript`💀 | M |
| D4 | Hook generation + selection | `generateHooks`, `selectHook`, `generateViralHook`💀 | M |
| D5 | Script editor, cleanup, outro rewrite | `cleanScript`💀, `editScript`💀, `rewriteOutro`💀 | M |
| D6 | Voice profile + retention map | `generateVoiceProfile`💀, `generateRetentionMap`💀 | M |

### E · Scene & Visual Production
| ID | Feature | Backend fns | Effort |
|---|---|---|---|
| E1 | Scene breakdown (generic + sleep + shorts + longviral + explainer variants) | `generateSceneBreakdown`, `sleepSceneBreakdown`, `shortsSceneBreakdown`, `longViralSceneBreakdown`, `explainerSceneBreakdown` | M |
| E2 | Prompt engine — generate / enhance / clean / fix / dedup / rephrase (**~380KB of prompt logic**) | `generateScenePrompts`, `enhanceScenePrompts`, `enhancePrompt`, `cleanScenePrompt`, `fixScenePrompts`, `rephraseScenePrompt`, `dedupScenes` | M |
| E3 | Scene image generation + polling | `generateSceneImage`, `pollSceneImage` | M (KIE) |
| E4 | Scene video generation + polling | `generateSceneVideo`, `pollSceneVideo`, `checkSceneVideoStatus`💀, `generateRunwayVideo`💀 | M (KIE) |
| E5 | Character DNA / cross-scene consistency | `extractCharacterDNA` | M |
| E6 | Scene grid UI — DnD reorder, acts, notes, SFX, provider regen (20 components) | — | S |
| E7 | Auto b-roll population from stock | `autoBrollPopulate`💀, `sleepBrollPopulate`✅, `searchBrollVideos`✅ | M |
| E8 | Transitions / color grade / smart crop | `generateTransitions`💀, `generateColorGrade`💀, `generateSmartCrop`💀 | M |
| E9 | Flow / Re-make progression videos + timelapse concat | `generateProgressionPrompts/Image/Video`, `lib/concatTimelapse.js` | M |

### F · Audio
| ID | Feature | Backend fns | Target | Effort |
|---|---|---|---|---|
| F1 | Voiceover generation + chunked polling | `generateVoiceover`, `pollVoiceover`, `checkVoiceoverStatus`💀 | AI33 | M |
| F2 | Voice library, preview, cloning | `listVoices`, `listVoicesByProvider`, `previewVoice`, `listMinimaxVoices`💀, `inworldVoiceover` | AI33 | M |
| F3 | Music generation | `generateMusic`, `checkMusicStatus` | KIE | M |
| F4 | Sound effects + viral SFX library | `generateSoundEffect`, `lib/viralSFXLibrary.js` | KIE/MiniMax | M |
| F5 | Transcription / word timings / chapters | `submitTranscription`, `pollTranscription`, `quickPublishTranscribe`, `generateTranscript`💀, `transcribeVoiceover`💀 | AssemblyAI? | M |
| F6 | Audio mixer, ducking visualizer, beat detection | client-side | — | S |

### G · Timeline Editor (browser NLE — 1,997-line page + 17 components)
| ID | Feature | Effort |
|---|---|---|
| G1 | Snap timeline, ruler, drag/trim, clip properties, snap engine | S |
| G2 | Canvas preview + playback engine (`usePlaybackEngine`) | S |
| G3 | Caption styling — presets, viral styler, live preview | S |
| G4 | ASR auto-sync, drift fix, sync diagnostics (`asrAutoSync.js` 443 lines) | S |
| G5 | Silence detection + trimmer | S |
| G6 | Motion presets, overlays, animation editor | S |
| G7 | **Export** — in-browser mp4-muxer/FFmpeg **and** cloud render | M |
| | ↳ cloud paths: `exportVideoFFmpeg`💀 (R2), `renderShortCreatomate`/`pollCreatomateRender` (Creatomate) | |

### H · Thumbnails
| ID | Feature | Backend fns | Effort |
|---|---|---|---|
| H1 | Concept generation + refinement | `generateThumbnailsFromScript`💀, `newThumbnailConcept`✅, `refineThumbnailConcept`💀 | M |
| H2 | Thumbnail image gen + polling | `generateThumbnailImage`, `generateNewThumbnailImage`, `generateTweakedThumbnailImage`💀, `generateThumbnailFromUrls`💀, `pollThumbnailTask` | M (KIE) |
| H3 | Face blend / swap / bg removal | `thumbnailBlend`, `pollThumbnailBlend`, `detectFaceRegion`, `removeBackground`💀 | M |
| H4 | Template library + niche DNA (`thumbnailTemplates.js`, `thumbnailReferenceImages.js`) | `analyzeThumbnailTemplate`💀, `suggestThumbnailTemplates`💀 | M |
| H5 | Thumbnail CTR analysis of competitor thumbs | `analyzeYouTubeThumbnail`💀, `analyzeThumbnailCtr`💀, `analyzeForThumbnail`✅ | M |
| H6 | Text overlay studio + AI overlay copy | `addTextOverlay`💀, `generateOverlayTextSuggestions`💀 | M |

### I · Shorts & Clips
| ID | Feature | Backend fns | Effort |
|---|---|---|---|
| I1 | Shorts Pipeline (niche data 899 lines, engine specs, structure view) | `shortsGenerateScript`, `shortsSceneBreakdown` | M |
| I2 | **Open Shorts** (993-line page) — clip → caption → render | `renderShortCloud`, `renderShortWithCaptions` | M |
| I3 | Clip Extractor — YouTube → viral moment detection → cut | `analyzeViralMoments`, `extractBestMoments`, `downloadYouTubeVideo` | M |
| I4 | Clip enhance for FYP | `enhanceClipForFYP`, `lib/exportEnhancedClip.js` | M |
| I5 | Clip + voice re-narration | `clipAndVoice`, `lib/renderClipAndVoice.js` | M |
| I6 | Copyright shield + gameplay split-screen | client-side | S |
| I7 | Clip scheduler + auto-publish calendar | `scheduleClipPost` | M |

### J · Repurpose & Cross-Platform
| ID | Feature | Backend fns | Effort |
|---|---|---|---|
| J1 | Competitor video → your script (batched) | `repurposeCompetitorVideo`, `generateRepurposeBatch`, `initializeRepurposeBatches` | M |
| J2 | Platform adaptation + cross-platform publisher | `adaptForPlatform` | M |
| J3 | YouTube video deep analysis (5-provider transcript fallback chain) | `analyzeYouTubeVideo` (30KB) | M |

### K · UGC
| ID | Feature | Backend fns | Effort |
|---|---|---|---|
| K1 | UGC Pipeline — influencer prompt builder, templates, product upload | — | M |
| K2 | Bulk UGC — batch queue, results grid | — | M |
| K3 | Avatar video generation | `generateAvatarVideo`, `pollAvatarVideo` | M (KIE) |

### L · Niche Pipelines
| ID | Feature | Backend fns | Effort |
|---|---|---|---|
| L1 | Sleep / Meditation pipeline (script + music + visuals stages) | `sleepSceneBreakdown`, `sleepBrollPopulate` | M |
| L2 | Long Viral pipeline (niche data, structure view) | `longViralGenerateScript`, `longViralSceneBreakdown` | M |
| L3 | Explainer mode (Einstein-led diagram scenes) | `explainerSceneBreakdown`, `explainerScriptResearch`💀 | M |

### M · Auto-Edit
| ID | Feature | Backend fns | Effort |
|---|---|---|---|
| M1 | Auto-Edit pipeline + review board (storyboard, b-roll swap, ducking) | `autoEditPipeline`, `autoAdvancePipeline`💀, `runFullPipeline`💀 | L |

### N · Publishing
| ID | Feature | Backend fns | Effort |
|---|---|---|---|
| N1 | YouTube OAuth + callback + channel selector | `youtubeAuth` | M |
| N2 | YouTube resumable upload | `youtubeUploadUtil.jsx` | M |
| N3 | SEO metadata generation (titles/descriptions/tags/hashtags/pinned) | `generateSeoTitlesDescriptions`, `generateSeoDescriptions`, `generateUploadMetadata`💀, `quickPublishSeo`💀 | M |
| N4 | **Quick Publish** pipeline — transcribe → chapters → silence trim → viral moments → thumbnail → upload | `quickPublishTranscribe` | M |
| N5 | Standalone publish panel (no project) | — | S |

### O · Media & Versions
| ID | Feature | Backend fns | Effort |
|---|---|---|---|
| O1 | Media Library (upload zone, preview modal, tagging) | `proxyFetchAsset` | S |
| O2 | Version history + snapshot compare | — | S |
| O3 | Cloud exports panel | `listR2Exports`, `uploadToR2` | S |
| O4 | Project / Repurpose / UGC template galleries | — | S |

---

## 6. Open decisions needed before code is written

1. **"Vasil" front end** — assumed **Vercel** (static Vite SPA). Confirm.
2. **Aggregator** — which one? (Cloudflare AI Gateway / OpenRouter / other.) Must confirm it
   supports **vision + video-file input**, because ~30 functions send images/video to Gemini.
3. **Database** — Cloudflare D1, or Neon Postgres? (33 tables, heavy JSON columns, some rows
   are large snapshots → Postgres `jsonb` is the safer fit; D1 is cheaper and co-located.)
4. **Auth** — what replaces Base44's? (Clerk / Neon Auth / Cloudflare Access / plain JWT.)
5. **AssemblyAI** — keep, or move ASR to the aggregator/Whisper-class model?
6. **Creatomate** — keep cloud short-render, or drop and rely on in-browser export only?
7. **Bunny CDN** — confirm retire → R2 only.
8. **Orphan functions (65)** — migrate or delete? Recommend delete unless a feature you pick
   depends on one.
