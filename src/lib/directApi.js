// ─────────────────────────────────────────────────────────────────────────────
// directApi.js
// - Cloudinary: direct browser upload (cloud name from localStorage/Settings)
// - AssemblyAI: via quickPublishTranscribe backend function (has the key)
// - Cobalt: via cobaltExtract backend function (has the key)
// - Claude: via callClaudeProxy backend function (reads ANTHROPIC_API_KEY from env)
//
// FIX: Removed direct fetch to api.anthropic.com which is blocked by CORS.
//      Claude calls now go through base44.functions.invoke('callClaudeProxy')
//      which runs server-side in Deno with the ANTHROPIC_API_KEY env var.
// ─────────────────────────────────────────────────────────────────────────────
import { base44 } from '@/api/base44Client';

export const LS_KEYS = {};

// ─────────────────────────────────────────────────────────────────────────────
// 1. BUNNY — upload via bunnyUpload Deno function
//    Exported as uploadToCloudinary so OpenShorts + QuickPublish need no changes
// ─────────────────────────────────────────────────────────────────────────────
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });

export const uploadToCloudinary = async (file, { resourceType = 'video', onProgress } = {}) => {
  if (onProgress) onProgress(5);
  const file_data_base64 = await fileToBase64(file);
  if (onProgress) onProgress(30);

  const res = await base44.functions.invoke('generateOutline', {
    file_data_base64,
    file_name: file.name || 'video.mp4',
    file_type: file.type || 'video/mp4',
  });

  if (onProgress) onProgress(95);
  if (res.data?.error) throw new Error('Bunny upload error: ' + res.data.error);
  if (!res.data?.secure_url) throw new Error('Bunny upload returned no URL');
  if (onProgress) onProgress(100);

  return {
    secure_url: res.data.secure_url,
    public_id:  res.data.secure_url,
    cdn_url:    res.data.cdn_url,
  };
};

export const getCloudinaryConfig = async () => ({ cloudName: 'bunny', cloudPreset: '' });

export const buildCloudinaryClipUrl = (_publicId, _cloudName, _start, _end) => _publicId;

