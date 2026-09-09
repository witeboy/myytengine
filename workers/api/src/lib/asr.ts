// Transcription — one interface, two backends, chosen per user.
//
// The frontend keeps its existing submit/poll loop (`src/lib/transcribeASR.js`,
// `src/lib/directApi.js`), so this module MUST preserve that shape:
//     submit(url)  -> { transcript_id }
//     poll(id)     -> { status: 'queued'|'processing'|'completed'|'error', ... }
//
// Backend selection (Settings -> Transcription engine):
//   'assemblyai'  force AssemblyAI          (requires ASSEMBLYAI_API_KEY)
//   'workers-ai'  force Workers AI          (no user key)
//   'auto'        AssemblyAI if a key exists, else Workers AI   <- default
//
// NOTE: AI33.pro is deliberately NOT an option here. It handles TTS, voice cloning and
// sound effects; speech-to-text stays on AssemblyAI/Workers AI.
//
// WARNING Word-level timestamps are the hard requirement. `src/lib/asrAutoSync.js`
//   (443 lines), caption auto-sync and silence trimming all consume
//   `words: [{ word, start, end }]`. Segment-only output degrades all three. Confirm
//   Phase 5's live spike found that Whisper's binding input rejects the documented
//   structured binary forms. `@cf/deepgram/nova-3` accepted the same stream and returned
//   genuine word/start/end objects, so it is the Workers AI backend behind this interface.

import { HttpError, fetchJson, newId } from './http';
import type { Ctx } from '../types';

export interface Word { word: string; start: number; end: number; confidence?: number }
export interface AsrResult {
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  words?: Word[];
  chapters?: Array<{ start: number; end: number; headline: string; summary: string }>;
  duration?: number;
  error?: string;
}

const AAI = 'https://api.assemblyai.com/v2';
const WORKERS_AI_MODEL = '@cf/deepgram/nova-3';
/** Workers AI takes the audio inline, so known-large files must use AssemblyAI. */
const WORKERS_AI_MAX_BYTES = 24 * 1024 * 1024;

async function chooseBackend(ctx: Ctx): Promise<'assemblyai' | 'workers-ai'> {
  const pref = (await ctx.keys.settings()).asr_provider || 'auto';
  if (pref === 'assemblyai') {
    if (!(await ctx.keys.has('ASSEMBLYAI_API_KEY'))) {
      throw new HttpError(
        400,
        'Transcription is set to AssemblyAI but no key is configured. ' +
          'Add it in Settings -> API Keys, or switch the engine to Whisper.',
      );
    }
    return 'assemblyai';
  }
  if (pref === 'workers-ai') return 'workers-ai';
  return (await ctx.keys.has('ASSEMBLYAI_API_KEY')) ? 'assemblyai' : 'workers-ai';
}

// ── submit ────────────────────────────────────────────────────────────────────

export async function submit(ctx: Ctx, audioUrl: string, opts: { chapters?: boolean } = {}) {
  if (!audioUrl) throw new HttpError(400, 'audio url is required');
  const backend = await chooseBackend(ctx);

  if (backend === 'assemblyai') {
    const key = await ctx.keys.require('ASSEMBLYAI_API_KEY');
    const res = await fetchJson(`${AAI}/transcript`, {
      method: 'POST',
      headers: { authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_url: audioUrl,
        word_boost: [],
        auto_chapters: !!opts.chapters,
      }),
      timeoutMs: 30_000,
    });
    if (!res?.id) throw new HttpError(502, 'AssemblyAI returned no transcript id');
    return { transcript_id: `aai:${res.id}` };
  }

  // Workers AI is synchronous. Run it now, park the result, and let the caller's existing
  // poll loop pick it up — the frontend never learns the difference.
  const id = `cfw:${newId()}`;
  await ctx.env.COLD.put(
    `asr/${id}.json`,
    JSON.stringify({ status: 'processing' } satisfies AsrResult),
    { httpMetadata: { contentType: 'application/json' } },
  );

  ctx.waitUntil(
    runWorkersAi(ctx, audioUrl, opts.chapters === true)
      .then((r) => ctx.env.COLD.put(`asr/${id}.json`, JSON.stringify(r)))
      .catch((e) =>
        ctx.env.COLD.put(
          `asr/${id}.json`,
          JSON.stringify({ status: 'error', error: e?.message || String(e) } satisfies AsrResult),
        ),
      ),
  );

  return { transcript_id: id };
}

