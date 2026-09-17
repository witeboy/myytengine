// Finishes a sound effect that generateSoundEffect submitted.
//
// Sound effects used to be generated inside a single request that waited up to 240s for
// Suno. The proxy in front of this Worker ends a request long before that, so the call
// always failed in the browser even though the audio was rendering fine. Submitting and
// polling separately keeps every request short.

import { badRequest } from '../lib/http';
import { getTask } from '../lib/ai33';
import { ingestUrl } from '../lib/r2';
import type { FnHandler } from '../types';

const handler: FnHandler = async (body, ctx) => {
  const { task_id, scene_id } = body || {};
  if (!task_id) throw badRequest('task_id is required');

  const task = await getTask(ctx, String(task_id));

  if (task.status === 'error') {
    if (scene_id) {
      try { await ctx.db.Scenes.update(scene_id, { sfx_task_id: '' }); } catch (_) {}
    }
    return { success: true, status: 'failed', error: task.error || 'Sound effect generation failed' };
  }

  if (task.status !== 'done' || !task.audioUrl) {
    return { success: true, status: 'generating', progress: task.progress ?? 0 };
  }

  // Suno serves from a CDN whose URLs expire, so re-host before writing it to the scene.
  // 'durable': the scene points at this file, and the 48h sweep must not remove it.
  const stored = await ingestUrl(ctx, task.audioUrl, { tier: 'durable', prefix: 'sfx' });

  if (scene_id) {
    await ctx.db.Scenes.update(scene_id, { sound_effect_url: stored.url, sfx_task_id: '' });
  }

  return {
    success: true,
    status: 'ready',
    audio_url: stored.url,
    provider: 'ai33-suno',
    credit_cost: task.creditCost,
  };
};

export default handler;
