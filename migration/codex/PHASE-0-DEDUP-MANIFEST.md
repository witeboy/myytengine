# Phase 0 - Function dedup manifest (GENERATED)

The export contains each function at up to 4 paths with different content and 5
different pinned `@base44/sdk` versions. That is the reason the old client carried a
`KNOWN_FLAT` set and a 404-retry cache. **Rule: largest file wins.**

| | Count |
|---|---|
| Files in export | 283 |
| Unique function names | 148 |
| Dropped by scope | 37 |
| **Port now** (reachable from the UI) | **64** |
| Orphans in kept areas (never called) | 47 |

> If two versions differ *semantically* rather than cosmetically, diff them and keep the
> one whose call signature matches the frontend. If it is unclear - **ASK, do not merge**.

## A. Port these (64) - reachable from the UI

| Function | Canonical file | KB | Dupes to delete |
|---|---|---|---|
| `analyzeForThumbnail` | `base44/functions/analyzeForThumbnail/entry/entry/entry.ts` | 5 | 0 |
| `analyzeViralMoments` | `base44/functions/analyzeViralMoments/entry.ts` | 17 | 1 |
| `callClaudeProxy` | `base44/functions/callClaudeProxy/entry.ts` | 4 | 2 |
| `checkMusicStatus` | `base44/functions/checkMusicStatus.ts` | 5 | 1 |
| `cleanScenePrompt` | `base44/functions/cleanScenePrompt.ts` | 6 | 1 |
| `clipAndVoice` | `base44/functions/clipAndVoice/entry.ts` | 6 | 0 |
| `dedupScenes` | `base44/functions/dedupScenes.ts` | 5 | 1 |
| `detectFaceRegion` | `base44/functions/detectFaceRegion/entry/entry.ts` | 5 | 3 |
| `detectSilencesAndFillers` | `base44/functions/detectSilencesAndFillers/entry/entry.ts` | 5 | 0 |
| `downloadYouTubeVideo` | `base44/functions/downloadYouTubeVideo.ts` | 9 | 1 |
| `enhanceClipForFYP` | `base44/functions/enhanceClipForFYP/entry/entry.ts` | 7 | 2 |
| `enhancePrompt` | `base44/functions/enhancePrompt.ts` | 85 | 1 |
| `enhanceScenePrompts` | `base44/functions/enhanceScenePrompts.ts` | 93 | 1 |
| `explainerSceneBreakdown` | `base44/functions/explainerSceneBreakdown/entry.ts` | 26 | 2 |
| `extractBestMoments` | `base44/functions/extractBestMoments/entry.ts` | 6 | 0 |
| `extractCharacterDNA` | `base44/functions/extractCharacterDNA/entry.ts` | 17 | 1 |
| `fixScenePrompts` | `base44/functions/fixScenePrompts.ts` | 27 | 2 |
| `generateFullScript` | `base44/functions/generateFullScript/entry/entry.ts` | 17 | 2 |
| `generateHooks` | `base44/functions/generateHooks.ts` | 5 | 1 |
| `generateMusic` | `base44/functions/generateMusic.ts` | 9 | 1 |
| `generateNewThumbnailImage` | `base44/functions/generateNewThumbnailImage.ts` | 36 | 1 |
| `generateProgressionImage` | `base44/functions/generateProgressionImage/entry/entry.ts` | 9 | 2 |
| `generateProgressionPrompts` | `base44/functions/generateProgressionPrompts/entry/entry.ts` | 41 | 2 |
| `generateProgressionVideo` | `base44/functions/generateProgressionVideo.ts` | 9 | 2 |
| `generateSceneBreakdown` | `base44/functions/generateSceneBreakdown/entry.ts` | 87 | 1 |
| `generateSceneImage` | `base44/functions/generateSceneImage.ts` | 27 | 1 |
| `generateScenePrompts` | `base44/functions/generateScenePrompts.ts` | 145 | 1 |
| `generateSceneVideo` | `base44/functions/generateSceneVideo.ts` | 4 | 1 |
| `generateScriptBatches` | `base44/functions/generateScriptBatches.ts` | 35 | 2 |
| `generateSeoDescriptions` | `base44/functions/generateSeoDescriptions/entry.ts` | 8 | 1 |
| `generateSeoTitlesDescriptions` | `base44/functions/generateSeoTitlesDescriptions.ts` | 19 | 1 |
| `generateSoundEffect` | `base44/functions/generateSoundEffect.ts` | 5 | 1 |
| `generateThumbnailImage` | `base44/functions/generateThumbnailImage.ts` | 9 | 2 |
| `generateTopics` | `base44/functions/generateTopics.ts` | 13 | 2 |
| `generateVoiceover` | `base44/functions/generateVoiceover/entry/entry.ts` | 12 | 3 |
| `healthCheck` | `base44/functions/healthCheck.ts` | 2 | 1 |
| `initializeScriptBatches` | `base44/functions/initializeScriptBatches.ts` | 28 | 2 |
| `listVoices` | `base44/functions/listVoices.ts` | 5 | 2 |
| `listVoicesByProvider` | `base44/functions/listVoicesByProvider/entry/entry.ts` | 14 | 3 |
| `longViralGenerateScript` | `base44/functions/longViralGenerateScript/entry/entry.ts` | 25 | 2 |
| `longViralSceneBreakdown` | `base44/functions/longViralSceneBreakdown/entry.ts` | 20 | 2 |
| `newThumbnailConcept` | `base44/functions/newThumbnailConcept.ts` | 22 | 1 |
| `parseAndScheduleTopics` | `base44/functions/parseAndScheduleTopics.ts` | 12 | 1 |
| `pollSceneImage` | `base44/functions/pollSceneImage.ts` | 32 | 1 |
| `pollSceneVideo` | `base44/functions/pollSceneVideo.ts` | 6 | 1 |
| `pollThumbnailBlend` | `base44/functions/pollThumbnailBlend.ts` | 2 | 1 |
| `pollThumbnailTask` | `base44/functions/pollThumbnailTask.ts` | 8 | 2 |
| `pollTranscription` | `base44/functions/pollTranscription/entry/entry.ts` | 1 | 2 |
| `pollVoiceover` | `base44/functions/pollVoiceover.ts` | 9 | 2 |
| `previewVoice` | `base44/functions/previewVoice.ts` | 5 | 1 |
| `proxyFetchAsset` | `base44/functions/proxyFetchAsset/entry/entry.ts` | 4 | 2 |
| `quickPublishTranscribe` | `base44/functions/quickPublishTranscribe/entry.ts` | 16 | 1 |
| `rephraseScenePrompt` | `base44/functions/rephraseScenePrompt.ts` | 85 | 1 |
| `researchNicheStrategy` | `base44/functions/researchNicheStrategy.ts` | 3 | 1 |
| `safeGeminiCall` | `base44/functions/safeGeminiCall.ts` | 2 | 1 |
| `scheduleClipPost` | `base44/functions/scheduleClipPost.ts` | 7 | 2 |
| `searchBrollVideos` | `base44/functions/searchBrollVideos.ts` | 6 | 1 |
| `selectHook` | `base44/functions/selectHook/entry/entry.ts` | 7 | 1 |
| `shortsGenerateScript` | `base44/functions/shortsGenerateScript/entry/entry.ts` | 22 | 1 |
| `shortsSceneBreakdown` | `base44/functions/shortsSceneBreakdown/entry.ts` | 27 | 2 |
| `sleepSceneBreakdown` | `base44/functions/sleepSceneBreakdown/entry/entry.ts` | 13 | 2 |
| `submitTranscription` | `base44/functions/submitTranscription/entry.ts` | 3 | 1 |
| `thumbnailBlend` | `base44/functions/thumbnailBlend.ts` | 7 | 2 |
| `uploadToR2` | `base44/functions/uploadToR2.ts` | 8 | 1 |

