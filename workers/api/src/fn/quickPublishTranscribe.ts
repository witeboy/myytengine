// Ported from base44/functions/quickPublishTranscribe/entry.ts — HAND-WRITTEN.
//
// This one function bolted four unrelated concerns together. The port keeps every
// action name and response shape the browser already depends on, but the machinery
// behind three of them changes because Bunny and AssemblyAI-only are gone.
//
// Callers: src/lib/directApi.js, src/pages/OpenShorts.jsx, src/lib/renderShortCloud.js
//
//   submit / poll            transcription  -> lib/asr.ts (AssemblyAI or Whisper)
//   bunny_save_project       OpenShorts persistence -> the same JSON manifest, in R2
//   bunny_list_projects
//   bunny_delete_project
//   bunny_config             REMOVED — see below
//   clip_video               ffmpeg container — see codex/FFMPEG.md
//   extract_best_moments     DROPPED — dead code, no caller
//
// ── bunny_config ────────────────────────────────────────────────────────────────
// The original returned BUNNY_STORAGE_PASSWORD to the browser so it could PUT
// straight to Bunny. That handed a write credential to every client. There is no
// equivalent and there should not be: uploads now go through POST /api/upload (small
// files) or the uploadToR2 multipart flow (large), where the credential never leaves
// the Worker. `directApi.uploadToCloudinary` has been rewritten accordingly; this
// action returns 410 so any straggler caller fails loudly rather than silently
// uploading nowhere.
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

/** Same logical location as the Bunny manifest, now an R2 object. */
const MANIFEST_KEY = 'projects/openshorts_manifest.json';

async function loadManifest(ctx: Ctx): Promise<any[]> {
  try {
    const obj = await ctx.env.MEDIA.get(MANIFEST_KEY);
    if (!obj) return [];
    const parsed = JSON.parse(await obj.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // The original swallowed manifest read errors and returned []. Keep that: a
    // corrupt manifest must not make the OpenShorts page unusable.
    return [];
  }
}

async function saveManifest(ctx: Ctx, projects: any[]): Promise<void> {
  await ctx.env.MEDIA.put(MANIFEST_KEY, JSON.stringify(projects), {
    httpMetadata: { contentType: 'application/json' },
  });
}

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
  // Read-modify-write of one JSON blob, exactly as before. Note this inherits the
  // original's lost-update race: two concurrent saves and the later one wins. That
  // behaviour is preserved deliberately. If it ever matters, the fix is a real table,
  // not a lock — see PHASE-8.md §4.
  if (action === 'bunny_save_project') {
    const project = body.project;
    if (!project?.job_id) throw new HttpError(400, 'project.job_id required');

    const projects = await loadManifest(ctx);
    const idx = projects.findIndex((p: any) => p.job_id === project.job_id);
    if (idx >= 0) projects[idx] = project;
    else projects.unshift(project); // newest first

    await saveManifest(ctx, projects);
    return { success: true, project_count: projects.length };
  }

  if (action === 'bunny_list_projects') {
    return { success: true, projects: await loadManifest(ctx) };
  }

  if (action === 'bunny_delete_project') {
    const { job_id } = body;
    if (!job_id) throw new HttpError(400, 'job_id required');

    const projects = await loadManifest(ctx);
    const remaining = projects.filter((p: any) => p.job_id !== job_id);
    await saveManifest(ctx, remaining);
    return { success: true, project_count: remaining.length };
  }

  // ── RETIRED ─────────────────────────────────────────────────────────────────
  if (action === 'bunny_config') {
    throw new HttpError(
      410,
      'bunny_config is retired. Uploads go through POST /api/upload (or the uploadToR2 ' +
      'multipart flow for large files) — storage credentials never reach the browser.',
    );
  }

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