// ─────────────────────────────────────────────────────────────────────────────
// 2. ASSEMBLYAI — via quickPublishTranscribe backend (ASSEMBLYAI_API_KEY lives there)
// ─────────────────────────────────────────────────────────────────────────────
export const transcribeFile = async (fileOrUrl, onStatus) => {
  let audioUrl = fileOrUrl;

  if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
    if (onStatus) onStatus('Uploading to Cloudinary...');
    const uploaded = await uploadToCloudinary(fileOrUrl, {
      resourceType: 'video',
      onProgress: pct => { if (onStatus) onStatus(`Uploading... ${pct}%`); },
    });
    audioUrl = uploaded.secure_url;
  }

  if (onStatus) onStatus('Submitting to AssemblyAI...');

  const submitRes = await base44.functions.invoke('quickPublishTranscribe', {
    action:   'submit',
    file_url: audioUrl,
  });
  const transcriptId = submitRes.data?.transcript_id;
  if (!transcriptId) throw new Error(submitRes.data?.error || 'Transcription submit failed — no transcript ID returned');

  const startedAt = Date.now();
  for (let attempts = 0; attempts < 180; attempts++) {
    const interval = attempts < 12 ? 5000 : attempts < 60 ? 10000 : 15000;
    await new Promise(r => setTimeout(r, interval));
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    if (onStatus) onStatus(`Transcribing... (${elapsed}s elapsed)`);

    let pollRes;
    try {
      pollRes = await base44.functions.invoke('quickPublishTranscribe', {
        action:        'poll',
        transcript_id: transcriptId,
      });
    } catch (_) { continue; }

    if (pollRes.data?.status === 'completed') {
      return {
        text:       pollRes.data.text      || '',
        words:      pollRes.data.words     || [],
        chapters:   pollRes.data.chapters  || [],
        duration:   pollRes.data.duration  || 0,
        word_count: (pollRes.data.words    || []).length,
      };
    }
    if (pollRes.data?.status === 'error') {
      throw new Error(pollRes.data?.error || 'Transcription failed');
    }
  }
  throw new Error('Transcription timed out after 30 minutes');
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. COBALT — via cobaltExtract backend function
// ─────────────────────────────────────────────────────────────────────────────
export const extractYouTubeAudio = async (youtubeUrl) => {
  const res = await base44.functions.invoke('cobaltExtract', { url: youtubeUrl });
  const audioUrl = res.data?.url || res.data?.audio_url;
  if (!audioUrl) throw new Error(res.data?.error || 'Cobalt extraction failed — no audio URL returned');
  return audioUrl;
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. CLAUDE — via callClaudeProxy Deno backend function (no CORS)
//
// Routes through base44.functions.invoke('callClaudeProxy').
// That backend reads ANTHROPIC_API_KEY from Deno.env and calls
// api.anthropic.com server-to-server — identical to generateScenePrompts.js.
// ─────────────────────────────────────────────────────────────────────────────
const callClaude = async (system, user, { maxTokens = 2000 } = {}) => {
  const res = await base44.functions.invoke('generateSceneBreakdown', {
    __claude_passthrough: true,
    system,
    prompt:     user,
    max_tokens: maxTokens,
  });

  if (res.data?.error) throw new Error('Claude error: ' + res.data.error);
  const text = res.data?.text || res.data?.content || res.data?.result || '';
  if (!text) throw new Error('callClaudeProxy returned empty response: ' + JSON.stringify(res.data).slice(0, 200));
  return text;
};

const parseJson = (raw) => {
  if (!raw || typeof raw !== 'string') throw new Error('Claude returned empty or non-string response');
  const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  return JSON.parse(clean);
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. VIRAL MOMENT ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────
export const analyzeViralMoments = async ({
  transcript, words, duration,
  maxClips = 8, minSeconds = 20, maxSeconds = 60, context = '',
}) => {
  const raw = await callClaude(
    `You are a viral content strategist. Find the most viral moments in a transcript.
Always respond with valid JSON only — no preamble, no markdown fences.`,
    `Find the ${maxClips} most viral moments in this video.
${context ? `Context: ${context}` : ''}
Duration: ${Math.round(duration)}s. Each clip: ${minSeconds}s-${maxSeconds}s.

WORD TIMESTAMPS:
${JSON.stringify(words.slice(0, 3000))}

TRANSCRIPT:
${transcript.slice(0, 6000)}

Return JSON:
{
  "clips": [{
    "start": <seconds>, "end": <seconds>, "duration": <seconds>,
    "virality_score": <1-10>, "virality_reason": "<why>",
    "viral_hook_text": "<1-line hook>",
    "category": "<hook|story|insight|controversy|emotional|educational>",
    "video_title_for_youtube_short": "<title>",
    "video_description_for_tiktok": "<caption+hashtags>",
    "video_description_for_instagram": "<caption>"
  }]
}
Sort by virality_score descending.`,
    { maxTokens: 3000 }
  );
  return parseJson(raw);
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. SEO GENERATION
// ─────────────────────────────────────────────────────────────────────────────
export const generateSeo = async ({ transcript, niche, channelName = '' }) => {
  const raw = await callClaude(
    `You are an expert YouTube SEO strategist. Respond ONLY with valid JSON — no preamble, no markdown fences.`,
    `Generate a complete YouTube SEO package.
Niche: ${niche}${channelName ? `\nChannel: ${channelName}` : ''}

TRANSCRIPT:
${transcript.slice(0, 8000)}

Return JSON:
{
  "titles": [{ "title": "<title>", "hook_type": "<curiosity|shock|how-to|list|story>", "ctr_score": <1-10> }],
  "descriptions": [{ "style": "<storytelling|direct|seo-heavy>", "content": "<full description>" }],
  "tags_breakdown": { "short": ["<tag>"], "medium": ["<tag>"], "long": ["<tag>"] },
  "hashtags": ["#tag"],
  "pinned_comment": "<engaging pinned comment>",
  "seo_analysis": {
    "primary_keyword": "<kw>", "secondary_keywords": ["<kw>"],
    "search_intent": "<informational|entertainment|tutorial>",
    "competition_level": "<low|medium|high>",
    "recommended_upload_time": "<e.g. Tue-Thu 2-4pm EST>"
  }
}
Generate 5 titles, 3 descriptions, 20 short tags, 15 medium tags, 10 long tags, 10 hashtags.`,
    { maxTokens: 3000 }
  );
  return parseJson(raw);
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. THUMBNAIL CONCEPTS
// ─────────────────────────────────────────────────────────────────────────────
export const generateThumbnailConcepts = async ({ videoTitle, transcript, niche }) => {
  const raw = await callClaude(
    `You are a world-class YouTube thumbnail designer. Respond ONLY with valid JSON — no preamble, no markdown fences.`,
    `Create 3 high-CTR thumbnail concepts.
Title: ${videoTitle}
Niche: ${niche}
Transcript excerpt: ${transcript.slice(0, 2000)}

Return JSON:
{
  "concepts": [{
    "concept_name": "<name>",
    "background_description": "<scene for image AI>",
    "overlay_text": "<max 4 words>",
    "overlay_style": "<mrbeast|hormozi|nollywood_drama|playful|red_block>",
    "emotion": "<shock|curiosity|excitement|fear|joy>",
    "color_palette": ["#hex"],
    "ctr_prediction": <1-10>,
    "reasoning": "<why this works>"
  }]
}`,
    { maxTokens: 2000 }
  );
  return parseJson(raw);
};