## B. Orphans inside kept feature areas (47)

Present in the repo but never invoked from the frontend or another function.
**Do not port these in the numbered phases.** Leave them in `base44/functions/` until a
feature actually needs one; several may never have worked. Revive on request only.

- `addTextOverlay` (`base44/functions/addTextOverlay.ts`)
- `analyzeThumbnailCtr` (`base44/functions/analyzeThumbnailCtr.ts`)
- `analyzeThumbnailTemplate` (`base44/functions/analyzeThumbnailTemplate.ts`)
- `analyzeVideoWithGemini` (`base44/functions/analyzeVideoWithGemini.ts`)
- `analyzeYouTubeThumbnail` (`base44/functions/analyzeYouTubeThumbnail.ts`)
- `autoBrollPopulate` (`base44/functions/autoBrollPopulate.ts`)
- `autoSyncTimeline` (`base44/functions/autoSyncTimeline.ts`)
- `buildTweakedThumbnailPrompt` (`base44/functions/buildTweakedThumbnailPrompt.ts`)
- `calendarToProject` (`base44/functions/calendarToProject.ts`)
- `checkVoiceStatus` (`base44/functions/checkVoiceStatus.ts`)
- `checkVoiceoverStatus` (`base44/functions/checkVoiceoverStatus.ts`)
- `cleanScript` (`base44/functions/cleanScript.ts`)
- `createPlaceholderTimeline` (`base44/functions/createPlaceholderTimeline.ts`)
- `editScript` (`base44/functions/editScript.ts`)
- `explainerScriptResearch` (`base44/functions/explainerScriptResearch.js`)
- `exportVideoFFmpeg` (`base44/functions/exportVideoFFmpeg.ts`)
- `generateAsset` (`base44/functions/generateAsset.ts`)
- `generateAssetPlan` (`base44/functions/generateAssetPlan.ts`)
- `generateBrandIdentity` (`base44/functions/generateBrandIdentity.ts`)
- `generateColorGrade` (`base44/functions/generateColorGrade.ts`)
- `generateContentCalendar` (`base44/functions/generateContentCalendar.ts`)
- `generateOverlayTextSuggestions` (`base44/functions/generateOverlayTextSuggestions.ts`)
- `generateRetentionMap` (`base44/functions/generateRetentionMap.ts`)
- `generateScript` (`base44/functions/generateScript.ts`)
- `generateSmartCrop` (`base44/functions/generateSmartCrop.ts`)
- `generateThumbnailFromUrls` (`base44/functions/generateThumbnailFromUrls.ts`)
- `generateThumbnails` (`base44/functions/generateThumbnails.ts`)
- `generateThumbnailsFromScript` (`base44/functions/generateThumbnailsFromScript.ts`)
- `generateTimelinePreview` (`base44/functions/generateTimelinePreview.ts`)
- `generateTimingSync` (`base44/functions/generateTimingSync.ts`)
- `generateTranscript` (`base44/functions/generateTranscript.ts`)
- `generateTransitions` (`base44/functions/generateTransitions.ts`)
- `generateTweakedThumbnailImage` (`base44/functions/generateTweakedThumbnailImage/entry/entry.ts`)
- `generateUploadMetadata` (`base44/functions/generateUploadMetadata.ts`)
- `generateViralHook` (`base44/functions/generateViralHook/entry/entry.ts`)
- `generateVoiceProfile` (`base44/functions/generateVoiceProfile.ts`)
- `listMinimaxVoices` (`base44/functions/listMinimaxVoices.ts`)
- `refineThumbnailConcept` (`base44/functions/refineThumbnailConcept.ts`)
- `removeBackground` (`base44/functions/removeBackground.ts`)
- `rephraseThumbnailPrompt` (`base44/functions/rephraseThumbnailPrompt.ts`)
- `resolveVideoUrl` (`base44/functions/resolveVideoUrl.ts`)
- `rewriteOutro` (`base44/functions/rewriteOutro.ts`)
- `selectTopic` (`base44/functions/selectTopic.ts`)
- `sleepBrollPopulate` (`base44/functions/sleepBrollPopulate.ts`)
- `suggestThumbnailTemplates` (`base44/functions/suggestThumbnailTemplates.ts`)
- `syncMediaToAudio` (`base44/functions/syncMediaToAudio.ts`)
- `transcribeVoiceover` (`base44/functions/transcribeVoiceover.ts`)

