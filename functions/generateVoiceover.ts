import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// VOICEOVER GENERATOR — MASTER CLOCK CREATOR
// ══════════════════════════════════════════════════════════════════
//
// This function is the TIMING AUTHORITY for the entire pipeline.
// It generates TTS audio and stores `voiceover_duration_seconds`
// which all downstream functions (timeline, preview) must obey.
//
// Flow:
//   1. Fetch final_aggregated script
//   2. Clean narration text (strip directions, timestamps, labels)
//   3. Send to ai33.pro TTS API → get task_id
//   4. Poll until audio is ready → get audio_url
//   5. Calculate duration from MP3 file size (128kbps)
//   6. Store voiceover_url + voiceover_duration_seconds
//
// Output format: 1920x1080 YouTube standard (stored for downstream)
// ══════════════════════════════════════════════════════════════════

// ── Chunk text for TTS ─────────────────────────────────────────────
// ai33.pro queues long text asynchronously with no download endpoint.
// We split into small chunks (~500 chars) that return audio directly.
function splitTextIntoChunks(text, maxChars = 500) {
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

// ── Generate TTS for a single chunk ────────────────────────────────
async function generateChunkAudio(apiKey, voiceId, text, chunkIndex) {
  const res = await fetch(
    `https://api.ai33.pro/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`TTS chunk ${chunkIndex} failed: ${res.status} ${errText}`);
  }

  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // Check if JSON (async task) vs binary audio
  if (bytes.length < 50000 && bytes[0] === 0x7B) {
    const jsonText = new TextDecoder().decode(bytes);
    const data = JSON.parse(jsonText);
    console.log(`Chunk ${chunkIndex}: JSON response — keys: ${Object.keys(data).join(', ')}`);

    if (data.audio_url || data.url) {
      // Fetch the audio from the URL
      const audioRes = await fetch(data.audio_url || data.url);
      const audioBuf = await audioRes.arrayBuffer();
      return new Uint8Array(audioBuf);
    }

    // If still async, we need to wait and retry
    if (data.task_id) {
      console.log(`Chunk ${chunkIndex}: got task_id, waiting 15s then retrying...`);
      await new Promise(r => setTimeout(r, 15000));
      // Retry the same chunk
      return generateChunkAudio(apiKey, voiceId, text, chunkIndex);
    }

    throw new Error(`Chunk ${chunkIndex}: unexpected JSON: ${jsonText.substring(0, 200)}`);
  }

  console.log(`Chunk ${chunkIndex}: got ${bytes.length} bytes of audio`);
  return bytes;
}



// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, voice_id = '21m00Tcm4TlvDq8ikWAM' } = await req.json();

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
        error: 'No final script found. Generate the full script first.'
      }, { status: 404 });
    }

    // ── Clean narration text ───────────────────────────────────────
    const cleanedText = script.full_script
      .replace(/\[[^\]]*\]/gi, '')                                              // [bracketed directions]
      .replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE)\s*:\s*/gim, '') // Label prefixes
      .replace(/\*\*[^*]+\*\*:?\s*/g, '')                                      // **bold headers**
      .replace(/\([^)]*(?:voiceover|pause|beat|whisper|dramatic)[^)]*\)/gi, '') // (parenthetical directions)
      .replace(/\(?\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\)?/g, '')           // Timestamps
      .replace(/#{1,6}\s+/g, '')                                               // Markdown headers
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;
    console.log(`🎙 Voiceover: ${wordCount} words from final_aggregated script`);

    // ── Generate TTS in chunks to avoid async task_id issue ────────
    // ai33.pro queues long text and returns task_id with no retrievable
    // endpoint. Small chunks return binary audio directly.
    const chunks = splitTextIntoChunks(cleanedText, 500);
    console.log(`🎙 Split into ${chunks.length} chunks for TTS`);

    const audioChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`🎙 Generating chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
      const chunkBytes = await generateChunkAudio(API_KEY, voice_id, chunks[i], i + 1);
      audioChunks.push(chunkBytes);
    }

    // ── Concatenate all audio chunks ──────────────────────────────
    const totalLength = audioChunks.reduce((sum, c) => sum + c.length, 0);
    const combinedAudio = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunks) {
      combinedAudio.set(chunk, offset);
      offset += chunk.length;
    }

    console.log(`🎙 Combined audio: ${combinedAudio.length} bytes`);

    // Calculate duration from file size (128kbps MP3 = 16,000 bytes/sec)
    let voiceoverDuration = combinedAudio.length / 16000;
    console.log(`🎙 Duration from size: ${voiceoverDuration.toFixed(1)}s`);

    // ── Upload combined audio ─────────────────────────────────────
    const audioBlob = new Blob([combinedAudio], { type: 'audio/mpeg' });
    const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
      file: new File([audioBlob], 'voiceover.mp3', { type: 'audio/mpeg' })
    });
    let audioUrl = uploadResult.file_url;
    console.log(`✓ Audio uploaded: ${audioUrl}`);

    // Round to 1 decimal
    voiceoverDuration = Math.round(voiceoverDuration * 10) / 10;
    console.log(`🎙 Final voiceover duration: ${voiceoverDuration}s`);

    // ── Store as MASTER TIMING AUTHORITY ────────────────────────────
    const existingSettings = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const settings = existingSettings[0];

    const settingsPayload = {
      project_id,
      selected_voice_id: voice_id,
      voiceover_status: 'ready',
      voiceover_url: audioUrl,
      voiceover_duration_seconds: voiceoverDuration,
      total_duration_seconds: voiceoverDuration, // sync legacy field
      output_resolution: '1920x1080',            // enforce YouTube standard
    };

    // no task_id in chunked mode

    if (settings) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, settingsPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create(settingsPayload);
    }

    // ── Update project status ──────────────────────────────────────
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'voiceover_ready'
    });

    console.log(`✓ Voiceover complete: ${voiceoverDuration}s | ${audioUrl.substring(0, 80)}...`);

    return Response.json({
      success: true,
      voiceover_url: audioUrl,
      voiceover_duration_seconds: voiceoverDuration,
      word_count: wordCount,
      voice_id,
      output_resolution: '1920x1080'
    });

  } catch (error) {
    console.error(`❌ generateVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});