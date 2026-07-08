// ─────────────────────────────────────────────────────────────────────────────
// directApi.js
// - Cloudinary: direct browser upload (cloud name from localStorage/Settings)
// - AssemblyAI: via quickPublishTranscribe backend function (has the key)
// - YouTube: via downloadYouTubeVideo backend function, returning stable media URLs
// - Claude: via callClaudeProxy backend function (reads ANTHROPIC_API_KEY from env)
//
// FIX: Removed direct fetch to api.anthropic.com which is blocked by CORS.
//      Claude calls now go through base44.functions.invoke('callClaudeProxy')
//      which runs server-side in Deno with the ANTHROPIC_API_KEY env var.
// ─────────────────────────────────────────────────────────────────────────────
import { base44 } from '@/api/base44Client';

export const LS_KEYS = {};

const unwrapData = (res) => res?.data || res || {};

const uploadViaBase44 = async (file, onProgress) => {
  onProgress?.(5);
  const uploaded = await base44.integrations.Core.UploadFile({ file });
  const fileUrl = uploaded?.file_url || uploaded?.url || uploaded?.secure_url;
  if (!fileUrl) throw new Error('Base44 upload returned no file URL');
  onProgress?.(100);
  return {
    secure_url: fileUrl,
    public_id: fileUrl,
    cdn_url: fileUrl,
    storage: 'base44',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. BUNNY — upload via bunnyUpload Deno function
//    Exported as uploadToCloudinary so OpenShorts + QuickPublish need no changes
// ─────────────────────────────────────────────────────────────────────────────
export const uploadToCloudinary = async (file, { resourceType = 'video', onProgress } = {}) => {
  try {
    const configRes = await base44.functions.invoke('quickPublishTranscribe', { action: 'bunny_config' });
    const config = unwrapData(configRes);
    if (!config?.storage_zone || !config?.storage_password || !config?.cdn_url) {
      throw new Error('Bunny config missing');
    }

    const { storage_zone, storage_password, storage_region, cdn_url } = config;
    const host = (storage_region === 'de' || !storage_region || storage_region === 'storage')
      ? 'storage.bunnycdn.com'
      : `${storage_region}.storage.bunnycdn.com`;
    const safeFile = (file.name || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
    const remotePath = `uploads/${Date.now()}_${safeFile}`;
    const uploadUrl = `https://${host}/${storage_zone}/${remotePath}`;

    onProgress?.(5);

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 95));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Bunny upload failed: HTTP ${xhr.status} - ${xhr.responseText}`));
      };
      xhr.onerror = () => reject(new Error('Bunny upload failed or was blocked by CORS'));
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('AccessKey', storage_password);
      xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
      xhr.send(file);
    });

    onProgress?.(100);

    const secure_url = `${cdn_url.replace(/\/$/, '')}/${remotePath}`;
    return { secure_url, public_id: secure_url, cdn_url, storage: 'bunny' };
  } catch (err) {
    console.warn('[Upload] Bunny upload unavailable, falling back to Base44 storage:', err.message);
    return uploadViaBase44(file, onProgress);
  }
};

export const getCloudinaryConfig = async () => ({ cloudName: 'bunny', cloudPreset: '' });

export const buildCloudinaryClipUrl = (publicId, _cloudName, start, end) => {
  // Bunny CDN — no transform support. Store start/end as hash fragment.
  // FileClipCard uses these for seek-based preview.
  // Real clip cutting happens server-side via clipVideo action on download.
  return `${String(publicId).split('#')[0]}#t=${Math.round(start)},${Math.round(end)}`;
};

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
// 3. YOUTUBE RESOLUTION - via downloadYouTubeVideo backend function
// ─────────────────────────────────────────────────────────────────────────────
export const resolveYouTubeVideo = async (youtubeUrl) => {
  const res = await base44.functions.invoke('downloadYouTubeVideo', { url: youtubeUrl });
  const data = unwrapData(res);
  if (data?.error) throw new Error(data.error);

  const videoUrl = data.stable_video_url || data.video_url;
  const audioUrl = data.stable_audio_url || data.audio_url || videoUrl;
  if (!audioUrl) throw new Error('YouTube extraction failed - no audio URL returned');

  return {
    ...data,
    video_url: videoUrl,
    audio_url: audioUrl,
  };
};

export const extractYouTubeAudio = async (youtubeUrl) => {
  const data = await resolveYouTubeVideo(youtubeUrl);
  return data.audio_url;
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. CLAUDE — via callClaudeProxy Deno backend function (no CORS)
//
// Routes through base44.functions.invoke('callClaudeProxy').
// That backend reads ANTHROPIC_API_KEY from Deno.env and calls
// api.anthropic.com server-to-server — identical to generateScenePrompts.js.
// ─────────────────────────────────────────────────────────────────────────────
export const clipVideoCloud = async ({ sourceUrl, start, end }) => {
  const cleanUrl = String(sourceUrl || '').split('#')[0];
  const res = await base44.functions.invoke('quickPublishTranscribe', {
    action: 'clip_video',
    source_url: cleanUrl,
    start,
    end,
  });
  const data = unwrapData(res);
  if (data?.error) throw new Error(data.error);
  if (!data?.clip_url) throw new Error('Cloud clipper returned no clip URL');
  return data;
};

const callClaude = async (system, user, { maxTokens = 2000 } = {}) => {
  const res = await base44.functions.invoke('generateSceneBreakdown', {
    __claude_passthrough: true,
    system,
    prompt:     user,
    max_tokens: maxTokens,
  });

  if (res.data?.error) throw new Error('Claude error: ' + res.data.error);
  // Handle nested response shapes from generateSceneBreakdown passthrough
  const text = res.data?.text || res.data?.content || res.data?.result 
    || res.data?.data?.text || res.data?.data?.content || '';
  if (!text) {
    console.error('Claude passthrough full response:', JSON.stringify(res).slice(0, 500));
    throw new Error('Claude passthrough empty: ' + JSON.stringify(res.data).slice(0, 300));
  }
  return String(text);
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
  // Route through the dedicated analyzeViralMoments Deno backend
  // which calls Claude with max_tokens: 4096 and handles JSON parsing server-side
  const res = await base44.functions.invoke('analyzeViralMoments', {
    transcript,
    words,
    duration,
    max_clips:          maxClips,
    min_clip_seconds:   minSeconds,
    max_clip_seconds:   maxSeconds,
    context,
  });

  if (res.data?.error) throw new Error(res.data.error);

  const clips = res.data?.clips || [];
  if (!clips.length) throw new Error('No viral moments found. Try a different video.');

  // Normalize field names — backend uses title/hook, frontend expects viral_hook_text etc.
  return {
    clips: clips.map(c => ({
      ...c,
      viral_hook_text:                   c.hook  || c.viral_hook_text  || '',
      video_title_for_youtube_short:     c.title || c.video_title_for_youtube_short || '',
      video_description_for_tiktok:      c.video_description_for_tiktok   || c.title || '',
      video_description_for_instagram:   c.video_description_for_instagram || c.title || '',
      virality_reason:                   c.virality_reason || c.transcript_excerpt || '',
    })),
  };
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
