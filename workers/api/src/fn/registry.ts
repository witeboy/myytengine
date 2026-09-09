// Registry of ported Base44 functions.
//
// CODEX: as you port each function, add one file under src/fn/<name>.ts with a
// default-exported handler, import it here, and add it to FUNCTIONS. The key MUST be
// the original Base44 function name — the frontend calls it by that name and nothing
// else resolves paths any more (the old KNOWN_FLAT / 404-retry hack is gone).

import type { FnHandler } from '../types';

import healthCheck from './healthCheck';

// Hand-written (not codemod output) — these two drive R2 and could not be transformed
// mechanically. See PHASE-7.md §2.
import uploadToR2 from './uploadToR2';
import proxyFetchAsset from './proxyFetchAsset';
import quickPublishTranscribe from './quickPublishTranscribe';
import generateSoundEffect from './generateSoundEffect';
import invokeLLM from './invokeLLM';
import callClaudeProxy from './callClaudeProxy';
import cleanScenePrompt from './cleanScenePrompt';
import dedupScenes from './dedupScenes';
import enhanceScenePrompts from './enhanceScenePrompts';
import explainerSceneBreakdown from './explainerSceneBreakdown';
import fixScenePrompts from './fixScenePrompts';
import generateFullScript from './generateFullScript';
import generateHooks from './generateHooks';
import generateSceneBreakdown from './generateSceneBreakdown';
import generateScenePrompts from './generateScenePrompts';
import generateScriptBatches from './generateScriptBatches';
import initializeScriptBatches from './initializeScriptBatches';
import longViralGenerateScript from './longViralGenerateScript';
import longViralSceneBreakdown from './longViralSceneBreakdown';
import rephraseScenePrompt from './rephraseScenePrompt';
import selectHook from './selectHook';
import shortsGenerateScript from './shortsGenerateScript';
import shortsSceneBreakdown from './shortsSceneBreakdown';
import sleepSceneBreakdown from './sleepSceneBreakdown';

export const FUNCTIONS: Record<string, FnHandler> = {
  healthCheck,
  uploadToR2,
  proxyFetchAsset,
  quickPublishTranscribe,
  generateSoundEffect,
  invokeLLM,
  callClaudeProxy,

  // ── Phase 6 · core text (18, from batches/phase6.json) ────────────────────
  generateFullScript,
  generateScriptBatches,
  initializeScriptBatches,
  generateHooks,
  selectHook,
  generateSceneBreakdown,
  sleepSceneBreakdown,
  shortsSceneBreakdown,
  longViralSceneBreakdown,
  explainerSceneBreakdown,
  generateScenePrompts,
  enhanceScenePrompts,
  cleanScenePrompt,
  fixScenePrompts,
  rephraseScenePrompt,
  dedupScenes,
  shortsGenerateScript,
  longViralGenerateScript,
  //
  // NOT ported: `enhancePrompt` is byte-identical to rephraseScenePrompt and only an
  // orphan calls it. If something ever needs the name, alias it to the same module
  // rather than duplicating 85KB:  enhancePrompt: rephraseScenePrompt
  // Also orphans, deliberately unported: cleanScript, editScript, rewriteOutro.

  // ── Phase 7 · image & video ───────────────────────────────────────────────
  // uploadToR2 and proxyFetchAsset are already wired above. The remaining 14 come
  // from `port-batch.mjs migration/tools/batches/phase7.json`:
  // generateSceneImage, pollSceneImage, generateSceneVideo, pollSceneVideo,
  // extractCharacterDNA, generateProgressionPrompts, generateProgressionImage,
  // generateProgressionVideo, generateThumbnailImage, generateNewThumbnailImage,
  // pollThumbnailTask, thumbnailBlend, pollThumbnailBlend, detectFaceRegion

  // ── Phase 8 · audio (12, from batches/phase8.json) ────────────────────────
  // quickPublishTranscribe and generateSoundEffect are wired above (hand-written).
  // The other 11:
  // generateVoiceover, pollVoiceover, listVoices, listVoicesByProvider,
  // previewVoice, inworldVoiceover, generateMusic, checkMusicStatus,
  // submitTranscription, pollTranscription, clipAndVoice

  // ── Phase 9 · thumbnails & LLM plumbing (3, batches/phase9.json) ──────────
  // invokeLLM and callClaudeProxy are wired above (hand-written). The other 3:
  // analyzeForThumbnail, newThumbnailConcept, safeGeminiCall

  // ── Phase 10 · shorts & clips (6, batches/phase10.json) ───────────────────
  // analyzeViralMoments, extractBestMoments, downloadYouTubeVideo,
  // enhanceClipForFYP, detectSilencesAndFillers, scheduleClipPost

  // ── Phase 11 · topics, SEO & b-roll (8, batches/phase11.json) ─────────────
  // generateTopics, parseAndScheduleTopics, researchNicheStrategy,
  // generateSeoTitlesDescriptions, generateSeoDescriptions, searchBrollVideos,
  // autoBrollPopulate, sleepBrollPopulate
  //
  // NOTE autoBrollPopulate/sleepBrollPopulate are invoked by a DYNAMIC name in
  // AutoBrollButton.jsx — grep for their literal names finds nothing. They are live.
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);
