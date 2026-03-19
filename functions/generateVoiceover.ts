import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// VOICEOVER GENERATOR — All TTS via AI33 proxy
// ElevenLabs voices → AI33 /v1/text-to-speech
// MiniMax voices (including cloned) → AI33 /v1m/task/text-to-speech
// Both are async (task-based) with polling.
// File upload via Cloudflare R2 (S3-compatible) to save credits.
// ══════════════════════════════════════════════════════════════════

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40; // ~120 seconds max polling

function splitTextIntoChunks(text, maxChars = 4000) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence + ' ';
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ── Submit + poll a single AI33 TTS task ───────────────────────────
async function generateChunkViaAi33(apiKey, text, voiceId, provider) {
  let submitUrl, submitBody;

  if (provider === 'minimax') {
    // MiniMax TTS via AI33
    submitUrl = 'https://api.ai33.pro/v1m/task/text-to-speech';
    submitBody = JSON.stringify({
      text,
      model: 'speech-2.6-hd',
      voice_setting: {
        voice_id: voiceId,
        vol: 1,
        pitch: 0,
        speed: 1,
      },
      language_boost: 'Auto',
    });
  } else {
    // ElevenLabs TTS via AI33
    submitUrl = `https://api.ai33.pro/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
    submitBody = JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
    });
  }

  const submitRes = await fetch(submitUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: submitBody,
  });

  const submitData = await submitRes.json();
  if (!submitData.success || !submitData.task_id) {
    throw new Error(`AI33 submit failed: ${JSON.stringify(submitData).substring(0, 200)}`);
  }

  const taskId = submitData.task_id;

  // Poll until done
  for (let i = 0; i < MAX_POLLS; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetch(`https://api.ai33.pro/v1/task/${taskId}`, {
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    });
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();

    if (pollData.status === 'done') {
      const audioUrl = pollData.metadata?.audio_url;
      if (!audioUrl) throw new Error('Task done but no audio_url');
      // Download audio bytes
      const audioRes = await fetch(audioUrl);
      const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
      const durationSec = audioBytes.length / 16000; // estimate for 128kbps
      return { audioBytes, durationSec, audioUrl };
    }

    if (pollData.status === 'error' || pollData.status === 'failed') {
      throw new Error(`TTS failed: ${pollData.error_message || 'Unknown'}`);
    }
  }

  throw new Error('TTS polling timed out');
}

// ── Clean script text for TTS ──────────────────────────────────────
function insertSsmlBreaks(text) {
  let result = text;
  result = result.replace(/\[(PAUSE\s+(\d+)\s*(?:SEC(?:ONDS?)?)?)\]/gi, (_, _c, seconds) => {
    const sec = parseInt(seconds) || 3;
    const groups = Math.ceil(sec / 3);
    return ' ' + Array(groups).fill('... ... ...').join(' ') + ' ';
  });
  result = result.replace(/\[BREATHE\]/gi, ' ... ... ... ... ');
  return result;
}

