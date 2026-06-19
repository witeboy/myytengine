import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

// Patch functions.invoke to auto-append /entry for nested functions
// Flat functions (deployed at their root path) bypass the suffix
const FLAT_FUNCTIONS = new Set([
  'youtubeAuth',
  'initializeScriptBatches',
  'generateScriptBatches',
  'sleepSceneBreakdown',
  'sleepBrollPopulate',
  'generateSceneBreakdown',
  'generateScenePrompts',
  'generateSceneImage',
  'generateSceneVideo',
  'pollSceneImage',
  'extractCharacterDNA',
  'callClaudeProxy',
  'listVoices',
  'listVoicesByProvider',
  'analyzeYouTubeVideo',
  'autoEditPipeline',
  'thumbnailBlend',
  'pollThumbnailTask',
  'pollTranscription',
  'repurposeCompetitorVideo',
  'detectFaceRegion',
  'enhanceClipForFYP',
  'generateProgressionImage',
  'generateProgressionPrompts',
  'generateProgressionVideo',
  'longViralGenerateScript',
  'scheduleClipPost',
  'proxyFetchAsset',
  'generateThumbnailImage',
]);
const _originalInvoke = base44.functions.invoke.bind(base44.functions);
base44.functions.invoke = (name, ...args) => {
  if (FLAT_FUNCTIONS.has(name) || name.endsWith('/entry')) {
    return _originalInvoke(name, ...args);
  }
  return _originalInvoke(`${name}/entry`, ...args);
};