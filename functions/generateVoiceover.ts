import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// VOICEOVER GENERATOR — MiniMax T2A primary, AI33 fallback
// ══════════════════════════════════════════════════════════════════
//
// MiniMax T2A v2 is synchronous — returns hex-encoded audio directly.
// No polling needed. Falls back to AI33 (async with polling) if MiniMax fails.
//
// MiniMax limit: 10,000 chars per request → chunk if longer.
// ══════════════════════════════════════════════════════════════════

// ── Split text into chunks ─────────────────────────────────────────
function splitTextIntoChunks(text, maxChars = 9000) {
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

// ── Hex string to Uint8Array ───────────────────────────────────────
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ── MiniMax TTS call ───────────────────────────────────────────────
async function generateWithMinimax(apiKey, text, voiceId) {
  const res = await fetch('https://api.minimax.io/v1/t2a_v2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'speech-2.8-hd',
      text,
      stream: false,
      voice_setting: {
        voice_id: voiceId,
        speed: 1,
        vol: 1,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
      language_boost: 'auto',
      output_format: 'hex',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`MiniMax TTS HTTP ${res.status}: ${errText.substring(0, 200)}`);
  }

  const data = await res.json();

  if (data.base_resp?.status_code !== 0) {
    throw new Error(`MiniMax TTS error: ${data.base_resp?.status_msg || 'Unknown'}`);
  }

  if (!data.data?.audio) {
    throw new Error('MiniMax TTS: no audio data returned');
  }

  const audioBytes = hexToBytes(data.data.audio);
  const durationMs = data.extra_info?.audio_length || 0;
  const durationSec = durationMs / 1000;

  return { audioBytes, durationSec };
}

// ── AI33 TTS call (async with polling) ─────────────────────────────
async function generateWithAi33(apiKey, text, voiceId) {
  // Submit task
  const submitRes = await fetch(`https://api.ai33.pro/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
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

  const submitData = await submitRes.json();
  if (!submitData.success || !submitData.task_id) {
    throw new Error(`AI33 TTS submit failed: ${JSON.stringify(submitData)}`);
  }

  const taskId = submitData.task_id;
  console.log(`AI33 TTS task: ${taskId}`);

  // Poll until done
  for (let i = 0; i < 60; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 5000));

    const pollRes = await fetch(`https://api.ai33.pro/v1/task/${taskId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    });

    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();

    if (pollData.status === 'done') {
      const audioUrl = pollData.metadata?.audio_url;
      if (!audioUrl) throw new Error('AI33 TTS done but no audio URL');

      // Download the audio
      const audioRes = await fetch(audioUrl);
      const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
      // Estimate duration from file size (128kbps = 16000 bytes/sec)
      const durationSec = audioBytes.length / 16000;
      return { audioBytes, durationSec };
    }

    if (pollData.status === 'failed' || pollData.status === 'error') {
      throw new Error(`AI33 TTS failed: ${pollData.error_message || 'Unknown'}`);
    }
  }

  throw new Error('AI33 TTS timed out');
}

// ── Clean script text for TTS ──────────────────────────────────────
function cleanScript(text) {
  return text
    .replace(/\[[^\]]*\]/gi, '')
    .replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE)\s*:\s*/gim, '')
    .replace(/\*\*[^*]+\*\*:?\s*/g, '')
    .replace(/\([^)]*(?:voiceover|pause|beat|whisper|dramatic)[^)]*\)/gi, '')
    .replace(/\(?\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\)?/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Estimate MP3 duration from bytes (128kbps) ────────────────────
function estimateMp3Duration(byteLength) {
  return byteLength / 16000;
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, script_id, voice_id, provider } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const MINIMAX_KEY = Deno.env.get('MINIMAX_API_KEY');
    const AI33_KEY = Deno.env.get('AI33_API_KEY');

    if (!MINIMAX_KEY && !AI33_KEY) {
      return Response.json({ error: 'No TTS API keys configured (MINIMAX_API_KEY or AI33_API_KEY)' }, { status: 500 });
    }

    // If provider is explicitly set, respect it
    const forceAi33 = provider === 'ai33' || provider === 'elevenlabs';

    // ── Fetch project & script ─────────────────────────────────────
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final_aggregated script found. Generate the full script first.' }, { status: 400 });
    }

    const cleanedText = cleanScript(script.full_script);
    const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;
    console.log(`🎙 Voiceover: ${wordCount} words, ${cleanedText.length} chars`);

    const selectedVoiceId = voice_id || 'English_expressive_narrator';

    // ── Update status to generating ────────────────────────────────
    const existingSettings = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const settings = existingSettings[0];
    if (settings) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        voiceover_status: 'generating',
        selected_voice_id: selectedVoiceId,
      });
    }

    // ── Determine provider from voice_id ───────────────────────────
    // MiniMax voices don't have ElevenLabs-style IDs (which are 20-char alphanumeric)
    const isAi33Voice = AI33_KEY && /^[a-zA-Z0-9]{20,}$/.test(selectedVoiceId);
    const useMinimax = MINIMAX_KEY && !isAi33Voice;

    // ── Split text into chunks ─────────────────────────────────────
    const chunkLimit = useMinimax ? 9000 : 4000;
    const chunks = splitTextIntoChunks(cleanedText, chunkLimit);
    console.log(`🎙 ${chunks.length} chunk(s), provider=${useMinimax ? 'minimax' : 'ai33'}, voice=${selectedVoiceId}`);

    let allAudioBytes = [];
    let totalDuration = 0;
    let usedProvider = 'none';

    // ── TRY MINIMAX ────────────────────────────────────────────────
    if (useMinimax) {
      try {
        for (let i = 0; i < chunks.length; i++) {
          console.log(`🎙 MiniMax chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
          const result = await generateWithMinimax(MINIMAX_KEY, chunks[i], selectedVoiceId);
          allAudioBytes.push(result.audioBytes);
          totalDuration += result.durationSec;
          console.log(`✓ MiniMax chunk ${i + 1}: ${result.audioBytes.length} bytes, ${result.durationSec.toFixed(1)}s`);
        }
        usedProvider = 'minimax';
      } catch (mmErr) {
        console.warn(`⚠️ MiniMax TTS failed: ${mmErr.message}`);
        allAudioBytes = [];
        totalDuration = 0;
      }
    }

    // ── FALLBACK TO AI33 ───────────────────────────────────────────
    if (usedProvider === 'none' && AI33_KEY) {
      console.log('🎙 Falling back to AI33 (ElevenLabs)...');
      const ai33VoiceId = isAi33Voice ? selectedVoiceId : '21m00Tcm4TlvDq8ikWAM'; // Rachel default
      const ai33Chunks = splitTextIntoChunks(cleanedText, 4000);

      for (let i = 0; i < ai33Chunks.length; i++) {
        console.log(`🎙 AI33 chunk ${i + 1}/${ai33Chunks.length} (${ai33Chunks[i].length} chars)...`);
        const result = await generateWithAi33(AI33_KEY, ai33Chunks[i], ai33VoiceId);
        allAudioBytes.push(result.audioBytes);
        totalDuration += result.durationSec;
        console.log(`✓ AI33 chunk ${i + 1}: ${result.audioBytes.length} bytes, ${result.durationSec.toFixed(1)}s`);
      }
      usedProvider = 'ai33';
    }

    if (usedProvider === 'none') {
      throw new Error('All TTS providers failed');
    }

    // ── Concatenate audio chunks ───────────────────────────────────
    const totalLength = allAudioBytes.reduce((sum, c) => sum + c.length, 0);
    const audioBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of allAudioBytes) {
      audioBytes.set(chunk, offset);
      offset += chunk.length;
    }
    console.log(`🎙 Combined: ${audioBytes.length} bytes`);

    // ── Upload to Base44 ───────────────────────────────────────────
    const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
    const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
      file: new File([audioBlob], 'voiceover.mp3', { type: 'audio/mpeg' }),
    });
    const audioUrl = uploadResult.file_url;
    console.log(`✓ Uploaded: ${audioUrl}`);

    // ── If MiniMax gave us exact duration, use it; otherwise estimate ─
    if (usedProvider !== 'minimax' || totalDuration < 1) {
      totalDuration = estimateMp3Duration(audioBytes.length);
    }
    totalDuration = Math.round(totalDuration * 10) / 10;

    // ── Save to ProductionSettings ─────────────────────────────────
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

    console.log(`✓ Voiceover complete: ${totalDuration}s via ${usedProvider}`);

    return Response.json({
      success: true,
      voiceover_url: audioUrl,
      voiceover_duration_seconds: totalDuration,
      word_count: wordCount,
      voice_id: selectedVoiceId,
      chunks_count: chunks.length,
      provider: usedProvider,
    });

  } catch (error) {
    console.error(`❌ generateVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});