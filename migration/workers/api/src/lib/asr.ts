// Transcription — one interface, two backends, chosen per user.
//
// The frontend keeps its existing submit/poll loop (`src/lib/transcribeASR.js`,
// `src/lib/directApi.js`), so this module MUST preserve that shape:
//     submit(url)  -> { transcript_id }
//     poll(id)     -> { status: 'queued'|'processing'|'completed'|'error', ... }
//
// Backend selection (Settings -> Transcription engine):
//   'assemblyai'  force AssemblyAI          (requires ASSEMBLYAI_API_KEY)
//   'workers-ai'  force Whisper             (free, no key)
//   'auto'        AssemblyAI if a key exists, else Whisper   <- default
//
// NOTE: AI33.pro is deliberately NOT an option here. It handles TTS, voice cloning and
// sound effects; speech-to-text stays on AssemblyAI/Whisper.
//
// WARNING Word-level timestamps are the hard requirement. `src/lib/asrAutoSync.js`
//   (443 lines), caption auto-sync and silence trimming all consume
//   `words: [{ word, start, end }]`. Segment-only output degrades all three. Confirm
//   `@cf/openai/whisper-large-v3-turbo` returns word-level timings before relying on
//   the free path; if it does not, the user adds an AssemblyAI key and the original
//   path resumes with no code change.

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
const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';
/** Workers AI takes the audio inline, so very large files must use AssemblyAI. */
const WHISPER_MAX_BYTES = 24 * 1024 * 1024;

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

  // Whisper is synchronous. Run it now, park the result, and let the caller's existing
  // poll loop pick it up — the frontend never learns the difference.
  const id = `cfw:${newId()}`;
  await ctx.env.COLD.put(
    `asr/${id}.json`,
    JSON.stringify({ status: 'processing' } satisfies AsrResult),
    { httpMetadata: { contentType: 'application/json' } },
  );

  ctx.waitUntil(
    runWhisper(ctx, audioUrl, opts.chapters === true)
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

// ── Whisper backend ───────────────────────────────────────────────────────────

async function runWhisper(ctx: Ctx, audioUrl: string, wantChapters: boolean): Promise<AsrResult> {
  const res = await fetch(audioUrl, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Could not fetch audio (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();

  if (buf.byteLength > WHISPER_MAX_BYTES) {
    throw new Error(
      `Audio is ${Math.round(buf.byteLength / 1e6)}MB — too large for the free Whisper engine. ` +
        'Add an AssemblyAI key in Settings, or trim the source first.',
    );
  }

  const out: any = await ctx.env.AI.run(WHISPER_MODEL as any, {
    audio: [...new Uint8Array(buf)],
  });

  // Prefer real word timings; fall back to segment timings so callers always get
  // *something* shaped like `words`, and the degradation is visible rather than silent.
  const words: Word[] = [];
  for (const seg of out?.segments || []) {
    if (Array.isArray(seg.words) && seg.words.length) {
      for (const w of seg.words) {
        words.push({ word: w.word ?? w.text ?? '', start: w.start, end: w.end });
      }
    } else if (seg.text) {
      words.push({ word: seg.text.trim(), start: seg.start, end: seg.end });
    }
  }

  const text: string = out?.text || '';
  const duration =
    out?.segments?.length ? out.segments[out.segments.length - 1].end : words.at(-1)?.end || 0;

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
