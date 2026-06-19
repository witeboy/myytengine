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

// Patch functions.invoke to be path-agnostic.
// Functions in this app are deployed either flat ("name") or nested ("name/entry").
// On a 404 we automatically fall back to the other form, then CACHE the working
// shape so each function only ever 404s once (or never, for known-flat ones).
const _originalInvoke = base44.functions.invoke.bind(base44.functions);
const is404 = (err) => (err?.response?.status || err?.status) === 404;

// Functions known to be deployed flat (no /entry subfolder) — try flat FIRST
// so they never emit even a single noisy 404.
const KNOWN_FLAT = new Set([
  'youtubeAuth', 'initializeScriptBatches', 'generateScriptBatches',
  'sleepSceneBreakdown', 'sleepBrollPopulate', 'generateSceneBreakdown',
  'generateScenePrompts', 'generateSceneImage', 'generateSceneVideo',
  'pollSceneImage', 'extractCharacterDNA', 'callClaudeProxy', 'listVoices',
  'listVoicesByProvider', 'analyzeYouTubeVideo', 'autoEditPipeline',
  'thumbnailBlend', 'pollThumbnailTask', 'pollTranscription',
  'repurposeCompetitorVideo', 'detectFaceRegion', 'enhanceClipForFYP',
  'generateProgressionImage', 'generateProgressionPrompts',
  'generateProgressionVideo', 'longViralGenerateScript', 'scheduleClipPost',
  'proxyFetchAsset', 'generateThumbnailImage',
]);

// Remembers the resolved path ('flat' | 'entry') per function after the first call.
const resolvedShape = new Map();

base44.functions.invoke = async (name, ...args) => {
  // Caller already specified a path shape — honor it directly.
  if (name.endsWith('/entry')) {
    return _originalInvoke(name, ...args);
  }

  const flatPath = name;
  const entryPath = `${name}/entry`;

  // Decide which path to try first: cached result > known-flat hint > nested default.
  const cached = resolvedShape.get(name);
  const tryFlatFirst = cached ? cached === 'flat' : KNOWN_FLAT.has(name);
  const firstPath = tryFlatFirst ? flatPath : entryPath;
  const fallbackPath = tryFlatFirst ? entryPath : flatPath;

  try {
    const res = await _originalInvoke(firstPath, ...args);
    resolvedShape.set(name, tryFlatFirst ? 'flat' : 'entry');
    return res;
  } catch (err) {
    if (is404(err)) {
      const res = await _originalInvoke(fallbackPath, ...args);
      resolvedShape.set(name, tryFlatFirst ? 'entry' : 'flat');
      return res;
    }
    throw err;
  }
};