// ── poll ──────────────────────────────────────────────────────────────────────

export async function poll(ctx: Ctx, transcriptId: string): Promise<AsrResult> {
  if (!transcriptId) throw new HttpError(400, 'transcript_id is required');

  if (transcriptId.startsWith('aai:')) {
    const key = await ctx.keys.require('ASSEMBLYAI_API_KEY');
    const r = await fetchJson(`${AAI}/transcript/${transcriptId.slice(4)}`, {
      method: 'GET',
      headers: { authorization: key },
      timeoutMs: 30_000,
    });
    if (r.status === 'error') return { status: 'error', error: r.error };
    if (r.status !== 'completed') {
      return { status: r.status === 'queued' ? 'queued' : 'processing' };
    }
    return {
      status: 'completed',
      text: r.text || '',
      words: (r.words || []).map((w: any) => ({
        word: w.text,
        start: w.start / 1000,
        end: w.end / 1000,
        confidence: w.confidence,
      })),
      chapters: (r.chapters || []).map((c: any) => ({
        start: c.start / 1000,
        end: c.end / 1000,
        headline: c.headline,
        summary: c.summary,
      })),
      duration: (r.audio_duration as number) || 0,
    };
  }

  const obj = await ctx.env.COLD.get(`asr/${transcriptId}.json`);
  if (!obj) return { status: 'error', error: 'Unknown transcript id' };
  return JSON.parse(await obj.text()) as AsrResult;
}

// ── Workers AI backend ────────────────────────────────────────────────────────

async function runWorkersAi(ctx: Ctx, audioUrl: string, wantChapters: boolean): Promise<AsrResult> {
  const res = await fetch(audioUrl, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Could not fetch audio (HTTP ${res.status})`);
  if (!res.body) throw new Error('Could not read audio response body');

  const contentLength = Number(res.headers.get('content-length') || 0);
  if (contentLength > WORKERS_AI_MAX_BYTES) {
    throw new Error(
      `Audio is ${Math.round(contentLength / 1e6)}MB — too large for the Workers AI engine. ` +
        'Add an AssemblyAI key in Settings, or trim the source first.',
    );
  }

  const out: any = await ctx.env.AI.run(WORKERS_AI_MODEL as any, {
    audio: {
      body: res.body,
      contentType: res.headers.get('content-type') || 'application/octet-stream',
    },
    smart_format: true,
  });

  const alternative = out?.results?.channels?.[0]?.alternatives?.[0] || {};
  const words: Word[] = (alternative.words || []).map((w: any) => ({
    word: w.word ?? w.punctuated_word ?? '',
    start: w.start,
    end: w.end,
    confidence: w.confidence,
  }));
  const text: string = alternative.transcript || '';
  const duration = words.at(-1)?.end || 0;

  const result: AsrResult = { status: 'completed', text, words, duration };

  if (wantChapters && text) {
    // AssemblyAI's auto_chapters has no Whisper equivalent, so derive them with an LLM.
    const { invokeLLM } = await import('./ai');
    try {
      const parsed = await invokeLLM(ctx, {
        prompt:
          'Split this transcript into chapters. Return JSON: ' +
          '{"chapters":[{"start":<seconds>,"end":<seconds>,"headline":"<short title>","summary":"<one sentence>"}]}\n\n' +
          `Total duration: ${Math.round(duration)}s\n\nTRANSCRIPT:\n${text.slice(0, 12000)}`,
        response_json_schema: { type: 'object' },
        max_tokens: 2000,
      });
      result.chapters = parsed?.chapters || [];
    } catch {
      result.chapters = []; // chapters are a nice-to-have; never fail the transcript over them
    }
  }

  return result;
}
