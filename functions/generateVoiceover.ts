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

// ── ai33.pro polling helper ────────────────────────────────────────
async function pollVoiceoverTask(apiKey, taskId, maxWaitMs = 120000) {
  const pollInterval = 5000;
  const start = Date.now();

  // Try multiple endpoint patterns used by ElevenLabs-compatible APIs
  const endpoints = [
    `https://api.ai33.pro/v1/history/${taskId}`,
    `https://api.ai33.pro/v1/text-to-speech/${taskId}`,
    `https://api.ai33.pro/v1/tasks/${taskId}`,
  ];

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollInterval));

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: { 'xi-api-key': apiKey }
        });

        console.log(`Poll ${url.split('/').slice(-2).join('/')}: HTTP ${res.status}`);

        if (!res.ok) continue;

        const contentType = res.headers.get('content-type') || '';

        // If we get audio back directly from polling
        if (contentType.includes('audio/') || contentType.includes('octet-stream')) {
          console.log(`✓ Got audio from poll endpoint`);
          return { _audioResponse: res };
        }

        const data = await res.json();
        const status = data.status || data.state;
        console.log(`Poll result: ${JSON.stringify(data).substring(0, 300)}`);

        if (status === 'completed' || status === 'success' || status === 'done' || data.audio_url) {
          return data;
        }

        if (status === 'failed' || status === 'error') {
          throw new Error(`TTS task failed: ${data.error || data.message || 'Unknown'}`);
        }

        // Found a valid endpoint, stop trying others
        break;
      } catch (pollErr) {
        if (pollErr.message.includes('TTS task failed')) throw pollErr;
        // Continue to next endpoint
      }
    }
  }

  throw new Error(`TTS task ${taskId} timed out after ${maxWaitMs / 1000}s`);
}

// ── Duration calculator ────────────────────────────────────────────
// For MP3 at 128kbps: duration = file_size_bytes / (128000 / 8) = bytes / 16000
// Fallback: estimate from word count (~150 words/min for narration)

