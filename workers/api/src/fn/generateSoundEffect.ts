// Ported from the original hosted generateSoundEffect function — HAND-WRITTEN.
//
// House rule: AI33.pro owns all audio out. Sound effects run through AI33's Suno
// endpoint (`/v1s/task/music-generation`) in simple mode with `make_instrumental: true`
// — there is no separate sound-generation endpoint.
//
// WHAT CHANGED, AND WHY IT IS NOT A LIKE-FOR-LIKE PORT
// ----------------------------------------------------
// The original did not generate sound effects. It built `[Sound effect: ${text}]` and
// sent it to MiniMax **text-to-speech** with `voice_id: 'English_expressive_narrator'`,
// producing a person reading those words aloud, then fell back to a music API. This is
// now real audio generation. Output will be completely different, and correct.
//
// WHAT DID NOT CHANGE
// -------------------
// This used to submit and then wait inline for up to 240s, on the reasoning that the
// browser's own timeout is 300s. That ignored the proxy in front of this Worker, which
// ends a request after about a minute: every sound effect failed in the browser while
// the Worker kept polling and the credits were spent. It now answers quickly — with the
// audio if Suno was fast, otherwise with a task id for pollSoundEffect to finish.

import { HttpError, badRequest } from '../lib/http';
import { getTask, submitSoundEffect } from '../lib/ai33';
import { ingestUrl } from '../lib/r2';
import type { FnHandler } from '../types';

// Suno typically lands in 30–90s, so most calls hand back a task id. The short wait is
// only to catch the occasional fast one without a second round trip.
const QUICK_WAIT_MS = 15_000;
const FIRST_DELAY_MS = 5_000;
const MAX_DELAY_MS = 8_000;

const handler: FnHandler = async (body, ctx) => {
  const { text, scene_id } = body || {};
  if (!text) throw badRequest('text is required');

  console.log('Generating sound effect via AI33 (Suno, instrumental):', text);

  const taskId = await submitSoundEffect(ctx, String(text));

  // Remember the job on the scene so a reload (or a lost response) can still finish it.
  if (scene_id) {
    try {
      await ctx.db.Scenes.update(scene_id, { sfx_task_id: taskId, sound_effect: String(text) });
    } catch (err: any) {
      console.warn(`Could not record the sound effect task: ${err?.message || err}`);
    }
  }

  const startedAt = Date.now();
  let delay = FIRST_DELAY_MS;

  while (Date.now() - startedAt < QUICK_WAIT_MS) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, MAX_DELAY_MS);

    const task = await getTask(ctx, taskId);

    if (task.status === 'error') {
      throw new HttpError(502, `Sound effect generation failed: ${task.error || 'unknown error'}`);
    }
    if (task.status !== 'done' || !task.audioUrl) continue;

    // Suno serves from cdn1.suno.ai, which expires. Re-host so the URL written to the
    // scene stays valid. Key prefix preserved from the original (`sfx/`).
    // 'durable': this URL is written to Scenes.sound_effect_url below, and the 48h
    // sweep must never remove something an entity still points at.
    const stored = await ingestUrl(ctx, task.audioUrl, { tier: 'durable', prefix: 'sfx' });

    if (scene_id) {
      await ctx.db.Scenes.update(scene_id, { sound_effect_url: stored.url, sfx_task_id: '' });
    }

    return {
      success: true,
      status: 'ready',
      audio_url: stored.url,
      provider: 'ai33-suno',
      task_id: taskId,
      credit_cost: task.creditCost,
    };
  }

  // Still rendering. The caller polls pollSoundEffect with this id.
  return {
    success: true,
    status: 'generating',
    task_id: taskId,
    provider: 'ai33-suno',
  };
};

export default handler;
