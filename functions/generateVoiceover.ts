import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// VOICEOVER GENERATOR — AI33 TTS API (ElevenLabs via ai33.pro)
// ══════════════════════════════════════════════════════════════════
//
// Uses AI33 API for ElevenLabs TTS.
// Endpoint: POST https://api.ai33.pro/v1/text-to-speech/$voice_id
// Returns task_id → poll GET /v1/task/$task_id → audio_url
//
// Flow:
//   1. Fetch final_aggregated script
//   2. Clean narration text
//   3. Split into chunks if needed
//   4. Submit each chunk to AI33 TTS → get task_id
//   5. Poll each task until done → get audio_url
//   6. Download, concatenate, upload to Base44
//   7. Store voiceover_url + duration
// ══════════════════════════════════════════════════════════════════

const AI33_BASE = 'https://api.ai33.pro';

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

// ── Submit TTS task to AI33 ────────────────────────────────────────
async function submitTtsTask(apiKey, text, voiceId = '21m00Tcm4TlvDq8ikWAM') {
  const url = `${AI33_BASE}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
    }),
  });

  const data = await res.json();
  console.log(`TTS submit: ${res.status} → success=${data.success}`);

  if (!data.success || !data.task_id) {
    throw new Error(`TTS submit failed: ${JSON.stringify(data)}`);
  }

  return data.task_id;
}

// ── Poll AI33 task until done ─────────────────────────────────────
async function pollAi33Task(apiKey, taskId, maxAttempts = 60, intervalMs = 5000) {
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, intervalMs));

    const res = await fetch(`${AI33_BASE}/v1/task/${taskId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
    });

    if (!res.ok) {
      console.warn(`Poll ${i + 1}: HTTP ${res.status}`);
      continue;
    }

    const data = await res.json();
    console.log(`Poll ${i + 1}: status=${data.status}`);

    if (data.status === 'done') {
      return {
        audio_url: data.metadata?.audio_url || null,
        srt_url: data.metadata?.srt_url || null,
      };
    }

    if (data.status === 'failed' || data.status === 'error') {
      throw new Error(`TTS task failed: ${data.error_message || 'Unknown error'}`);
    }
    // pending/processing → keep polling
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

    const { project_id, script_id, voice_id } = await req.json();

    if (!project_id) {
      return Response.json({ error: 'Missing project_id' }, { status: 400 });
    }

    const API_KEY = Deno.env.get('AI33_API_KEY');
    if (!API_KEY) {
      return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
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
        error: 'No final_aggregated script found. Please generate the full script first (Final Script step).'
      }, { status: 400 });
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

    // ── Default voice ID if none selected ──────────────────────────
    const selectedVoiceId = voice_id || '21m00Tcm4TlvDq8ikWAM'; // Rachel default

    // ── Update status to generating ────────────────────────────────
    const existingSettings = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const settings = existingSettings[0];
    if (settings) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        voiceover_status: 'generating',
      });
    }

    // ── Split into chunks if text is too long (>4000 chars) ───────
    const chunks = splitTextIntoChunks(cleanedText, 4000);
    console.log(`🎙 Split into ${chunks.length} chunk(s) for TTS`);

    const audioChunkUrls = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`🎙 Submitting chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars, voice: ${selectedVoiceId})...`);
      const taskId = await submitTtsTask(API_KEY, chunks[i], selectedVoiceId);
      console.log(`🎙 TTS task ${i + 1}: ${taskId}`);

      const result = await pollAi33Task(API_KEY, taskId);
      if (!result.audio_url) throw new Error(`Chunk ${i + 1}: TTS completed but no audio URL`);
      console.log(`🎙 Chunk ${i + 1} ready: ${result.audio_url.substring(0, 60)}...`);
      audioChunkUrls.push(result.audio_url);
    }

    // ── Download all chunks and concatenate ────────────────────────
    const allChunkBytes = [];
    for (let i = 0; i < audioChunkUrls.length; i++) {
      const audioRes = await fetch(audioChunkUrls[i]);
      const buf = await audioRes.arrayBuffer();
      allChunkBytes.push(new Uint8Array(buf));
      console.log(`🎙 Downloaded chunk ${i + 1}: ${buf.byteLength} bytes`);
    }

    const totalLength = allChunkBytes.reduce((sum, c) => sum + c.length, 0);
    const audioBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of allChunkBytes) {
      audioBytes.set(chunk, offset);
      offset += chunk.length;
    }
    console.log(`🎙 Combined audio: ${audioBytes.length} bytes`);

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
      selected_voice_id: selectedVoiceId,
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
      voice_id: selectedVoiceId,
      chunks_count: chunks.length,
    });

  } catch (error) {
    console.error(`❌ generateVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});