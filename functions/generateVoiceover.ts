import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// VOICEOVER GENERATOR — MASTER CLOCK CREATOR
// ══════════════════════════════════════════════════════════════════
//
// Uses Kie Market unified API for ElevenLabs TTS (same KIE_API_KEY
// as video generation). Async task → poll → download audio URL.
//
// Flow:
//   1. Fetch final_aggregated script
//   2. Clean narration text
//   3. Submit TTS via Kie Market → get taskId
//   4. Poll until audio ready → get resultUrl (MP3)
//   5. Upload to Base44 storage
//   6. Store voiceover_url + duration
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = 'https://api.kie.ai/api/v1/jobs';

// ── Split text into chunks ─────────────────────────────────────────
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

// ── Submit TTS task to Kie Market ──────────────────────────────────
async function submitTtsTask(apiKey, text, voice = 'Rachel') {
  const res = await fetch(`${KIE_BASE}/createTask`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'elevenlabs/text-to-speech-turbo-2-5',
      input: {
        text,
        voice,
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        speed: 1,
      },
    }),
  });

  const data = await res.json();
  console.log(`TTS submit: ${res.status} → code=${data.code}`);

  if (data.code !== 200) {
    throw new Error(`TTS submit failed: ${data.msg || JSON.stringify(data)}`);
  }

  return data.data.taskId;
}

// ── Poll Kie task until done ──────────────────────────────────────
async function pollKieTask(apiKey, taskId, maxAttempts = 60, intervalMs = 5000) {
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, intervalMs));

    const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    const data = await res.json();
    if (data.code !== 200) {
      console.warn(`Poll ${i + 1}: code=${data.code} msg=${data.message}`);
      continue;
    }

    const { state, resultJson, failMsg } = data.data;
    console.log(`Poll ${i + 1}: state=${state}`);

    if (state === 'success') {
      const result = JSON.parse(resultJson);
      return result.resultUrls?.[0] || result.url || null;
    }

    if (state === 'fail') {
      throw new Error(`TTS task failed: ${failMsg}`);
    }
    // waiting / queuing / generating → keep polling
  }

  throw new Error(`TTS task ${taskId} timed out after ${maxAttempts} polls`);
}

// ── Calculate MP3 duration from file size (128kbps) ───────────────
function estimateMp3Duration(byteLength) {
  return byteLength / 16000; // 128kbps = 16,000 bytes/sec
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, voice_id, voice_name = 'Rachel' } = await req.json();

    if (!project_id) {
      return Response.json({ error: 'Missing project_id' }, { status: 400 });
    }

    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!KIE_API_KEY) {
      return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });
    }

    // ── Fetch project ─────────────────────────────────────────────
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // ── Get final aggregated script ────────────────────────────────
    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');

    if (!script?.full_script) {
      return Response.json({
        error: 'No final script found. Generate the full script first.'
      }, { status: 404 });
    }

    // ── Clean narration text ───────────────────────────────────────
    const cleanedText = script.full_script
      .replace(/\[[^\]]*\]/gi, '')
      .replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE)\s*:\s*/gim, '')
      .replace(/\*\*[^*]+\*\*:?\s*/g, '')
      .replace(/\([^)]*(?:voiceover|pause|beat|whisper|dramatic)[^)]*\)/gi, '')
      .replace(/\(?\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\)?/g, '')
      .replace(/#{1,6}\s+/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;
    console.log(`🎙 Voiceover: ${wordCount} words from final_aggregated script`);

    // ── Update status to generating ────────────────────────────────
    const existingSettings = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const settings = existingSettings[0];
    if (settings) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        voiceover_status: 'generating',
      });
    }

    // ── Submit TTS to Kie Market ───────────────────────────────────
    console.log(`🎙 Submitting to Kie ElevenLabs TTS (voice: ${voice_name})...`);
    const taskId = await submitTtsTask(KIE_API_KEY, cleanedText, voice_name);
    console.log(`🎙 TTS task created: ${taskId}`);

    // ── Poll until ready ───────────────────────────────────────────
    console.log(`🎙 Polling for TTS result...`);
    const audioResultUrl = await pollKieTask(KIE_API_KEY, taskId);

    if (!audioResultUrl) {
      throw new Error('TTS completed but no audio URL returned');
    }
    console.log(`🎙 Audio ready: ${audioResultUrl.substring(0, 80)}...`);

    // ── Download audio and re-upload to Base44 storage ─────────────
    const audioRes = await fetch(audioResultUrl);
    const audioBuffer = await audioRes.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);
    console.log(`🎙 Downloaded audio: ${audioBytes.length} bytes`);

    const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
    const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
      file: new File([audioBlob], 'voiceover.mp3', { type: 'audio/mpeg' })
    });
    const audioUrl = uploadResult.file_url;
    console.log(`✓ Audio uploaded: ${audioUrl}`);

    // ── Calculate duration ─────────────────────────────────────────
    let voiceoverDuration = estimateMp3Duration(audioBytes.length);
    voiceoverDuration = Math.round(voiceoverDuration * 10) / 10;
    console.log(`🎙 Duration: ${voiceoverDuration}s`);

    // ── Store as MASTER TIMING AUTHORITY ────────────────────────────
    const settingsPayload = {
      project_id,
      selected_voice_id: voice_id || voice_name,
      voiceover_status: 'ready',
      voiceover_url: audioUrl,
      total_duration_seconds: voiceoverDuration,
    };

    if (settings) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, settingsPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create(settingsPayload);
    }

    // ── Update project status ──────────────────────────────────────
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'voiceover_ready'
    });

    console.log(`✓ Voiceover complete: ${voiceoverDuration}s`);

    return Response.json({
      success: true,
      voiceover_url: audioUrl,
      voiceover_duration_seconds: voiceoverDuration,
      word_count: wordCount,
      voice_name,
      task_id: taskId,
    });

  } catch (error) {
    console.error(`❌ generateVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});