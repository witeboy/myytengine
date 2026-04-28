// ─────────────────────────────────────────────────────────────────────────────
// directApi.js — 100% browser-direct API calls. Zero base44 dependencies.
//
// Keys stored in localStorage (set via OpenShorts Settings panel):
//   openshorts_cloud_name    — Cloudinary cloud name
//   openshorts_cloud_preset  — Cloudinary unsigned upload preset
//   ASSEMBLYAI_API_KEY       — AssemblyAI API key
//   COBALT_API_URL           — Cobalt instance URL (for YouTube audio extraction)
// ─────────────────────────────────────────────────────────────────────────────

export const LS_KEYS = {
  CLOUD_NAME:   'openshorts_cloud_name',
  CLOUD_PRESET: 'openshorts_cloud_preset',
  ASSEMBLYAI:   'ASSEMBLYAI_API_KEY',
  COBALT_URL:   'COBALT_API_URL',
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. CLOUDINARY — direct browser unsigned upload
// ─────────────────────────────────────────────────────────────────────────────
export const getCloudinaryConfig = () => ({
  cloudName: localStorage.getItem(LS_KEYS.CLOUD_NAME) || '',
  preset:    localStorage.getItem(LS_KEYS.CLOUD_PRESET) || 'openshorts_clips',
});

export const uploadToCloudinary = (file, { resourceType = 'video', onProgress } = {}) => {
  const { cloudName, preset } = getCloudinaryConfig();
  if (!cloudName) throw new Error('Cloudinary Cloud Name not set — open Settings to add it.');

  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file',          file);
    fd.append('upload_preset', preset);
    fd.append('resource_type', resourceType);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (res.error) return reject(new Error(res.error.message || 'Cloudinary upload failed'));
        resolve(res);
      } catch { reject(new Error('Cloudinary response parse error')); }
    };
    xhr.onerror = () => reject(new Error('Cloudinary network error'));
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`);
    xhr.send(fd);
  });
};

export const buildCloudinaryClipUrl = (publicId, cloudName, start, end) => {
  const dur       = Math.round(end - start);
  const transform = `so_${Math.round(start)},du_${dur},c_fill,ar_9:16,w_720,q_auto,f_mp4`;
  return `https://res.cloudinary.com/${cloudName}/video/upload/${transform}/${publicId}.mp4`;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. ASSEMBLYAI — direct browser calls
// ─────────────────────────────────────────────────────────────────────────────
const AAI = 'https://api.assemblyai.com/v2';

const aaiKey = () => {
  const key = localStorage.getItem(LS_KEYS.ASSEMBLYAI);
  if (!key) throw new Error('AssemblyAI API key not set — open Settings to add it.');
  return key;
};

export const uploadToAssemblyAI = (file, onProgress) =>
  new Promise((resolve, reject) => {
    const key = aaiKey();
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (res.error) return reject(new Error(res.error));
        resolve(res.upload_url);
      } catch { reject(new Error('AssemblyAI upload parse error')); }
    };
    xhr.onerror = () => reject(new Error('AssemblyAI upload network error'));
    xhr.open('POST', `${AAI}/upload`);
    xhr.setRequestHeader('authorization', key);
    xhr.send(file);
  });

export const transcribeFile = async (fileOrUrl, onStatus) => {
  let audioUrl = fileOrUrl;

  if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
    if (onStatus) onStatus('Uploading audio to AssemblyAI...');
    audioUrl = await uploadToAssemblyAI(fileOrUrl, pct => {
      if (onStatus) onStatus(`Uploading... ${pct}%`);
    });
  }

  if (onStatus) onStatus('Submitting transcription job...');

  const submitRes = await fetch(`${AAI}/transcript`, {
    method:  'POST',
    headers: { authorization: aaiKey(), 'content-type': 'application/json' },
    body:    JSON.stringify({ audio_url: audioUrl, auto_chapters: true }),
  });
  const submitData = await submitRes.json();
  if (submitData.error) throw new Error('AssemblyAI submit error: ' + submitData.error);
  const transcriptId = submitData.id;

  const startedAt = Date.now();
  for (let attempts = 0; attempts < 180; attempts++) {
    const interval = attempts < 12 ? 5000 : attempts < 60 ? 10000 : 15000;
    await new Promise(r => setTimeout(r, interval));
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    if (onStatus) onStatus(`Transcribing... (${elapsed}s elapsed)`);

    let data;
    try {
      const pollRes = await fetch(`${AAI}/transcript/${transcriptId}`, {
        headers: { authorization: aaiKey() },
      });
      data = await pollRes.json();
    } catch (_) { continue; }

    if (data.status === 'completed') {
      return {
        text:       data.text           || '',
        words:      data.words          || [],
        chapters:   data.chapters       || [],
        duration:   data.audio_duration || 0,
        word_count: (data.words || []).length,
      };
    }
    if (data.status === 'error') throw new Error('AssemblyAI error: ' + (data.error || 'unknown'));
  }
  throw new Error('Transcription timed out after 30 minutes');
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. COBALT — YouTube audio extraction (direct browser call)
// ─────────────────────────────────────────────────────────────────────────────
export const extractYouTubeAudio = async (youtubeUrl) => {
  const cobaltBase = localStorage.getItem(LS_KEYS.COBALT_URL) || 'https://api.cobalt.tools';
  const res = await fetch(`${cobaltBase}/api/json`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify({ url: youtubeUrl, aFormat: 'mp3', isAudioOnly: true }),
  });
  if (!res.ok) throw new Error(`Cobalt request failed (${res.status}). Check COBALT_API_URL in Settings.`);
  const data = await res.json();
  if (data.status === 'error' || data.status === 'rate-limit') {
    throw new Error(data.text || 'Cobalt extraction failed');
  }
  const audioUrl = data.url || data.picker?.[0]?.url;
  if (!audioUrl) throw new Error('Cobalt returned no audio URL');
  return audioUrl;
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. ANTHROPIC — direct /v1/messages (artifact proxy)
// ─────────────────────────────────────────────────────────────────────────────
const callClaude = async (system, user, { maxTokens = 2000 } = {}) => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages:   [{ role: 'user', content: user }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error('Claude error: ' + (data.error.message || JSON.stringify(data.error)));
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
};

const parseJson = (raw) => {
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