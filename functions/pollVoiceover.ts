import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// VOICEOVER POLLER — Check AI33 task status, download + upload to R2
// Called repeatedly from frontend until status is 'ready' or 'failed'
// ══════════════════════════════════════════════════════════════════

async function hmacSha256(key, msg) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg)));
}

async function uploadToR2(audioBytes, projectId) {
  const accountId = (Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim();
  const bucket = (Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '').trim();
  const accessKeyId = (Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '').trim();
  const secretAccessKey = (Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '').trim();

  const fileName = `voiceovers/${projectId}-${Date.now()}.mp3`;
  const r2Url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${fileName}`;
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const shortDate = dateStamp.substring(0, 8);
  const region = 'auto';
  const service = 's3';
  const scope = `${shortDate}/${region}/${service}/aws4_request`;

  const payloadHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', audioBytes)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const headers = {
    'Host': `${accountId}.r2.cloudflarestorage.com`,
    'Content-Type': 'audio/mpeg',
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': dateStamp,
  };

  const signedHeaderKeys = Object.keys(headers).sort().map(k => k.toLowerCase()).join(';');
  const canonicalHeaders = Object.keys(headers).sort()
    .map(k => `${k.toLowerCase()}:${headers[k]}`).join('\n') + '\n';

  const canonicalRequest = [
    'PUT', `/${bucket}/${fileName}`, '', canonicalHeaders, signedHeaderKeys, payloadHash,
  ].join('\n');

  const canonicalRequestHash = Array.from(new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest))
  )).map(b => b.toString(16).padStart(2, '0')).join('');

  const stringToSign = ['AWS4-HMAC-SHA256', dateStamp, scope, canonicalRequestHash].join('\n');

  const kDate = await hmacSha256('AWS4' + secretAccessKey, shortDate);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = Array.from(await hmacSha256(kSigning, stringToSign))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaderKeys}, Signature=${signature}`;

  const uploadRes = await fetch(r2Url, {
    method: 'PUT',
    headers: { ...headers, 'Authorization': authHeader },
    body: audioBytes,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`R2 upload failed (${uploadRes.status}): ${errText.substring(0, 200)}`);
  }

  const publicUrl = (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');
  return `${publicUrl}/${fileName}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const AI33_KEY = Deno.env.get('AI33_API_KEY');

    // Get current settings
    const settingsList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const settings = settingsList[0];
    if (!settings) return Response.json({ status: 'no_settings' });

    // Already done?
    if (settings.voiceover_status === 'ready' && settings.voiceover_url) {
      return Response.json({ status: 'ready', voiceover_url: settings.voiceover_url });
    }

    const taskId = settings.generation_task_id;
    if (!taskId) {
      return Response.json({ status: 'no_task', message: 'No generation task found' });
    }

    // Poll AI33
    const pollRes = await fetch(`https://api.ai33.pro/v1/task/${taskId}`, {
      headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY },
    });

    if (!pollRes.ok) {
      return Response.json({ status: 'polling', message: `AI33 poll returned ${pollRes.status}` });
    }

    const pollData = await pollRes.json();
    console.log(`🎙 Poll task ${taskId}: status=${pollData.status}`);

    if (pollData.status === 'done') {
      const audioUrl = pollData.metadata?.audio_url;
      if (!audioUrl) {
        await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
        return Response.json({ status: 'failed', error: 'Task done but no audio_url' });
      }

      // Download audio
      console.log(`📥 Downloading audio from AI33...`);
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) throw new Error(`Audio download failed: ${audioRes.status}`);
      const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
      const durationSec = Math.round((audioBytes.length / 16000) * 10) / 10;

      // Upload to R2
      console.log(`📤 Uploading ${audioBytes.length} bytes to R2...`);
      const publicAudioUrl = await uploadToR2(audioBytes, project_id);

      // Save to DB
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        voiceover_status: 'ready',
        voiceover_url: publicAudioUrl,
        total_duration_seconds: durationSec,
      });

      await base44.asServiceRole.entities.Projects.update(project_id, { status: 'voiceover_ready' });

      console.log(`✅ Voiceover ready: ${publicAudioUrl} (${durationSec}s)`);
      return Response.json({ status: 'ready', voiceover_url: publicAudioUrl, duration: durationSec });
    }

    if (pollData.status === 'error' || pollData.status === 'failed') {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
      return Response.json({ status: 'failed', error: pollData.error_message || 'TTS generation failed' });
    }

    // Still processing
    return Response.json({ status: 'generating', message: 'TTS still processing...' });

  } catch (error) {
    console.error(`❌ pollVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});