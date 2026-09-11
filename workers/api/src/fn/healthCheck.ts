// Ported from base44/functions/healthCheck.ts
//
// Original pinged every function through base44.functions.invoke to wake stale
// Deno isolates. Workers have no cold-isolate problem of that kind, so the useful
// signal here is different: which BYOK keys are present and working, plus D1/R2
// reachability. HealthCheckButton renders whatever `report` contains, so the
// component needs no change.

import { PROVIDERS } from '../lib/providers';
import { unmappedModels } from '../lib/models';
import type { Ctx, FnHandler } from '../types';

const handler: FnHandler = async (_body, ctx: Ctx) => {
  const report: Array<{ name: string; status: string; ms: number; error?: string }> = [];

  const timed = async (name: string, fn: () => Promise<unknown>) => {
    const start = Date.now();
    try {
      await fn();
      report.push({ name, status: 'ok', ms: Date.now() - start });
    } catch (e: any) {
      report.push({ name, status: 'error', ms: Date.now() - start, error: e?.message || String(e) });
    }
  };

  // A model id the code pins but the aggregator does not serve is a silent 404 at
  // generation time. Surface it here instead.
  const unmapped = unmappedModels();
  report.push(
    unmapped.length
      ? {
          name: 'Model mapping',
          status: 'error',
          ms: 0,
          error: `Unmapped model id(s): ${unmapped.join(', ')} — add them to lib/models.ts`,
        }
      : { name: 'Model mapping', status: 'ok', ms: 0 },
  );

  // The ffmpeg container row was removed with Clip Extractor (owner decision, 2026-09-11);
  // all video work runs in the browser with ffmpeg.wasm.

  await timed('D1', () => ctx.env.DB.prepare('SELECT 1').first());
  await timed('R2 media', () => ctx.env.MEDIA.list({ limit: 1 }));
  await timed('R2 cold', () => ctx.env.COLD.list({ limit: 1 }));

  for (const def of PROVIDERS) {
    const key = await ctx.keys.get(def.id);
    if (!key) {
      report.push({
        name: def.label,
        status: def.tier === 'core' ? 'missing' : 'not configured',
        ms: 0,
        error: def.tier === 'core' ? 'Required key — add it in Settings' : undefined,
      });
      continue;
    }
    await timed(def.label, () => def.test(key));
  }

  const healthy = report.filter((r) => r.status === 'ok');
  const unhealthy = report.filter((r) => r.status === 'error' || r.status === 'missing');

  return { total: report.length, healthy: healthy.length, unhealthy: unhealthy.length, report };
};

export default handler;
