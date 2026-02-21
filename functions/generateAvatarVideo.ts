import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// KLING AI AVATAR VIDEO — Lip-synced Talking Head via Kie Market
// ══════════════════════════════════════════════════════════════════
//
// Takes an influencer image + voiceover audio URL + motion prompt
// and submits to Kling AI Avatar v1 Pro via Kie Market API.
// Returns a task ID for polling.
//
// Model: kling/ai-avatar-v1-pro
// Input: image_url, audio_url, prompt (motion description)
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = 'https://api.kie.ai/api/v1/jobs';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, audio_url, prompt = '', scene_id } = await req.json();

    if (!image_url) return Response.json({ error: 'Missing image_url' }, { status: 400 });
    if (!audio_url) return Response.json({ error: 'Missing audio_url' }, { status: 400 });

    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    // Ensure image is a public URL (not data URI)
    if (image_url.startsWith('data:')) {
      return Response.json({ error: 'Image must be a public URL, not a data URI' }, { status: 400 });
    }

    console.log(`🎬 Kling Avatar: image=${image_url.substring(0, 60)}...`);
    console.log(`🎬 Audio: ${audio_url.substring(0, 60)}...`);
    console.log(`🎬 Prompt: ${prompt.substring(0, 100)}`);

    // ── Submit to Kling AI Avatar via Kie Market ─────────────────
    const res = await fetch(`${KIE_BASE}/createTask`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'kling/ai-avatar-v1-pro',
        input: {
          image_url,
          audio_url,
          prompt, // motion/expression description
        },
      }),
    });

    const data = await res.json();
    console.log(`Kling Avatar submit: ${res.status} → code=${data.code} msg=${data.msg}`);

    if (data.code !== 200) {
      return Response.json({
        error: `Kling Avatar API error: ${data.msg || JSON.stringify(data)}`,
      }, { status: 500 });
    }

    const taskId = data.data?.taskId;
    if (!taskId) {
      return Response.json({ error: 'No taskId returned', raw: data }, { status: 500 });
    }

    console.log(`🎬 Kling Avatar task created: ${taskId}`);

    // ── If scene_id provided, store task reference ──────────────
    if (scene_id) {
      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        video_url: `kling_avatar:${taskId}`,
        status: 'pending',
      });
    }

    return Response.json({
      success: true,
      task_id: taskId,
      provider: 'kling_avatar_v1_pro',
      status: 'CREATED',
    });

  } catch (error) {
    console.error('generateAvatarVideo error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});