function cleanScript(text, isSleepMode = false) {
  let cleaned = text;
  if (isSleepMode) {
    cleaned = insertSsmlBreaks(cleaned);
  } else {
    cleaned = cleaned.replace(/\[[^\]]*\]/gi, '');
  }
  cleaned = cleaned
    .replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE)\s*:\s*/gim, '')
    .replace(/\*\*[^*]+\*\*:?\s*/g, '')
    .replace(/\([^)]*(?:voiceover|pause|beat|whisper|dramatic)[^)]*\)/gi, '')
    .replace(/\(?\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\)?/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned;
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const startTime = Date.now();

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, voice_id, provider } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const AI33_KEY = Deno.env.get('AI33_API_KEY');
    if (!AI33_KEY) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    // Fetch project & script
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final_aggregated script found.' }, { status: 400 });
    }

    const isSleepMode = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';
    const cleanedText = cleanScript(script.full_script, isSleepMode);
    const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;

    const defaultVoice = isSleepMode ? 'English_calm_female' : 'English_expressive_narrator';
    const selectedVoiceId = voice_id || defaultVoice;

    // Determine provider: MiniMax voice IDs are numeric or contain underscores like "English_xxx"
    // ElevenLabs voice IDs are 20-char alphanumeric
    const resolvedProvider = provider || (/^[a-zA-Z0-9]{20,}$/.test(selectedVoiceId) ? 'elevenlabs' : 'minimax');

    console.log(`🎙 Voiceover: ${wordCount} words, voice=${selectedVoiceId}, provider=${resolvedProvider}${isSleepMode ? ' (sleep)' : ''}`);

    // Update status
    const existingSettings = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const settings = existingSettings[0];
    if (settings) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        voiceover_status: 'generating',
        selected_voice_id: selectedVoiceId,
      });
    }

    // Split and process chunks
    const chunks = splitTextIntoChunks(cleanedText, 4000);
    console.log(`🎙 Split into ${chunks.length} chunks`);

    const CONCURRENCY = 3;
    const results = new Array(chunks.length).fill(null);

    for (let batch = 0; batch < chunks.length; batch += CONCURRENCY) {
      const batchEnd = Math.min(batch + CONCURRENCY, chunks.length);
      console.log(`🎙 Batch ${Math.floor(batch / CONCURRENCY) + 1}: chunks ${batch + 1}-${batchEnd}`);

      const promises = [];
      for (let i = batch; i < batchEnd; i++) {
        const idx = i;
        promises.push((async () => {
          for (let retry = 0; retry < 3; retry++) {
            try {
              if (retry > 0) await new Promise(r => setTimeout(r, 3000 * retry));
              const result = await generateChunkViaAi33(AI33_KEY, chunks[idx], selectedVoiceId, resolvedProvider);
              console.log(`✓ Chunk ${idx + 1}: ${result.audioBytes.length} bytes`);
              return { idx, ...result };
            } catch (err) {
              console.warn(`⚠️ Chunk ${idx + 1} attempt ${retry + 1}: ${err.message}`);
            }
          }
          return { idx, audioBytes: null, durationSec: 0 };
        })());
      }

      const batchResults = await Promise.all(promises);
      for (const r of batchResults) results[r.idx] = r;
    }

    const allAudioBytes = [];
    let totalDuration = 0;
    for (const r of results) {
      if (r?.audioBytes) {
        allAudioBytes.push(r.audioBytes);
        totalDuration += r.durationSec;
      }
    }

    if (allAudioBytes.length === 0) {
      return Response.json({ error: 'All TTS chunks failed' }, { status: 500 });
    }

    // Concatenate
    const totalLength = allAudioBytes.reduce((sum, c) => sum + c.length, 0);
    const audioBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of allAudioBytes) {
      audioBytes.set(chunk, offset);
      offset += chunk.length;
    }

    // Upload to Cloudflare R2 using AWS SigV4
    const fileName = `voiceovers/${project_id}-${Date.now()}.mp3`;
    const accountId = (Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim();
    const bucket = (Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '').trim();
    const accessKeyId = (Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '').trim();
    const secretAccessKey = (Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '').trim();

    const r2Url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${fileName}`;
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const shortDate = dateStamp.substring(0, 8);
    const region = 'auto';
    const service = 's3';
    const scope = `${shortDate}/${region}/${service}/aws4_request`;

    // Hash payload
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
      'PUT',
      `/${bucket}/${fileName}`,
      '',
      canonicalHeaders,
      signedHeaderKeys,
      payloadHash,
    ].join('\n');

    const canonicalRequestHash = Array.from(new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest))
    )).map(b => b.toString(16).padStart(2, '0')).join('');

    const stringToSign = ['AWS4-HMAC-SHA256', dateStamp, scope, canonicalRequestHash].join('\n');

    async function hmacSha256(key, msg) {
      const cryptoKey = await crypto.subtle.importKey('raw', typeof key === 'string' ? new TextEncoder().encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg)));
    }

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
    const audioUrl = `${publicUrl}/${fileName}`;

    totalDuration = Math.round(totalDuration * 10) / 10;

    // Save
    const settingsPayload = {
      project_id,
      selected_voice_id: selectedVoiceId,
      voiceover_status: 'ready',
      voiceover_url: audioUrl,
      total_duration_seconds: totalDuration,
    };
    if (settings) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, settingsPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create(settingsPayload);
    }

    await base44.asServiceRole.entities.Projects.update(project_id, { status: 'voiceover_ready' });

    const totalTime = Date.now() - startTime;
    console.log(`✓ Voiceover complete: ${totalDuration}s via ${resolvedProvider} (${totalTime}ms)`);

    return Response.json({
      success: true,
      voiceover_url: audioUrl,
      voiceover_duration_seconds: totalDuration,
      word_count: wordCount,
      voice_id: selectedVoiceId,
      chunks_processed: allAudioBytes.length,
      chunks_total: chunks.length,
      provider: resolvedProvider,
      processing_time_ms: totalTime,
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ generateVoiceover error (${totalTime}ms): ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});