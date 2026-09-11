// BYOK provider catalog.
//
// Single source of truth for: which keys the app accepts, what Settings renders,
// and how each key is validated. Provider ids ARE the original Base44 env var names
// so ported functions read naturally:
//     const key = await ctx.keys.require('GEMINI_API_KEY');
//
// `tier` drives graceful degradation:
//   core        - the app cannot run without it
//   recommended - a real feature is unavailable without it, but nothing crashes
//   optional    - unlocks an alternative provider path that already exists in the
//                 code; when absent the primary provider is used instead
//
// Auth shapes below were read out of the original functions, not guessed:
//   AI33 -> `xi-api-key` (ElevenLabs-compatible proxy)   KIE -> `Authorization: Bearer`

export type Tier = 'core' | 'recommended' | 'optional';

export interface ProviderDef {
  id: string;
  label: string;
  group: string;
  tier: Tier;
  secret: boolean;        // false => plain config value (e.g. a URL), still stored encrypted
  placeholder: string;
  /** Shown under the field in Settings. Say what breaks without it. */
  help: string;
  docsUrl: string;
  /** Validate a key. Resolve = valid. Reject with a message = invalid. */
  test: (key: string) => Promise<void>;
}

/**
 * Most providers have no cheap "verify key" endpoint. Rather than invent one, we
 * make a real request and treat only an auth rejection as failure — any other
 * response proves the credential was accepted.
 */
async function probe(
  url: string,
  init: RequestInit,
  label: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch (e: any) {
    throw new Error(`Could not reach ${label}: ${e?.message || e}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${label} rejected this key (HTTP ${res.status})`);
  }
  if (res.status === 429) throw new Error(`${label} rate-limited — try again shortly`);
}

