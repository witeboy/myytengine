// ─────────────────────────────────────────────────────────────────────────────
// directApi.js  —  Drop-in replacements for all base44 integration calls
// No base44 dependencies. All keys stored in localStorage.
// ─────────────────────────────────────────────────────────────────────────────

// ── localStorage key constants ────────────────────────────────────────────────
export const LS_KEYS = {
  CLOUD_NAME:    'openshorts_cloud_name',
  CLOUD_PRESET:  'openshorts_cloud_preset',
  ASSEMBLYAI:    'directapi_assemblyai_key',
  ANTHROPIC:     'directapi_anthropic_key',   // only needed if not using Claude artifact proxy
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. CLOUDINARY — upload any File/Blob and return a permanent CDN URL
//    Works for both video and image resource types.
// ─────────────────────────────────────────────────────────────────────────────
export const uploadToCloudinary = (file, { resourceType = 'video', onProgress } = {}) => {
  const cloudName = localStorage.getItem(LS_KEYS.CLOUD_NAME);
  const preset    = localStorage.getItem(LS_KEYS.CLOUD_PRESET) || 'openshorts_clips';

  if (!cloudName) {
    return Promise.reject(
      new Error('Cloudinary cloud name not set. Open Settings and add your Cloud Name.')
    );
  }

  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', preset);
    fd.append('resource_type', resourceType);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (res.error) return reject(new Error(res.error.message || 'Cloudinary upload failed'));
        resolve(res); // res.secure_url is the CDN URL
      } catch (e) {
        reject(new Error('Cloudinary response parse error'));
      }
    };
    xhr.onerror = () => reject(new Error('Cloudinary network error'));
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`);
    xhr.send(fd);
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. ASSEMBLYAI — submit + poll transcription
//    Returns: { text, words, chapters, duration, word_count }
// ─────────────────────────────────────────────────────────────────────────────
const AAI_BASE = 'https://api.assemblyai.com/v2';

const aaiHeaders = () => {
  const key = localStorage.getItem(LS_KEYS.ASSEMBLYAI);
  if (!key) throw new Error('AssemblyAI key not set. Open Settings and add your AssemblyAI API key.');
  return { authorization: key, 'content-type': 'application/json' };
};

/**
 * Upload a file directly to AssemblyAI's upload endpoint.
 * Returns the upload_url to use in submitTranscription.
 */
export const uploadToAssemblyAI = async (file, onProgress) => {
  const key = localStorage.getItem(LS_KEYS.ASSEMBLYAI);
  if (!key) throw new Error('AssemblyAI key not set. Open Settings and add your AssemblyAI API key.');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (res.error) return reject(new Error(res.error));
        resolve(res.upload_url);
      } catch (e) {
        reject(new Error('AssemblyAI upload parse error'));
      }
    };
    xhr.onerror = () => reject(new Error('AssemblyAI upload network error'));
    xhr.open('POST', `${AAI_BASE}/upload`);
    xhr.setRequestHeader('authorization', key);
    xhr.send(file);
  });
};

/**
 * Submit a transcription job.
 * audioUrl can be any public URL (Cloudinary, AssemblyAI upload, etc.)
 * Returns transcript_id.
 */
export const submitTranscription = async (audioUrl, opts = {}) => {
  const res = await fetch(`${AAI_BASE}/transcript`, {
    method: 'POST',
    headers: aaiHeaders(),
    body: JSON.stringify({
      audio_url: audioUrl,
      auto_chapters: true,
      word_boost: opts.wordBoost || [],
      ...opts.extra,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error('AssemblyAI submit error: ' + data.error);
  return data.id;
};

/**
 * Poll until transcript is complete or failed.
 * onStatus(msg) called each poll cycle.
 * Returns full transcript object.
 */
export const pollTranscription = async (transcriptId, onStatus, { maxMinutes = 30 } = {}) => {
  const startedAt    = Date.now();
  const maxMs        = maxMinutes * 60 * 1000;
  let   attempts     = 0;

  while (Date.now() - startedAt < maxMs) {
    const interval = attempts < 12 ? 5000 : attempts < 60 ? 10000 : 15000;
    await new Promise(r => setTimeout(r, interval));
    attempts++;

    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    if (onStatus) onStatus(`Transcribing… (${elapsed}s elapsed)`);

    let data;
    try {
      const res = await fetch(`${AAI_BASE}/transcript/${transcriptId}`, {
        headers: aaiHeaders(),
      });
      data = await res.json();
    } catch (_) {
      continue; // transient network error — keep polling
    }

    if (data.status === 'completed') {
      return {
        text:        data.text || '',
        words:       data.words || [],
        chapters:    data.chapters || [],
        duration:    data.audio_duration || 0,
        word_count:  (data.words || []).length,
      };
    }
    if (data.status === 'error') {
      throw new Error('AssemblyAI transcription error: ' + (data.error || 'unknown'));
    }
  }
  throw new Error(`Transcription timed out after ${maxMinutes} minutes`);
};

/**
 * All-in-one: upload file → submit → poll → return transcript.
 * Accepts a File/Blob or a public URL string.
 * onStatus(msg) for progress updates.
 */
export const transcribeFile = async (fileOrUrl, onStatus) => {
  let audioUrl = fileOrUrl;

  if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
    if (onStatus) onStatus('Uploading audio to AssemblyAI…');
    audioUrl = await uploadToAssemblyAI(fileOrUrl, (pct) => {
      if (onStatus) onStatus(`Uploading… ${pct}%`);
    });
  }

  if (onStatus) onStatus('Submitting transcription job…');
  const transcriptId = await submitTranscription(audioUrl);

  return pollTranscription(transcriptId, onStatus);
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. ANTHROPIC — direct /v1/messages calls (same as artifact pattern)
//    Uses the artifact proxy endpoint so no API key needed client-side.
// ─────────────────────────────────────────────────────────────────────────────
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL    = 'claude-sonnet-4-20250514';

const callClaude = async (systemPrompt, userContent, { maxTokens = 2000 } = {}) => {
  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error('Claude API error: ' + (data.error.message || JSON.stringify(data.error)));
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return text;
};

const parseJson = (raw) => {
  const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  return JSON.parse(clean);
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. VIRAL MOMENT ANALYSIS  (replaces analyzeViralMoments base44 function)
// ─────────────────────────────────────────────────────────────────────────────
export const analyzeViralMoments = async ({
  transcript,
  words,
  duration,
  maxClips    = 8,
  minSeconds  = 20,
  maxSeconds  = 60,
  context     = '',
}) => {
  const system = `You are a viral content strategist specializing in short-form video.
