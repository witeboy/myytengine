# Phase 0 — Restructure, dedup, prune

> Prepend `codex/00-PREAMBLE.md`.

**Goal:** turn the Base44 export into a clean monorepo containing only in-scope code.
No new infrastructure, no behaviour change to anything that survives. Pure deletion
and file moves.

## 0.1 Monorepo layout

Move the existing tree into:

```
myytengine/
├─ apps/web/          ← everything that is currently src/, index.html, tailwind/postcss/
│                       eslint configs, components.json, jsconfig.json, vite.config.js
├─ workers/api/       ← provided pre-built; copy in as-is
├─ packages/shared/   ← empty for now
└─ base44/            ← KEEP for reference during phases 6-11, delete at Phase 12
```

Root `package.json` with npm workspaces: `["apps/*", "workers/*", "packages/*"]`.
`apps/web/package.json` keeps the existing deps for now — dependency removal is Phase 12.

## 0.2 Function dedup

Follow `codex/PHASE-0-DEDUP-MANIFEST.md` exactly.

- **Section A (64 functions)** — keep the listed canonical file, delete every other copy.
- **Section B (47 functions)** — orphans in kept areas. Keep the canonical file, delete
  duplicates, but **do not port them** in later phases.
- **Section C (37 functions)** — delete all copies.

Before deleting a duplicate, `diff` it against the canonical. If the difference is more
than formatting or the pinned `@base44/sdk` version, **stop and ask**. Log every
non-trivial diff in `MIGRATION-NOTES.md`.

Expected result: `base44/functions/` goes from **283 files to 111**.

## 0.3 Delete dropped features

**Pages** (`apps/web/src/pages/`): `ResearchTerminal` `ResultsGrid` `ChannelAuditor`
`CompetitorMonitor` `ContentRepurpose` `UGCPipeline` `BulkUGCPipeline` `MediaLibrary`
`VersionHistory` `AutoEditReview` `QuickPublish` `YouTubeCallback`

**Component directories** (`apps/web/src/components/`): `audit/` `competitors/` `niche/`
`ugc/` `bulk-ugc/` `repurpose/` `crossplatform/` `autoedit/` `media/` `versions/`
`templates/` `quickpublish/`

**Individual components**: `channels/NicheInsightsPanel.jsx` `channels/CompetitorPanel.jsx`
`channels/CompetitorVideoList.jsx` `channels/RepurposeVideoDialog.jsx`
`channels/AutoEditButton.jsx` `channels/AutoEditJobsList.jsx`
`dashboard/CloudExportsPanel.jsx` `postprod/ProjectPublishPanel.jsx`
`postprod/StandalonePublishPanel.jsx` `postprod/YouTubePublishPanel.jsx`
`postprod/YouTubeChannelSelector.jsx` `postprod/youtubeUploadUtil.jsx`
`clips/useYouTubeChannels.jsx` `clips/ClipAutoPublish.jsx`

**Entity schemas** (`base44/entities/`): `NicheAudits` `TrendingNiches` `CachedVideos`
`Searches` `InfluencerTemplates` `ProjectVersions` `AutoEditJobs`

### ⚠ Do NOT delete these — they look droppable but are load-bearing

| Keep | Because |
|---|---|
| `proxyFetchAsset` | used by `timeline/useVideoExport.jsx` and `pages/ContentGeneration.jsx` |
| `MediaAssets` entity | read by `timeline/OverlayPanel.jsx`, not just MediaLibrary |
| `UploadMetadata` entity | N3 SEO + `channels/TopicAssetsPanel.jsx` + `scheduleClipPost` |
| `uploadToR2` | this is core storage, not the Cloud Exports panel |
| `extractBestMoments` | belongs to Clip Extractor, not Quick Publish |
| `detectSilencesAndFillers` | belongs to the timeline silence trimmer |
| `postprod/SeoTitlesPanel.jsx`, `postprod/SeoDescriptionsPanel.jsx` | N3 is kept |

## 0.4 Surgical UI edits (removals only — no restyling, no copy changes)

| File | Edit |
|---|---|
| `src/pages.config.js` | remove imports + PAGES entries for deleted pages; add `Settings` |
| `src/App.jsx` | remove routes for `BulkUGCPipeline` `AutoEditReview` `QuickPublish` `YouTubeCallback`; keep everything else |
| `src/components/dashboard/QuickShortcuts.jsx` | remove the 5 dead tiles: Niche Research, Competitor Monitor, Repurpose Video, UGC Pipeline, Media Library. Add one `Settings` tile (label `Settings`, icon `Settings` from lucide, path `/Settings`, color `from-slate-500 to-gray-600`) |
| `src/pages/ToolsHub.jsx` | remove 6 dead tiles; keep `Flow / Re-make` and `Make Thumbnail` |
| `src/Layout.jsx` | delete the `nichePages` branch entirely — Layout becomes `({children}) => <>{children}</>` |
| `src/pages/Dashboard.jsx` | remove the `cloud` and `crossplatform` tabs, their buttons and their imports. Remove the `publish` tab too (N is dropped). Leave the `dashboard` tab exactly as it is |
| `src/pages/ChannelDetail.jsx` | remove the Niche Insights, Competitors and Auto-Edit tabs/panels and their imports |
| `src/pages/PostProduction.jsx` | remove **only** the `publish` tab and its imports. **Keep `titles`, `thumbnails`, `descriptions`** |
| `src/components/clips/ClipScheduler.jsx` | remove the channel picker (it used `useYouTubeChannels`). Scheduling itself stays — `scheduleClipPost` only writes rows |

## 0.5 Acceptance

- `npm run build` in `apps/web` succeeds
- `npm run lint` reports no unresolved imports and no unused-import errors
- `grep -rn "UGCPipeline\|CompetitorMonitor\|ContentRepurpose\|MediaLibrary\|VersionHistory\|AutoEditReview\|QuickPublish\|ResearchTerminal\|ResultsGrid\|ChannelAuditor" apps/web/src` returns nothing
- `base44/functions` contains 111 files
- The app still runs against Base44 unchanged. **Phase 0 must not break the live app.**
