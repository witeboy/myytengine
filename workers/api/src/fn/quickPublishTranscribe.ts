// Ported from base44/functions/quickPublishTranscribe/entry.ts — HAND-WRITTEN.
//
// This one function bolted four unrelated concerns together. The port keeps every
// action name and response shape the browser already depends on, but the machinery
// behind three of them changes because Bunny and AssemblyAI-only are gone.
//
// Callers: src/lib/directApi.js (Clip Extractor transcription), src/lib/renderShortCloud.js
//
//   submit / poll            transcription  -> lib/asr.ts (AssemblyAI or Workers AI)
//   clip_video               ffmpeg container — see codex/FFMPEG.md
//   bunny_save_project       REMOVED 2026-09-11 with the Open Shorts feature (owner decision)
//   bunny_list_projects      REMOVED — same
//   bunny_delete_project     REMOVED — same
//   bunny_config             REMOVED — it used to hand a storage credential to the browser
//   extract_best_moments     DROPPED — dead code, no caller
//
// ── clip_video ──────────────────────────────────────────────────────────────────
// The original ran `new Deno.Command('ffmpeg', …)` — a subprocess writing to /tmp,
// which a Worker cannot do. It now runs in a Cloudflare Container holding a real ffmpeg
// binary, called through lib/ffmpeg.ts. The ffmpeg flags are unchanged, so output looks
// the same. See codex/FFMPEG.md for the container contract.
//
// The in-browser path (`src/lib/clipWithFFmpeg.js`, used by 8 modules) is untouched and
// remains the interactive default — the container serves the cloud path only.

import { HttpError } from '../lib/http';
import { poll as asrPoll, submit as asrSubmit } from '../lib/asr';
import { runClip } from '../lib/ffmpeg';
import type { Ctx, FnHandler } from '../types';

const handler: FnHandler = async (body, ctx) => {
  const action = body?.action;

  // ── TRANSCRIPTION ───────────────────────────────────────────────────────────
  if (action === 'submit') {
    const { file_url } = body;
    if (!file_url) throw new HttpError(400, 'file_url required');
    // Chapters were AssemblyAI's auto_chapters; lib/asr derives them with an LLM when
    // running on Whisper, so ChaptersPanel keeps working either way.
    const { transcript_id } = await asrSubmit(ctx, file_url, { chapters: true });
    return { success: true, transcript_id };
  }

  if (action === 'poll') {
    const { transcript_id } = body;
    if (!transcript_id) throw new HttpError(400, 'transcript_id required');

    const result = await asrPoll(ctx, transcript_id);

    if (result.status === 'error') {
      return { status: 'error', error: result.error || 'Transcription failed' };
    }
    if (result.status !== 'completed') {
      return { status: result.status };
    }

    // Field names the browser reads — src/lib/directApi.js:transcribeFile.
    return {
      status: 'completed',
      text: result.text || '',
      words: result.words || [],
      chapters: result.chapters || [],
      duration: result.duration || 0,
    };
  }

  // ── OPENSHORTS PROJECT MANIFEST ─────────────────────────────────────────────
  //
  // ── CLIP ────────────────────────────────────────────────────────────────────
  // The original ran an ffmpeg subprocess, which a Worker cannot. It now runs in the
  // ffmpeg container (codex/FFMPEG.md). Response shape unchanged — `directApi.
  // clipVideoCloud` reads `clip_url`, so renderShortCloud.js needs no edit.
  //
  // If the container is not deployed, runClip throws a 501 naming the in-browser path.
  if (action === 'clip_video') {
    const { source_url, start, end } = body;
    if (!source_url || start == null || end == null) {
      throw new HttpError(400, 'source_url, start, end required');
    }
    const { clip_url, duration } = await runClip(ctx, { source_url, start, end });
    return { success: true, clip_url, duration };
  }

  throw new HttpError(400, `Unknown action: ${action}`);
};

export default handler;