Your job: find the most viral, shareable moments in a transcript.
Always respond with valid JSON only — no preamble, no markdown fences.`;

  const user = `Analyze this transcript and find the ${maxClips} most viral moments.
${context ? `Context: ${context}` : ''}
Video duration: ${Math.round(duration)}s
Each clip must be between ${minSeconds}s and ${maxSeconds}s.

WORDS WITH TIMESTAMPS (use these for precise start/end):
${JSON.stringify(words.slice(0, 3000))}

FULL TRANSCRIPT:
${transcript.slice(0, 6000)}

Return JSON:
{
  "clips": [
    {
      "start": <number, seconds>,
      "end": <number, seconds>,
      "duration": <number>,
      "virality_score": <1-10>,
      "virality_reason": "<why this moment is viral>",
      "viral_hook_text": "<punchy 1-line hook for overlay>",
      "category": "<hook|story|insight|controversy|emotional|educational>",
      "video_title_for_youtube_short": "<optimized YT Shorts title>",
      "video_description_for_tiktok": "<TikTok caption with hashtags>",
      "video_description_for_instagram": "<IG Reels caption>"
    }
  ]
}

Sort by virality_score descending. Ensure start/end align to word boundaries from the timestamps.`;

  const raw   = await callClaude(system, user, { maxTokens: 3000 });
  const data  = parseJson(raw);
  return data; // { clips: [...] }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. SEO GENERATION  (replaces quickPublishSeo base44 function)
// ─────────────────────────────────────────────────────────────────────────────
export const generateSeo = async ({ transcript, niche, channelName = '' }) => {
  const system = `You are an expert YouTube SEO strategist.
