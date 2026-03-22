import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// HEALTH CHECK — Ping all backend functions to wake stale isolates
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 }); 

  const functions = [
    'generateVoiceover',
    'generateSceneImage',
    'generateSceneVideo',
    'pollSceneImage',
    'pollSceneVideo',
    'pollVoiceover',
    'listVoices',
    'submitTranscription',
    'pollTranscription',
    'generateAvatarVideo',
    'pollAvatarVideo',
    'generateMusic',
    'checkMusicStatus',
    'searchBrollVideos',
    'generateFullScript',
    'generateSceneBreakdown',
    'generateScenePrompts',
    'enhancePrompt',
    'uploadToR2',
  ];

  // All functions use nested entry/entry paths
  const resolveName = (name) => `${name}/entry/entry`;

  const results = await Promise.allSettled(
    functions.map(async (name) => {
      const start = Date.now();
      try {
        const res = await base44.functions.invoke(resolveName(name), { _healthCheck: true });
        return { name, status: 'ok', ms: Date.now() - start };
      } catch (e) {
        const status = e?.response?.status || 'error';
        return { name, status, ms: Date.now() - start, error: e?.response?.data?.error || e.message };
      }
    })
  );

  const report = results.map(r => r.status === 'fulfilled' ? r.value : { name: '?', status: 'rejected', error: r.reason?.message });

  const healthy = report.filter(r => r.status === 'ok' || (typeof r.status === 'number' && r.status < 500));
  const unhealthy = report.filter(r => r.status === 500 || r.status === 'error' || r.status === 'rejected');

  return Response.json({
    total: functions.length,
    healthy: healthy.length,
    unhealthy: unhealthy.length,
    report,
  });
});