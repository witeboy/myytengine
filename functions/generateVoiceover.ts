import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// VOICEOVER GENERATOR — Chunked Submit
// Splits long scripts into ~800-word chunks, submits each as a
// separate TTS task to AI33, stores all task_ids for polling.
// ══════════════════════════════════════════════════════════════════

const MAX_WORDS_PER_CHUNK = 800;   // ~5 min of speech per chunk
const MAX_CHARS_PER_CHUNK = 4500;  // MiniMax safe limit

function cleanScript(text, isSleepMode = false) {
  let cleaned = text;
  if (isSleepMode) {
    cleaned = cleaned.replace(/\[(PAUSE\s+(\d+)\s*(?:SEC(?:ONDS?)?)?)\]/gi, (_, _c, seconds) => {
      const sec = parseInt(seconds) || 3;
      const groups = Math.ceil(sec / 3);
      return ' ' + Array(groups).fill('... ... ...').join(' ') + ' ';
    });
    cleaned = cleaned.replace(/\[BREATHE\]/gi, ' ... ... ... ... ');
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

/**
 * Split cleaned text into chunks of ~MAX_WORDS_PER_CHUNK words,
 * breaking at sentence boundaries to avoid cutting mid-sentence.
 */
function chunkText(text) {
  // Split into paragraphs first
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const chunks = [];
  let currentChunk = '';
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).filter(w => w.length > 0).length;
    const paraChars = para.length;

    // If adding this paragraph would exceed limits, flush current chunk
    if (currentChunk && (
      currentWordCount + paraWords > MAX_WORDS_PER_CHUNK ||
      currentChunk.length + paraChars > MAX_CHARS_PER_CHUNK
    )) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
      currentWordCount = 0;
    }

    // If a single paragraph is too long, split it by sentences
    if (paraWords > MAX_WORDS_PER_CHUNK || paraChars > MAX_CHARS_PER_CHUNK) {
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const sentWords = sentence.split(/\s+/).filter(w => w.length > 0).length;
        if (currentWordCount + sentWords > MAX_WORDS_PER_CHUNK ||
            currentChunk.length + sentence.length > MAX_CHARS_PER_CHUNK) {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
            currentWordCount = 0;
          }
        }
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentWordCount += sentWords;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
      currentWordCount += paraWords;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function submitTTSTask(text, voiceId, provider, apiKey) {
  let submitUrl, submitBody;

  if (provider === 'minimax') {
    submitUrl = 'https://api.ai33.pro/v1m/task/text-to-speech';
    submitBody = JSON.stringify({
      text,
      model: 'speech-2.6-hd',
      voice_setting: { voice_id: voiceId, vol: 1, pitch: 0, speed: 1 },
      language_boost: 'Auto',
    });
  } else {
    submitUrl = `https://api.ai33.pro/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
    submitBody = JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
    });
  }

  const res = await fetch(submitUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: submitBody,
  });

  const data = await res.json();

  if (!data.success || !data.task_id) {
    throw new Error(`AI33 submit failed: ${JSON.stringify(data).substring(0, 200)}`);
  }

  return data.task_id;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, voice_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const AI33_KEY = Deno.env.get('AI33_API_KEY');
    if (!AI33_KEY) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    // Fetch project & script
    const [projects, allScripts] = await Promise.all([
      base44.asServiceRole.entities.Projects.filter({ id: project_id }),
      base44.asServiceRole.entities.Scripts.filter({ project_id }),
    ]);
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final_aggregated script found.' }, { status: 400 });
    }

    const isSleepMode = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';
    const cleanedText = cleanScript(script.full_script, isSleepMode);
    const totalWordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;

    const defaultVoice = isSleepMode ? 'English_calm_female' : 'English_expressive_narrator';
    const selectedVoiceId = voice_id || defaultVoice;

    const isElevenlabs = /^[a-zA-Z0-9]{20,}$/.test(selectedVoiceId);
    const provider = isElevenlabs ? 'elevenlabs' : 'minimax';

    // ── Chunk the text ──────────────────────────────────────────
    const chunks = chunkText(cleanedText);
    const totalChunks = chunks.length;

    console.log(`🎙 Voiceover: ${totalWordCount} words → ${totalChunks} chunks, voice=${selectedVoiceId}, provider=${provider}`);

    // ── Submit all chunks ───────────────────────────────────────
    const taskIds = [];
    const chunkMeta = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkWords = chunk.split(/\s+/).filter(w => w.length > 0).length;

      try {
        const taskId = await submitTTSTask(chunk, selectedVoiceId, provider, AI33_KEY);
        taskIds.push(taskId);
        chunkMeta.push({
          index: i,
          task_id: taskId,
          word_count: chunkWords,
          char_count: chunk.length,
          status: 'submitted',
        });
        console.log(`  ✅ Chunk ${i + 1}/${totalChunks}: ${chunkWords} words → task ${taskId}`);
      } catch (err) {
        console.error(`  ❌ Chunk ${i + 1}/${totalChunks} failed: ${err.message}`);
        chunkMeta.push({
          index: i,
          task_id: null,
          word_count: chunkWords,
          char_count: chunk.length,
          status: 'failed',
          error: err.message,
        });
      }

      // Brief delay between submits to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const submittedCount = taskIds.length;
    const failedCount = chunkMeta.filter(c => c.status === 'failed').length;

    if (submittedCount === 0) {
      throw new Error('All chunks failed to submit');
    }

    // ── Save settings with all task IDs ─────────────────────────
    const settingsList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const settingsPayload = {
      project_id,
      selected_voice_id: selectedVoiceId,
      voiceover_status: 'generating',
      generation_task_id: taskIds[0],  // Primary task ID (backwards compat)
      voiceover_chunks: JSON.stringify(chunkMeta),
      voiceover_total_chunks: totalChunks,
      voiceover_completed_chunks: 0,
    };

    if (settingsList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(settingsList[0].id, settingsPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create(settingsPayload);
    }

    return Response.json({
      success: true,
      total_chunks: totalChunks,
      submitted: submittedCount,
      failed: failedCount,
      task_ids: taskIds,
      word_count: totalWordCount,
      status: 'generating',
    });

  } catch (error) {
    console.error(`❌ generateVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});