Respond ONLY with valid JSON — no preamble, no markdown fences.`;

  const user = `Generate complete YouTube SEO package for this video.
Niche: ${niche}
${channelName ? `Channel: ${channelName}` : ''}

TRANSCRIPT (first 8000 chars):
${transcript.slice(0, 8000)}

Return JSON exactly:
{
  "titles": [
    { "title": "<title>", "hook_type": "<curiosity|shock|how-to|list|story>", "ctr_score": <1-10> }
  ],
  "descriptions": [
    { "style": "<storytelling|direct|seo-heavy>", "content": "<full description with timestamps placeholder>" }
  ],
  "tags_breakdown": {
    "short":  ["<1-2 word tags>"],
    "medium": ["<3-4 word tags>"],
    "long":   ["<5+ word long-tail tags>"]
  },
  "hashtags": ["#tag1", "#tag2"],
  "pinned_comment": "<engaging pinned comment to boost engagement>",
  "seo_analysis": {
    "primary_keyword": "<main keyword>",
    "secondary_keywords": ["<kw2>", "<kw3>"],
    "search_intent": "<informational|entertainment|tutorial>",
    "competition_level": "<low|medium|high>",
    "recommended_upload_time": "<e.g. Tue-Thu 2-4pm EST>"
  }
}

Generate 5 titles, 3 descriptions, 20 short tags, 15 medium tags, 10 long tags, 10 hashtags.`;

  const raw  = await callClaude(system, user, { maxTokens: 3000 });
  return parseJson(raw);
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. THUMBNAIL CONCEPTS  (replaces generateThumbnails base44 function)
//    Returns concept objects (no DB writes — caller manages state)
// ─────────────────────────────────────────────────────────────────────────────
export const generateThumbnailConcepts = async ({ videoTitle, transcript, niche }) => {
  const system = `You are a world-class YouTube thumbnail designer.
Respond ONLY with valid JSON — no preamble, no markdown fences.`;

  const user = `Create 3 high-CTR thumbnail concepts for this YouTube video.
Title: ${videoTitle}
Niche: ${niche}
Transcript excerpt: ${transcript.slice(0, 2000)}

Return JSON:
{
  "concepts": [
    {
      "concept_name": "<name>",
      "background_description": "<detailed background scene description for image AI>",
      "overlay_text": "<short punchy text, max 4 words>",
      "overlay_style": "<mrbeast|hormozi|nollywood_drama|playful|red_block>",
      "emotion": "<shock|curiosity|excitement|fear|joy>",
      "color_palette": ["#hex1", "#hex2", "#hex3"],
      "ctr_prediction": <1-10>,
      "reasoning": "<why this thumbnail works>"
    }
  ]
}`;

  const raw  = await callClaude(system, user, { maxTokens: 2000 });
  return parseJson(raw); // { concepts: [...] }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. YOUTUBE MODE ANALYSIS via Gemini-style prompt to Claude
//    (replaces analyzeVideoWithGemini — Claude can't watch video directly,
//     so we use the transcript approach with a YouTube URL as context)
// ─────────────────────────────────────────────────────────────────────────────
export const analyzeYouTubeUrl = async ({ videoUrl, maxClips, minSec, maxSec }) => {
  // For YouTube mode without a transcript we ask Claude to generate
  // plausible clip structures based on the URL context.
  // In practice you'll want to first transcribe via AssemblyAI using
  // the Cobalt-extracted audio URL, then call analyzeViralMoments.
  // This stub keeps the OpenShorts YouTube flow intact.
  throw new Error(
    'YouTube analysis requires transcription first. ' +
    'Please use File Upload mode, or paste the YouTube URL into the URL field ' +
    'to extract audio and then transcribe.'
  );
};