async function calculateAudioDuration(audioUrl, wordCount) {
  // Method 1: From file size (accurate for CBR MP3)
  try {
    const headRes = await fetch(audioUrl, { method: 'HEAD' });
    const contentLength = parseInt(headRes.headers.get('content-length') || '0', 10);

    if (contentLength > 0) {
      // 128kbps MP3 = 16,000 bytes per second
      const durationFromSize = contentLength / 16000;
      console.log(`Duration from file size: ${durationFromSize.toFixed(1)}s (${contentLength} bytes @ 128kbps)`);
      return durationFromSize;
    }
  } catch (err) {
    console.warn(`HEAD request failed: ${err.message}`);
  }

  // Method 2: Estimate from word count (fallback)
  const WORDS_PER_MINUTE = 150; // standard narration pace
  const estimatedDuration = (wordCount / WORDS_PER_MINUTE) * 60;
  console.log(`Duration estimated from words: ${estimatedDuration.toFixed(1)}s (${wordCount} words @ ${WORDS_PER_MINUTE} wpm)`);
  return estimatedDuration;
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

    // ── Generate TTS ───────────────────────────────────────────────
    const ttsResponse = await fetch(
      `https://api.ai33.pro/v1/text-to-speech/${voice_id}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': API_KEY,
        },
        body: JSON.stringify({
          text: cleanedText,
          model_id: 'eleven_multilingual_v2',
          with_transcript: true,
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      return Response.json({ error: `TTS API error: ${errText}` }, { status: 500 });
    }

    // ── Detect response type ───────────────────────────────────────
    // ai33.pro ElevenLabs-compatible API returns audio as binary stream
    // Content-Type will be audio/mpeg for MP3
    const contentType = ttsResponse.headers.get('content-type') || '';
    console.log(`🎙 TTS response content-type: ${contentType}, status: ${ttsResponse.status}`);

    let audioUrl = null;
    let voiceoverDuration = null;
    let taskId = null;

    // ── Always read as binary first — ai33.pro returns raw audio ──
    const audioArrayBuffer = await ttsResponse.arrayBuffer();
    const audioBytes = new Uint8Array(audioArrayBuffer);
    console.log(`🎙 Response size: ${audioBytes.length} bytes`);

    // Check if it's actually JSON (small response, starts with '{')
    const isJson = audioBytes.length < 50000 && audioBytes[0] === 0x7B; // '{'

    if (isJson) {
      const jsonText = new TextDecoder().decode(audioBytes);
      console.log(`🎙 JSON response (full): ${jsonText.substring(0, 1000)}`);
      const ttsData = JSON.parse(jsonText);

      // Log all keys for debugging
      console.log(`🎙 JSON keys: ${Object.keys(ttsData).join(', ')}`);
      taskId = ttsData.task_id;

      if (ttsData.audio_url || ttsData.url || ttsData.output_url) {
        audioUrl = ttsData.audio_url || ttsData.url || ttsData.output_url;
        console.log(`✓ Audio URL (sync): ${audioUrl}`);
        voiceoverDuration = ttsData.duration_seconds || ttsData.duration;

      } else if (ttsData.task_id) {
        // ai33.pro returns task_id for async generation
        // Try to fetch audio directly from known download patterns
        console.log(`⏳ Task ID received: ${ttsData.task_id} — attempting direct download patterns...`);

        const downloadUrls = [
          `https://api.ai33.pro/v1/text-to-speech/${voice_id}/stream?task_id=${ttsData.task_id}`,
          `https://api.ai33.pro/v1/audio/${ttsData.task_id}`,
          `https://api.ai33.pro/v1/download/${ttsData.task_id}`,
          `https://api.ai33.pro/v1/text-to-speech/result/${ttsData.task_id}`,
        ];

        let audioFetched = false;

        // First: poll the original TTS endpoint again (some APIs queue then serve)
        for (let attempt = 0; attempt < 12; attempt++) {
          console.log(`⏳ Retry attempt ${attempt + 1}/12...`);
          await new Promise(r => setTimeout(r, 10000)); // wait 10s between retries

          // Try original endpoint again
          try {
            const retryRes = await fetch(
              `https://api.ai33.pro/v1/text-to-speech/${voice_id}?output_format=mp3_44100_128`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'xi-api-key': API_KEY,
                },
                body: JSON.stringify({
                  text: cleanedText,
                  model_id: 'eleven_multilingual_v2',
                }),
              }
            );
            
            const retryCt = retryRes.headers.get('content-type') || '';
            console.log(`Retry response: ${retryRes.status}, type: ${retryCt}, size: ~${retryRes.headers.get('content-length') || '?'}`);

            if (retryRes.ok && (retryCt.includes('audio/') || retryCt.includes('octet-stream'))) {
              const retryBuf = await retryRes.arrayBuffer();
              const retryBytes = new Uint8Array(retryBuf);
              if (retryBytes.length > 1000) {
                console.log(`✓ Got audio on retry: ${retryBytes.length} bytes`);
                voiceoverDuration = retryBytes.length / 16000;
                const retryBlob = new Blob([retryBytes], { type: 'audio/mpeg' });
                const retryUpload = await base44.asServiceRole.integrations.Core.UploadFile({
                  file: new File([retryBlob], 'voiceover.mp3', { type: 'audio/mpeg' })
                });
                audioUrl = retryUpload.file_url;
                audioFetched = true;
                break;
              }
            } else if (retryRes.ok) {
              const retryBuf2 = await retryRes.arrayBuffer();
              const retryBytes2 = new Uint8Array(retryBuf2);
              // Check if binary audio despite JSON content-type
              if (retryBytes2.length > 10000 && retryBytes2[0] !== 0x7B) {
                console.log(`✓ Got binary audio on retry (mistyped CT): ${retryBytes2.length} bytes`);
                voiceoverDuration = retryBytes2.length / 16000;
                const retryBlob2 = new Blob([retryBytes2], { type: 'audio/mpeg' });
                const retryUpload2 = await base44.asServiceRole.integrations.Core.UploadFile({
                  file: new File([retryBlob2], 'voiceover.mp3', { type: 'audio/mpeg' })
                });
                audioUrl = retryUpload2.file_url;
                audioFetched = true;
                break;
              }
              // Still JSON — check if it now has audio_url
              const retryJson = JSON.parse(new TextDecoder().decode(retryBytes2));
              console.log(`Retry JSON keys: ${Object.keys(retryJson).join(', ')}`);
              if (retryJson.audio_url || retryJson.url || retryJson.output_url) {
                audioUrl = retryJson.audio_url || retryJson.url || retryJson.output_url;
                voiceoverDuration = retryJson.duration_seconds || retryJson.duration;
                audioFetched = true;
                break;
              }
            }
          } catch (retryErr) {
            console.warn(`Retry error: ${retryErr.message}`);
          }

          // Also try download URLs
          for (const dlUrl of downloadUrls) {
            try {
              const dlRes = await fetch(dlUrl, {
                headers: { 'xi-api-key': API_KEY }
              });
              const dlCt = dlRes.headers.get('content-type') || '';
              console.log(`  ${dlUrl.split('.pro')[1]}: ${dlRes.status} ${dlCt}`);

              if (dlRes.ok && (dlCt.includes('audio/') || dlCt.includes('octet-stream'))) {
                const dlBuf = await dlRes.arrayBuffer();
                const dlBytes = new Uint8Array(dlBuf);
                if (dlBytes.length > 1000) {
                  console.log(`✓ Got audio from download URL: ${dlBytes.length} bytes`);
                  voiceoverDuration = dlBytes.length / 16000;
                  const dlBlob = new Blob([dlBytes], { type: 'audio/mpeg' });
                  const dlUpload = await base44.asServiceRole.integrations.Core.UploadFile({
                    file: new File([dlBlob], 'voiceover.mp3', { type: 'audio/mpeg' })
                  });
                  audioUrl = dlUpload.file_url;
                  audioFetched = true;
                  break;
                }
              }
            } catch (e) {
              // skip
            }
          }
          if (audioFetched) break;
        }

        if (!audioFetched) {
          throw new Error(`TTS returned task_id ${ttsData.task_id} but audio could not be retrieved after 12 retries`);
        }

        console.log(`✓ Audio URL (async): ${audioUrl}`);

      } else if (ttsData.detail) {
        throw new Error(`TTS API error: ${ttsData.detail}`);
      } else {
        throw new Error(`TTS returned unexpected JSON: ${jsonText.substring(0, 300)}`);
      }
    } else {
      // ── Binary audio — upload to get a public URL ────────────────
      console.log(`🎙 Got binary audio (${audioBytes.length} bytes), uploading...`);

      // Calculate duration from file size (128kbps MP3 = 16,000 bytes/sec)
      voiceoverDuration = audioBytes.length / 16000;
      console.log(`🎙 Duration from size: ${voiceoverDuration.toFixed(1)}s`);

      const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
        file: new File([audioBlob], 'voiceover.mp3', { type: 'audio/mpeg' })
      });
      audioUrl = uploadResult.file_url;
      console.log(`✓ Audio uploaded: ${audioUrl}`);
    }

    // ── Calculate duration if still unknown ─────────────────────────
    if (!voiceoverDuration && audioUrl) {
      voiceoverDuration = await calculateAudioDuration(audioUrl, wordCount);
    }

    if (!voiceoverDuration) {
      voiceoverDuration = (wordCount / 150) * 60;
      console.log(`⚠ Duration estimated from word count: ${voiceoverDuration.toFixed(1)}s`);
    }

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

    if (ttsData.task_id) settingsPayload.generation_task_id = ttsData.task_id;

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