## C. Delete entirely - out of scope (37)

- `_probeAI33` - all copies under `base44/functions/_probeAI33*`
- `adaptForPlatform` - all copies under `base44/functions/adaptForPlatform*`
- `analyzeCompetitors` - all copies under `base44/functions/analyzeCompetitors*`
- `analyzeNiche` - all copies under `base44/functions/analyzeNiche*`
- `analyzeYouTubeVideo` - all copies under `base44/functions/analyzeYouTubeVideo*`
- `auditNicheChannels` - all copies under `base44/functions/auditNicheChannels*`
- `autoAdvancePipeline` - all copies under `base44/functions/autoAdvancePipeline*`
- `autoEditPipeline` - all copies under `base44/functions/autoEditPipeline*`
- `bunnyConfig` - all copies under `base44/functions/bunnyConfig*`
- `bunnyUpload` - all copies under `base44/functions/bunnyUpload*`
- `checkRunwayVideoStatus` - all copies under `base44/functions/checkRunwayVideoStatus*`
- `checkSceneVideoStatus` - all copies under `base44/functions/checkSceneVideoStatus*`
- `deepNicheAnalysis` - all copies under `base44/functions/deepNicheAnalysis*`
- `discoverCompetitors` - all copies under `base44/functions/discoverCompetitors*`
- `fetchNicheTrends` - all copies under `base44/functions/fetchNicheTrends*`
- `fetchTrendingNiches` - all copies under `base44/functions/fetchTrendingNiches*`
- `generateAvatarVideo` - all copies under `base44/functions/generateAvatarVideo*`
- `generateRepurposeBatch` - all copies under `base44/functions/generateRepurposeBatch*`
- `generateRunwayVideo` - all copies under `base44/functions/generateRunwayVideo*`
- `getAppConfig` - all copies under `base44/functions/getAppConfig*`
- `initializeRepurposeBatches` - all copies under `base44/functions/initializeRepurposeBatches*`
- `inworldVoiceover` - all copies under `base44/functions/inworldVoiceover*`
- `listR2Exports` - all copies under `base44/functions/listR2Exports*`
- `pollAvatarVideo` - all copies under `base44/functions/pollAvatarVideo*`
- `pollCreatomateRender` - all copies under `base44/functions/pollCreatomateRender*`
- `quickPublishSeo` - all copies under `base44/functions/quickPublishSeo*`
- `renderShortCreatomate` - all copies under `base44/functions/renderShortCreatomate*`
- `repurposeCompetitorVideo` - all copies under `base44/functions/repurposeCompetitorVideo*`
- `runFullPipeline` - all copies under `base44/functions/runFullPipeline*`
- `synthesizeNicheDna` - all copies under `base44/functions/synthesizeNicheDna*`
- `testAi33Tts` - all copies under `base44/functions/testAi33Tts*`
- `testGrokApi` - all copies under `base44/functions/testGrokApi*`
- `testGrokImage` - all copies under `base44/functions/testGrokImage*`
- `testR2Connection` - all copies under `base44/functions/testR2Connection*`
- `testRunway` - all copies under `base44/functions/testRunway*`
- `testSync` - all copies under `base44/functions/testSync*`
- `youtubeAuth` - all copies under `base44/functions/youtubeAuth*`
