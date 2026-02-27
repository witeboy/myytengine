import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// VOICEOVER GENERATOR — MiniMax T2A primary, AI33 fallback
// ══════════════════════════════════════════════════════════════════

const FETCH_TIMEOUT_MS = 30000; // 30 seconds per API call
const AI33_POLL_INTERVAL_MS = 3000; // 3 seconds between polls
const AI33_MAX_POLLS = 20; // Max 60 seconds of polling

// ── Fetch with timeout ─────────────────────────────────────────────
async function fetchWithTimeout(url, options, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

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
  const res = await fetchWithTimeout('https://api.minimax.io/v1/t2a_v2', {
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
  }, 45000); // 45 second timeout for MiniMax

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
  const submitRes = await fetchWithTimeout(
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
    },
    20000 // 20 second timeout for submit
  );

  const submitData = await submitRes.json();
  if (!submitData.success || !submitData.task_id) {
    throw new Error(`AI33 TTS submit failed: ${JSON.stringify(submitData)}`);
  }

  const taskId = submitData.task_id;
  console.log(`AI33 TTS task: ${taskId}`);

  // Poll until done (max 60 seconds)
  for (let i = 0; i < AI33_MAX_POLLS; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, AI33_POLL_INTERVAL_MS));

    try {
      const pollRes = await fetchWithTimeout(
        `https://api.ai33.pro/v1/task/${taskId}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
        },
        10000 // 10 second timeout for poll
      );

      if (!pollRes.ok) continue;
      const pollData = await pollRes.json();

      if (pollData.status === 'done') {
        const audioUrl = pollData.metadata?.audio_url;
        if (!audioUrl) throw new Error('AI33 TTS done but no audio URL');

        // Download the audio with timeout
        const audioRes = await fetchWithTimeout(audioUrl, {}, 30000);
        const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
        // Estimate duration from file size (128kbps = 16000 bytes/sec)
        const durationSec = audioBytes.length / 16000;
        return { audioBytes, durationSec };
      }

      if (pollData.status === 'failed' || pollData.status === 'error') {
        throw new Error(`AI33 TTS failed: ${pollData.error_message || 'Unknown'}`);
      }
      
      console.log(`AI33 poll ${i + 1}/${AI33_MAX_POLLS}: status=${pollData.status}`);
    } catch (pollErr) {
      if (pollErr.name === 'AbortError') {
        console.warn(`AI33 poll ${i + 1} timed out, retrying...`);
      } else {
        throw pollErr;
      }
    }
  }

  throw new Error('AI33 TTS timed out after 60 seconds');
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
  const startTime = Date.now();
  
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
    const useMinimax = !forceAi33 && MINIMAX_KEY && !isAi33Voice;

    const chunks = splitTextIntoChunks(cleanedText, 9000);
    let allAudioBytes = [];
    let totalDuration = 0;
    let usedProvider = 'none';

    console.log(`🎙 Split into ${chunks.length} chunks for TTS`);

    // ── TRY MINIMAX (parallel batches of 10) ───────────────────────
    if (useMinimax) {
      try {
        const CONCURRENCY = 10;
        const results = new Array(chunks.length).fill(null);

        for (let batch = 0; batch < chunks.length; batch += CONCURRENCY) {
          const batchEnd = Math.min(batch + CONCURRENCY, chunks.length);
          console.log(`🎙 MiniMax batch ${Math.floor(batch / CONCURRENCY) + 1}: chunks ${batch + 1}-${batchEnd}`);

          const promises = [];
          for (let i = batch; i < batchEnd; i++) {
            const idx = i;
            promises.push((async () => {
              for (let retry = 0; retry < 3; retry++) {
                try {
                  if (retry > 0) await new Promise(r => setTimeout(r, 2000 * retry));
                  const result = await generateWithMinimax(MINIMAX_KEY, chunks[idx], selectedVoiceId);
                  console.log(`✓ Chunk ${idx + 1}: ${result.audioBytes.length} bytes, ${result.durationSec.toFixed(1)}s`);
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

        for (const r of results) {
          if (r?.audioBytes) {
            allAudioBytes.push(r.audioBytes);
            totalDuration += r.durationSec;
          }
        }

        if (allAudioBytes.length > 0) {
          usedProvider = 'minimax';
          console.log(`✓ MiniMax done: ${allAudioBytes.length}/${chunks.length} chunks, ${totalDuration.toFixed(1)}s`);
        } else {
          throw new Error('All MiniMax chunks failed');
        }
      } catch (mmErr) {
        console.warn(`⚠️ MiniMax failed: ${mmErr.message}`);
        allAudioBytes = [];
        totalDuration = 0;
      }
    }

    // ── FALLBACK TO AI33 (parallel batches of 5) ───────────────────
    if (usedProvider === 'none' && AI33_KEY) {
      console.log('🎙 Falling back to AI33 (ElevenLabs)...');
      const ai33VoiceId = isAi33Voice ? selectedVoiceId : '21m00Tcm4TlvDq8ikWAM';
      const ai33Chunks = splitTextIntoChunks(cleanedText, 2500);
      const AI33_CONCURRENCY = 5;
      const ai33Results = new Array(ai33Chunks.length).fill(null);

      for (let batch = 0; batch < ai33Chunks.length; batch += AI33_CONCURRENCY) {
        const batchEnd = Math.min(batch + AI33_CONCURRENCY, ai33Chunks.length);
        console.log(`🎙 AI33 batch ${Math.floor(batch / AI33_CONCURRENCY) + 1}: chunks ${batch + 1}-${batchEnd}`);

        const promises = [];
        for (let i = batch; i < batchEnd; i++) {
          const idx = i;
          promises.push((async () => {
            for (let retry = 0; retry < 3; retry++) {
              try {
                if (retry > 0) await new Promise(r => setTimeout(r, 3000 * retry));
                const result = await generateWithAi33(AI33_KEY, ai33Chunks[idx], ai33VoiceId);
                console.log(`✓ AI33 chunk ${idx + 1}: ${result.audioBytes.length} bytes`);
                return { idx, ...result };
              } catch (err) {
                console.warn(`⚠️ AI33 chunk ${idx + 1} attempt ${retry + 1}: ${err.message}`);
              }
            }
            return { idx, audioBytes: null, durationSec: 0 };
          })());
        }

        const batchResults = await Promise.all(promises);
        for (const r of batchResults) ai33Results[r.idx] = r;
      }

      for (const r of ai33Results) {
        if (r?.audioBytes) {
          allAudioBytes.push(r.audioBytes);
          totalDuration += r.durationSec;
        }
      }
      if (allAudioBytes.length > 0) {
        usedProvider = 'ai33';
        console.log(`✓ AI33 done: ${allAudioBytes.length}/${ai33Chunks.length} chunks`);
      }
    }

    if (usedProvider === 'none') {
      return Response.json({ error: 'All TTS providers failed' }, { status: 500 });
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

    const totalTime = Date.now() - startTime;
    console.log(`✓ Voiceover complete: ${totalDuration}s via ${usedProvider} (took ${totalTime}ms)`);

    return Response.json({
      success: true,
      voiceover_url: audioUrl,
      voiceover_duration_seconds: totalDuration,
      word_count: wordCount,
      voice_id: selectedVoiceId,
      chunks_processed: allAudioBytes.length,
      chunks_total: chunks.length,
      provider: usedProvider,
      processing_time_ms: totalTime,
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ generateVoiceover error (${totalTime}ms): ${error.message}`);
    
    // Provide more helpful error messages
    let userMessage = error.message;
    if (error.name === 'AbortError') {
      userMessage = 'Voice generation timed out. Try with a shorter script.';
    } else if (error.message.includes('fetch')) {
      userMessage = 'Could not connect to voice API. Please try again.';
    }
    
    return Response.json({ 
      error: userMessage,
      details: error.message,
      processing_time_ms: totalTime,
    }, { status: 500 });
  }
});