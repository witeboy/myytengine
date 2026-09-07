// AI33.pro adapter — ALL audio out: TTS, dialogue, voice cloning, music and SFX.
//
// Endpoints below are taken from the official docs (https://ai33.pro/app/api-document),
// not inferred. Earlier revisions of this file guessed `/v1/sound-generation` and
// `/v1/music` from ElevenLabs compatibility; both were wrong. Do not re-guess — if
// something is missing, check the doc.
//
// AI33 is called DIRECTLY, never through an LLM gateway. Auth is `xi-api-key`.
//
// ── Endpoint map ──────────────────────────────────────────────────────────────
//   POST   /v3/text-to-speech                    FormData -> { success, task_id }
//   POST   /v3/text-to-speech/dialogue           multi-speaker
//   POST   /v3/text-to-speech/voice-clone        FormData -> { success, data:{voice_id} }
//   DELETE /v3/text-to-speech/voice-clone/{id}
//   GET    /v3/voices?provider=…                 normalized voice library
//   POST   /v1s/task/music-generation            Suno -> { success, task_id }
//   GET    /v1/task/{task_id}                    COMMON poll for every async task
//   CRUD   /v3/dictionaries                      pronunciation dictionaries
//
// ── Two rules that bite ───────────────────────────────────────────────────────
// 1. Every `voice_id` must carry a provider prefix: elevenlabs_ | minimax_ | clone_ |
//    edge_ | kokoro_ | vbee_ | fishaudio_. The Voice Library returns them already
//    prefixed — pass them straight through, never strip or rebuild them.
// 2. `/v1/task/{id}` is shared by TTS and Suno. The payload differs by `type`, so read
//    the result out of `metadata`, not the envelope.

import { HttpError } from './http';
import type { Ctx } from '../types';

export const AI33_BASE = 'https://api.ai33.pro';

/** Valid `voice_id` prefixes. A bare id is rejected by AI33. */
export const VOICE_PREFIXES = [
  'elevenlabs_', 'minimax_', 'clone_', 'edge_', 'kokoro_', 'vbee_', 'fishaudio_',
] as const;

export const hasVoicePrefix = (voiceId: string) =>
  VOICE_PREFIXES.some((p) => voiceId.startsWith(p));

/**
 * Add the provider prefix a bare voice id needs, using the same rules the existing
 * `generateVoiceover` already applies (see its Path C block) — so new code and ported
 * code normalize identically:
 *
 *   voice_category 'elevenlabs' | 'elevenlabs_library'  -> elevenlabs_
 *   voice_category 'cloned'     | 'minimax_cloned'      -> clone_
 *   anything else                                       -> minimax_
 *
 * Already-prefixed ids pass through untouched. The Voice Library returns prefixed ids,
 * so anything coming from `listVoices` needs no normalization.
 */
export function normalizeVoiceId(voiceId: string, voiceCategory?: string): string {
  if (hasVoicePrefix(voiceId)) return voiceId;
  if (voiceCategory === 'elevenlabs' || voiceCategory === 'elevenlabs_library') {
    return `elevenlabs_${voiceId}`;
  }
  if (voiceCategory === 'cloned' || voiceCategory === 'minimax_cloned') {
    return `clone_${voiceId}`;
  }
  return `minimax_${voiceId}`;
}

/**
 * Raw passthrough, mirroring geminiFetch/kieFetch — returns the untouched Response so a
 * ported function's own `res.ok` / `await res.json()` / retry logic survives.
 *
 * Content-Type is deliberately NOT defaulted: the v3 TTS, clone and dialogue endpoints
 * take multipart FormData and the runtime must set its own boundary.
 */