export const PROVIDERS: ProviderDef[] = [
  // ── Core ───────────────────────────────────────────────────────────────────
  {
    id: 'CHEAPER_INFERENCE_API_KEY',
    label: 'CheaperInference',
    group: 'Text & Vision',
    tier: 'core',
    secret: true,
    placeholder: 'ci_live_…',
    help: 'Routes every LLM call — Claude, GPT and Gemini — through one marketplace key, billed at the lower of marketplace or list price. This is the default for all text and vision generation: scripts, scene breakdowns, the prompt engine, thumbnails and SEO.',
    docsUrl: 'https://platform.cheaperinference.com/docs',
    test: (k) =>
      probe(
        'https://api.cheaperinference.com/v1/models',
        { method: 'GET', headers: { Authorization: `Bearer ${k}` } },
        'CheaperInference',
      ),
  },
  {
    id: 'GEMINI_API_KEY',
    label: 'Google Gemini (direct)',
    group: 'Text & Vision',
    tier: 'optional',
    secret: true,
    placeholder: 'AIza…',
    help: 'Only used when AI_PROVIDER_MODE=gateway, which bypasses the aggregator and calls Google directly. Needed for Gemini video understanding, which the OpenAI-compatible aggregator surface cannot carry. Leave blank on the default routing.',
    docsUrl: 'https://aistudio.google.com/apikey',
    test: (k) =>
      probe(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`,
        { method: 'GET' },
        'Google AI Studio',
      ),
  },
  {
    id: 'KIE_API_KEY',
    label: 'KIE.ai',
    group: 'Image & Video',
    tier: 'core',
    secret: true,
    placeholder: 'kie-…',
    help: 'All image generation, video generation and thumbnail rendering. (Music moved to AI33.)',
    docsUrl: 'https://kie.ai',
    test: (k) =>
      probe(
        'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=connectivity-probe',
        { method: 'GET', headers: { Authorization: `Bearer ${k}` } },
        'KIE.ai',
      ),
  },
  {
    id: 'AI33_API_KEY',
    label: 'AI33.pro',
    group: 'Audio',
    tier: 'core',
    secret: true,
    placeholder: 'sk-…',
    help: 'All audio generation: text-to-speech, multi-speaker dialogue, the voice library, voice cloning, sound effects and Suno background music. Core to the engine.',
    docsUrl: 'https://ai33.pro',
    test: (k) =>
      probe(
        // Documented v3 voice library; `provider` is a required parameter.
        'https://api.ai33.pro/v3/voices?provider=elevenlabs&page=1&page_size=1',
        { method: 'GET', headers: { 'xi-api-key': k } },
        'AI33.pro',
      ),
  },

  // ── Recommended ────────────────────────────────────────────────────────────
  {
    id: 'ANTHROPIC_API_KEY',
    label: 'Anthropic Claude (direct)',
    group: 'Text & Vision',
    tier: 'optional',
    secret: true,
    placeholder: 'sk-ant-…',
    help: 'Only used when AI_PROVIDER_MODE=gateway. On the default routing Claude comes through CheaperInference, so leave this blank.',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    test: (k) =>
      probe(
        'https://api.anthropic.com/v1/models',
        { method: 'GET', headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' } },
        'Anthropic',
      ),
  },
  {
    id: 'OPENAI_API_KEY',
    label: 'OpenAI (direct)',
    group: 'Text & Vision',
    tier: 'optional',
    secret: true,
    placeholder: 'sk-…',
    help: 'Only used when AI_PROVIDER_MODE=gateway. On the default routing GPT comes through CheaperInference, so leave this blank.',
    docsUrl: 'https://platform.openai.com/api-keys',
    test: (k) =>
      probe(
        'https://api.openai.com/v1/models',
        { method: 'GET', headers: { Authorization: `Bearer ${k}` } },
        'OpenAI',
      ),
  },
  {
    id: 'PEXELS_API_KEY',
    label: 'Pexels',
    group: 'Stock footage',
    tier: 'recommended',
    secret: true,
    placeholder: '563492ad…',
    help: 'Free stock b-roll for auto-populate. Pairs with Pixabay — supply either or both.',
    docsUrl: 'https://www.pexels.com/api/',
    test: (k) =>
      probe(
        'https://api.pexels.com/v1/search?query=city&per_page=1',
        { method: 'GET', headers: { Authorization: k } },
        'Pexels',
      ),
  },
  {
    id: 'PIXABAY_API_KEY',
    label: 'Pixabay',
    group: 'Stock footage',
    tier: 'recommended',
    secret: true,
    placeholder: '12345678-…',
    help: 'Second source of free stock b-roll, searched alongside Pexels.',
    docsUrl: 'https://pixabay.com/api/docs/',
    test: (k) =>
      probe(
        `https://pixabay.com/api/?key=${encodeURIComponent(k)}&q=city&per_page=3`,
        { method: 'GET' },
        'Pixabay',
      ),
  },

  // ── Optional ───────────────────────────────────────────────────────────────
  {
    id: 'ASSEMBLYAI_API_KEY',
    label: 'AssemblyAI',
    group: 'Transcription',
    tier: 'optional',
    secret: true,
    placeholder: 'a1b2c3…',
    help: 'Speech-to-text. Best-in-class word-level timings, which drive caption auto-sync and silence trimming. Without it transcription runs on Whisper via Workers AI — free, but timing precision may be lower. (AI33 handles speech OUT; this is speech IN.)',
    docsUrl: 'https://www.assemblyai.com/app/account',
    test: (k) =>
      probe(
        'https://api.assemblyai.com/v2/transcript?limit=1',
        { method: 'GET', headers: { authorization: k } },
        'AssemblyAI',
      ),
  },
  {
    id: 'MINIMAX_API_KEY',
    label: 'MiniMax',
    group: 'Audio',
    tier: 'optional',
    secret: true,
    placeholder: 'eyJ…',
    help: 'Legacy alternative TTS path, opt-in per request. Voice and sound effects now run on AI33 — leave this blank unless you specifically want MiniMax voices.',
    docsUrl: 'https://www.minimax.io/platform',
    test: (k) =>
      probe(
        'https://api.minimax.io/v1/get_voice',
        { method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }, body: '{"voice_type":"system"}' },
        'MiniMax',
      ),
  },
  {
    id: 'INWORLD_API_KEY',
    label: 'Inworld',
    group: 'Audio',
    tier: 'optional',
    secret: true,
    placeholder: 'Basic …',
    help: 'A third TTS voice set. Purely additive — leave blank unless you use these voices.',
    docsUrl: 'https://platform.inworld.ai',
    test: (k) =>
      probe(
        'https://api.inworld.ai/tts/v1/voices',
        { method: 'GET', headers: { Authorization: `Basic ${k}` } },
        'Inworld',
      ),
  },
  {
    id: 'YOUTUBE_API_KEY',
    label: 'YouTube Data API',
    group: 'YouTube',
    tier: 'optional',
    secret: true,
    placeholder: 'AIza…',
    help: 'Read-only channel and video metadata used when scheduling topics. No upload access.',
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
    test: (k) =>
      probe(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=${encodeURIComponent(k)}`,
        { method: 'GET' },
        'YouTube Data API',
      ),
  },
  // COBALT_API_URL was removed with the Clip Extractor feature on 2026-09-11 (owner decision).
];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);
export const getProvider = (id: string) => PROVIDERS.find((p) => p.id === id);

/** Safe to serialize to the browser — contains no secrets and no functions. */
export const publicCatalog = () =>
  PROVIDERS.map(({ id, label, group, tier, secret, placeholder, help, docsUrl }) => ({
    id,
    label,
    group,
    tier,
    secret,
    placeholder,
    help,
    docsUrl,
  }));
