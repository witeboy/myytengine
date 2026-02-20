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
async function pollVoiceoverTask(apiKey, taskId, maxWaitMs = 180000) {
  const pollInterval = 3000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollInterval));

    try {
      const res = await fetch(`https://api.ai33.pro/v1/tasks/${taskId}`, {
        headers: { 'xi-api-key': apiKey }
      });

      if (!res.ok) {
        console.warn(`Poll ${taskId}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const status = data.status || data.state;

      console.log(`Poll ${taskId}: ${status}`);

      if (status === 'completed' || status === 'success' || status === 'done') {
        return data;
      }

      if (status === 'failed' || status === 'error') {
        throw new Error(`TTS task failed: ${data.error || data.message || 'Unknown'}`);
      }
    } catch (pollErr) {
      if (pollErr.message.includes('TTS task failed')) throw pollErr;
      console.warn(`Poll error (retrying): ${pollErr.message}`);
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

    const ttsData = await ttsResponse.json();
    console.log(`🎙 TTS response keys: ${Object.keys(ttsData).join(', ')}`);

    // ── Determine audio URL and duration ───────────────────────────
    // ai33.pro may return audio directly OR as an async task
    let audioUrl = null;
    let voiceoverDuration = null;

    if (ttsData.audio_url || ttsData.url || ttsData.output_url) {
      // Synchronous response — audio ready immediately
      audioUrl = ttsData.audio_url || ttsData.url || ttsData.output_url;
      console.log(`✓ Audio URL (sync): ${audioUrl}`);

    } else if (ttsData.task_id) {
      // Async response — poll for completion
      console.log(`⏳ Polling task: ${ttsData.task_id}`);
      const result = await pollVoiceoverTask(API_KEY, ttsData.task_id);
      audioUrl = result.audio_url || result.url || result.output_url || result.result?.url;

      // Check if API returned duration
      voiceoverDuration = result.duration_seconds || result.duration || result.audio_duration;

      if (!audioUrl) {
        // Try nested result structures
        const resultData = result.result || result.data || result.output || {};
        audioUrl = resultData.audio_url || resultData.url || resultData.output_url;
      }

      if (!audioUrl) {
        throw new Error('TTS completed but no audio URL found in response');
      }
      console.log(`✓ Audio URL (async): ${audioUrl}`);
    } else {
      throw new Error('TTS API returned no audio_url or task_id');
    }

    // ── Check for duration in direct response ──────────────────────
    if (!voiceoverDuration) {
      voiceoverDuration = ttsData.duration_seconds || ttsData.duration || ttsData.audio_duration;
    }

    // ── Check for duration from transcript timestamps ──────────────
    if (!voiceoverDuration && ttsData.transcript) {
      const transcript = typeof ttsData.transcript === 'string'
        ? JSON.parse(ttsData.transcript)
        : ttsData.transcript;

      if (transcript.duration_seconds) {
        voiceoverDuration = transcript.duration_seconds;
      } else if (transcript.words?.length > 0) {
        // Get end time of last word
        const lastWord = transcript.words[transcript.words.length - 1];
        voiceoverDuration = lastWord.end || lastWord.end_time || lastWord.offset_end;
      }
    }

    // ── Calculate duration from audio file if still unknown ────────
    if (!voiceoverDuration && audioUrl) {
      voiceoverDuration = await calculateAudioDuration(audioUrl, wordCount);
    }

    // ── Last resort: estimate from word count ──────────────────────
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