export async function ai33Fetch(ctx: Ctx, path: string, init: RequestInit = {}) {
  const key = await ctx.keys.require('AI33_API_KEY');
  const headers = new Headers(init.headers as HeadersInit);
  headers.set('xi-api-key', key);
  const url = path.startsWith('http')
    ? path
    : `${AI33_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, { ...init, headers });
}

// ── Common task poll ──────────────────────────────────────────────────────────

export interface Ai33Task {
  status: 'processing' | 'done' | 'error';
  /** Primary output. TTS audio, or the first Suno clip. */
  audioUrl: string | null;
  /** Suno returns several variations; empty for TTS. */
  allAudioUrls: string[];
  /** Preview stream available before the final file. */
  streamUrl: string | null;
  progress: number;
  error: string | null;
  creditCost: number | null;
  raw: any;
}

/**
 * `GET /v1/task/{id}` — works for every async AI33 task (TTS and Suno alike).
 *
 * A non-200 is treated as "keep polling" rather than a failure: the original functions
 * did the same, and a transient blip must not fail a job that is still running.
 */
export async function getTask(ctx: Ctx, taskId: string): Promise<Ai33Task> {
  const res = await ai33Fetch(ctx, `/v1/task/${encodeURIComponent(taskId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    return {
      status: 'processing', audioUrl: null, allAudioUrls: [], streamUrl: null,
      progress: 0, error: null, creditCost: null, raw: { http: res.status },
    };
  }

  const data = await res.json<any>().catch(() => ({}));
  const md = data?.metadata || {};

  const allAudioUrls: string[] =
    md.all_audio_urls
    || (md.suno_result?.clips || []).map((c: any) => c?.audio_url).filter(Boolean)
    || [];

  const audioUrl =
    md.audio_url
    || allAudioUrls[0]
    || data?.audio_url
    || md.suno_result?.clips?.[0]?.audio_url
    || null;

  const streamUrl =
    md.stream_url || md.suno_stream_result?.clips?.[0]?.stream_url || null;

  const rawStatus = String(data?.status || '').toLowerCase();
  const status: Ai33Task['status'] =
    rawStatus === 'done' ? 'done'
    : (rawStatus === 'error' || rawStatus === 'failed' || data?.error_message) ? 'error'
    : 'processing';

  return {
    status,
    audioUrl,
    allAudioUrls,
    streamUrl,
    progress: Number(data?.progress ?? 0),
    error: data?.error_message || null,
    creditCost: data?.credit_cost ?? null,
    raw: data,
  };
}

// ── Text to speech ────────────────────────────────────────────────────────────

export async function submitTts(
  ctx: Ctx,
  opts: {
    text: string;
    voiceId: string;
    /** Drives prefixing for a bare id — see normalizeVoiceId. */
    voiceCategory?: string;
    speed?: number;              // 0.5 – 1.5, default 1
    withTranscript?: boolean;
    fileName?: string;
    receiveUrl?: string;
    pronunciationDictionaryId?: number;
  },
): Promise<string> {
  const voiceId = normalizeVoiceId(opts.voiceId, opts.voiceCategory);

  if (opts.speed != null && (opts.speed < 0.5 || opts.speed > 1.5)) {
    throw new HttpError(400, `speed must be between 0.5 and 1.5 (got ${opts.speed})`);
  }

  const form = new FormData();
  form.append('text', opts.text);
  form.append('voice_id', voiceId);
  if (opts.speed != null) form.append('speed', String(opts.speed));
  form.append('with_transcript', String(opts.withTranscript ?? false));
  if (opts.fileName) form.append('file_name', opts.fileName);
  if (opts.receiveUrl) form.append('receive_url', opts.receiveUrl);
  if (opts.pronunciationDictionaryId != null) {
    form.append('pronunciation_dictionary_id', String(opts.pronunciationDictionaryId));
  }

  const res = await ai33Fetch(ctx, '/v3/text-to-speech', { method: 'POST', body: form });
  const data = await res.json<any>().catch(() => null);

  if (!res.ok || !data?.success || !data?.task_id) {
    throw new HttpError(502, `AI33 TTS submit failed: ${data?.message || data?.error || res.status}`);
  }
  return data.task_id;
}

/** Multi-speaker dialogue. `text` uses `A>` / `B>` / `C>` labels mapped by index. */
export async function submitDialogue(
  ctx: Ctx,
  opts: {
    text: string;
    speakers: Array<{ voice_id: string; speed?: number }>;
    delay?: number;              // 0 – 5 seconds
    withTranscript?: boolean;
    receiveUrl?: string;
  },
): Promise<string> {
  if (opts.speakers.length < 2) throw new HttpError(400, 'dialogue needs at least 2 speakers');

  const form = new FormData();
  form.append('text', opts.text);
  form.append('speakers', JSON.stringify(opts.speakers));
  if (opts.delay != null) form.append('delay', String(opts.delay));
  // Top-level only — AI33 rejects it inside `speakers`.
  form.append('with_transcript', String(opts.withTranscript ?? false));
  if (opts.receiveUrl) form.append('receive_url', opts.receiveUrl);

  const res = await ai33Fetch(ctx, '/v3/text-to-speech/dialogue', { method: 'POST', body: form });
  const data = await res.json<any>().catch(() => null);
  if (!res.ok || !data?.success || !data?.task_id) {
    throw new HttpError(502, `AI33 dialogue submit failed: ${data?.message || res.status}`);
  }
  return data.task_id;
}

// ── Voice library & cloning ───────────────────────────────────────────────────

export type VoiceProvider =
  | 'elevenlabs' | 'minimax' | 'clone' | 'edge' | 'kokoro' | 'vbee' | 'fishaudio';

/** `provider` is REQUIRED. Returned `voice_id`s are already prefixed — pass through. */
export async function listVoices(
  ctx: Ctx,
  provider: VoiceProvider,
  opts: { search?: string; language?: string; gender?: string; page?: number; pageSize?: number } = {},
) {
  const q = new URLSearchParams({ provider });
  if (opts.search) q.set('search', opts.search);
  if (opts.language) q.set('language', opts.language);
  if (opts.gender) q.set('gender', opts.gender);
  q.set('page', String(opts.page ?? 1));
  q.set('page_size', String(Math.min(opts.pageSize ?? 100, 100))); // max 100

  const res = await ai33Fetch(ctx, `/v3/voices?${q}`, { method: 'GET' });
  if (!res.ok) throw new HttpError(502, `AI33 voice list failed: ${res.status}`);
  return res.json<any>();
}

/** Returns the bare voice id. Use it as `clone_<voice_id>` in TTS. Sample max 10MB. */
export async function cloneVoice(
  ctx: Ctx,
  opts: { voiceName: string; audio: Blob | File; fileName?: string },
): Promise<string> {
  const form = new FormData();
  form.append('voice_name', opts.voiceName);
  form.append('audio_file', opts.audio, opts.fileName || 'sample.mp3');

  const res = await ai33Fetch(ctx, '/v3/text-to-speech/voice-clone', { method: 'POST', body: form });
  const data = await res.json<any>().catch(() => null);
  if (!res.ok || !data?.success || !data?.data?.voice_id) {
    throw new HttpError(502, `AI33 voice clone failed: ${data?.message || res.status}`);
  }
  return data.data.voice_id;
}

export async function deleteClonedVoice(ctx: Ctx, cloneId: string) {
  const res = await ai33Fetch(ctx, `/v3/text-to-speech/voice-clone/${encodeURIComponent(cloneId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new HttpError(502, `AI33 voice delete failed: ${res.status}`);
  return { success: true };
}

// ── Suno: music AND sound effects ─────────────────────────────────────────────
//
// One endpoint covers both. Background music is `simple` mode with a description;
// a sound effect is the same call with `make_instrumental: true` and a short
// effect-shaped prompt. There is no separate sound-generation endpoint.
//
// Suno is ASYNC and returns SEVERAL clips (usually two variations). Poll with getTask;
// `audioUrl` is the first clip and `allAudioUrls` holds the rest. A `stream_url` may
// appear before the final files — useful for preview, not for storage.

export const AI33_MUSIC_PATH = '/v1s/task/music-generation';

export type SunoSimple = {
  create_mode?: 'simple';
  gpt_description_prompt: string;   // required, 1–500 chars
  make_instrumental?: boolean;
  receive_url?: string;
};

export type SunoCustom = {
  create_mode: 'custom';
  title?: string;                   // max 80
  lyrics?: string;                  // max 5000 — lyrics OR tags required
  tags?: string;                    // max 1000
  vocal_gender?: 'f' | 'm';
  receive_url?: string;
};

export async function submitSuno(ctx: Ctx, body: SunoSimple | SunoCustom): Promise<string> {
  // Validate here rather than letting AI33 reject it — the limits are documented and a
  // clear local error beats a 400 from upstream mid-pipeline.
  if (!('create_mode' in body) || body.create_mode === 'simple') {
    const p = (body as SunoSimple).gpt_description_prompt;
    if (!p) throw new HttpError(400, 'gpt_description_prompt is required in simple mode');
    if (p.length > 500) {
      throw new HttpError(400, `gpt_description_prompt is ${p.length} chars; the limit is 500`);
    }
  } else {
    const c = body as SunoCustom;
    if (!c.lyrics && !c.tags) throw new HttpError(400, 'custom mode requires lyrics or tags');
    if (c.title && c.title.length > 80) throw new HttpError(400, 'title max is 80 chars');
    if (c.lyrics && c.lyrics.length > 5000) throw new HttpError(400, 'lyrics max is 5000 chars');
    if (c.tags && c.tags.length > 1000) throw new HttpError(400, 'tags max is 1000 chars');
  }

  const res = await ai33Fetch(ctx, AI33_MUSIC_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ create_mode: 'simple', ...body }),
  });
  const data = await res.json<any>().catch(() => null);

  if (!res.ok || !data?.success || !data?.task_id) {
    throw new HttpError(502, `AI33 Suno submit failed: ${data?.message || data?.error || res.status}`);
  }
  return data.task_id;
}

/** Background music — a description of the score. */
export const submitMusic = (
  ctx: Ctx,
  prompt: string,
  opts: { instrumental?: boolean; receiveUrl?: string } = {},
) =>
  submitSuno(ctx, {
    create_mode: 'simple',
    gpt_description_prompt: prompt.slice(0, 500),
    // Score under narration should not have vocals competing with the voiceover.
    make_instrumental: opts.instrumental ?? true,
    receive_url: opts.receiveUrl,
  });

/** Sound effect — the same Suno call, always instrumental. */
export const submitSoundEffect = (ctx: Ctx, description: string) =>
  submitSuno(ctx, {
    create_mode: 'simple',
    gpt_description_prompt: description.slice(0, 500),
    make_instrumental: true,
  });

// ── Pronunciation dictionaries ────────────────────────────────────────────────
//
// Rules rewrite text before synthesis (brand names, acronyms). Attach the returned id
// as `pronunciation_dictionary_id` on a TTS or dialogue call — only the audio changes.

export interface PronunciationRule {
  from: string;
  to: string;
  matchType?: 'word' | 'contains';
  caseSensitive?: boolean;
}

export async function createDictionary(ctx: Ctx, name: string, rules: PronunciationRule[]) {
  const res = await ai33Fetch(ctx, '/v3/dictionaries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, rules }),
  });
  const data = await res.json<any>().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new HttpError(502, `AI33 dictionary create failed: ${data?.message || res.status}`);
  }
  return data.dictionary;
}

export async function listDictionaries(ctx: Ctx) {
  const res = await ai33Fetch(ctx, '/v3/dictionaries', { method: 'GET' });
  if (!res.ok) throw new HttpError(502, `AI33 dictionary list failed: ${res.status}`);
  return res.json<any>();
}
