// Registry of ported the original platform functions.
//
// CODEX: as you port each function, add one file under src/fn/<name>.ts with a
// default-exported handler, import it here, and add it to FUNCTIONS. The key MUST be
// the original platform function name — the frontend calls it by that name and nothing
// else resolves paths any more (the old KNOWN_FLAT / 404-retry hack is gone).

import type { FnHandler } from '../types';

import healthCheck from './healthCheck';

// Hand-written (not codemod output) — these two drive R2 and could not be transformed
// mechanically. See PHASE-7.md §2.
import uploadToR2 from './uploadToR2';
import proxyFetchAsset from './proxyFetchAsset';
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
import detectFaceRegion from './detectFaceRegion';
import extractCharacterDNA from './extractCharacterDNA';
import generateNewThumbnailImage from './generateNewThumbnailImage';
import generateProgressionImage from './generateProgressionImage';
import generateProgressionPrompts from './generateProgressionPrompts';
import generateProgressionVideo from './generateProgressionVideo';
import generateSceneImage from './generateSceneImage';
import generateSceneVideo from './generateSceneVideo';
import generateThumbnailImage from './generateThumbnailImage';
import pollSceneImage from './pollSceneImage';
import pollSceneVideo from './pollSceneVideo';
import pollThumbnailBlend from './pollThumbnailBlend';
import pollThumbnailTask from './pollThumbnailTask';
import thumbnailBlend from './thumbnailBlend';
import generateVoiceover from './generateVoiceover';
import pollVoiceover from './pollVoiceover';
import listVoices from './listVoices';
import listVoicesByProvider from './listVoicesByProvider';
import previewVoice from './previewVoice';
import inworldVoiceover from './inworldVoiceover';
import generateMusic from './generateMusic';
import checkMusicStatus from './checkMusicStatus';
import submitTranscription from './submitTranscription';
import pollTranscription from './pollTranscription';
import analyzeForThumbnail from './analyzeForThumbnail';
import newThumbnailConcept from './newThumbnailConcept';
import safeGeminiCall from './safeGeminiCall';
import parseAndScheduleTopics from './parseAndScheduleTopics';
import generateSeoTitlesDescriptions from './generateSeoTitlesDescriptions';
import generateSeoDescriptions from './generateSeoDescriptions';
import searchBrollVideos from './searchBrollVideos';
import autoBrollPopulate from './autoBrollPopulate';
import sleepBrollPopulate from './sleepBrollPopulate';

export const FUNCTIONS: Record<string, FnHandler> = {
  healthCheck,
  uploadToR2,
  proxyFetchAsset,
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
  generateSceneImage,
  pollSceneImage,
  generateSceneVideo,
  pollSceneVideo,
  extractCharacterDNA,
  generateProgressionPrompts,
  generateProgressionImage,
  generateProgressionVideo,
  generateThumbnailImage,
  generateNewThumbnailImage,
  pollThumbnailTask,
  thumbnailBlend,
  pollThumbnailBlend,
  detectFaceRegion,

  // ── Phase 8 · audio (13 total; 11 from batches/phase8.json) ──────────────
  // generateSoundEffect is wired above (hand-written).
  // The other 11:
  // generateVoiceover, pollVoiceover, listVoices, listVoicesByProvider,
  // previewVoice, inworldVoiceover, generateMusic, checkMusicStatus,
  // submitTranscription, pollTranscription
  generateVoiceover,
  pollVoiceover,
  listVoices,
  listVoicesByProvider,
  previewVoice,
  inworldVoiceover,
  generateMusic,
  checkMusicStatus,
  submitTranscription,
  pollTranscription,

  // ── Phase 9 · thumbnails & LLM plumbing (3, batches/phase9.json) ──────────
  // invokeLLM and callClaudeProxy are wired above (hand-written). The other 3:
  // analyzeForThumbnail, newThumbnailConcept, safeGeminiCall
  analyzeForThumbnail,
  newThumbnailConcept,
  safeGeminiCall,


  // ── Phase 11 · topics, SEO & b-roll (8, batches/phase11.json) ─────────────
  // parseAndScheduleTopics,
  // generateSeoTitlesDescriptions, generateSeoDescriptions, searchBrollVideos,
  // autoBrollPopulate, sleepBrollPopulate
  parseAndScheduleTopics,
  generateSeoTitlesDescriptions,
  generateSeoDescriptions,
  searchBrollVideos,
  autoBrollPopulate,
  sleepBrollPopulate,
  //
  // NOTE autoBrollPopulate/sleepBrollPopulate are invoked by a DYNAMIC name in
  // AutoBrollButton.jsx — grep for their literal names finds nothing. They are live.
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);
