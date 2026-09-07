// Ported from base44/functions/generateSoundEffect.ts — HAND-WRITTEN.
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
// The caller (src/components/content/SceneSfxEditor.jsx:50) makes ONE call and reads
// `res.data.audio_url`. Suno is asynchronous, so this submits and then polls inline
// until the audio exists. That keeps the single-call contract intact. Polling is pure
// I/O wait, which costs a Worker essentially no CPU time.

import { HttpError, badRequest } from '../lib/http';
import { getTask, submitSoundEffect } from '../lib/ai33';
import { ingestUrl } from '../lib/r2';
import type { FnHandler } from '../types';

// Suno typically lands in 30–90s. Cap well under the 300s client timeout in
// apps/web/src/api/client.js so the browser sees our error, not a dead socket.
const MAX_WAIT_MS = 240_000;
const FIRST_DELAY_MS = 5_000;
const MAX_DELAY_MS = 10_000;

const handler: FnHandler = async (body, ctx) => {
  const { text, scene_id } = body || {};
  if (!text) throw badRequest('text is required');

  console.log('Generating sound effect via AI33 (Suno, instrumental):', text);

  const taskId = await submitSoundEffect(ctx, String(text));

  const startedAt = Date.now();
  let delay = FIRST_DELAY_MS;

  while (Date.now() - startedAt < MAX_WAIT_MS) {
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
      await ctx.db.Scenes.update(scene_id, { sound_effect_url: stored.url });
    }

    return {
      success: true,
      audio_url: stored.url,
      provider: 'ai33-suno',
      task_id: taskId,
      credit_cost: task.creditCost,
    };
  }

  // Do not fail silently — the task may still complete, so hand back the id.
  throw new HttpError(
    504,
    `Sound effect still generating after ${Math.round(MAX_WAIT_MS / 1000)}s. ` +
      `Task ${taskId} may finish shortly; try again.`,
  );
};

export default handler;
