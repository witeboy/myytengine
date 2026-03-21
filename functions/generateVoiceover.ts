import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// VOICEOVER GENERATOR — One chunk per call
//
// How it works:
// 1. First call (no chunks exist): chunks the script, saves metadata,
//    submits chunk 0 to AI33
// 2. Subsequent calls: finds next pending chunk, submits it
// 3. Frontend calls this every 5s until done=true
// 4. Then frontend switches to polling via pollVoiceover
// ══════════════════════════════════════════════════════════════════

const MAX_WORDS_PER_CHUNK = 1200;
const MAX_CHARS_PER_CHUNK = 7000;

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

function chunkText(text) {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const chunks = [];
  let currentChunk = '';
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).filter(w => w.length > 0).length;
    const paraChars = para.length;

    if (currentChunk && (
      currentWordCount + paraWords > MAX_WORDS_PER_CHUNK ||
      currentChunk.length + paraChars > MAX_CHARS_PER_CHUNK
    )) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
      currentWordCount = 0;
    }

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
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, voice_id, reset } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const AI33_KEY = Deno.env.get('AI33_API_KEY');
    if (!AI33_KEY) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    // ── Load settings ───────────────────────────────────────────
    const settingsList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    let settings = settingsList[0];

    // ── Try to load existing chunks ─────────────────────────────
    let chunks = [];
    let isResume = false;

    if (settings?.voiceover_chunks && settings.voiceover_status === 'generating') {
      try {
        const parsed = JSON.parse(settings.voiceover_chunks);
        // Only resume if there are valid pending chunks with text
        const hasPending = parsed.some(c => c.status === 'pending' && c.text);
        if (false) {
          chunks = parsed;
          isResume = true;
          console.log(`🔄 Resuming: ${chunks.filter(c => c.status === 'pending').length} pending chunks`);
        }
      } catch (e) {}
    }

    // ── Fresh start: chunk the script ───────────────────────────
    if (chunks.length === 0 || !isResume) {
      const [projects, allScripts] = await Promise.all([
        base44.asServiceRole.entities.Projects.filter({ id: project_id }),
        base44.asServiceRole.entities.Scripts.filter({ project_id }),
      ]);
      const project = projects[0];
      if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

      const script = allScripts.find(s => s.version === 'final_aggregated');
      if (!script?.full_script) return Response.json({ error: 'No final_aggregated script found.' }, { status: 400 });

      const isSleepMode = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';
      const cleanedText = cleanScript(script.full_script, isSleepMode);
      const totalWordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;

      const defaultVoice = isSleepMode ? 'English_calm_female' : 'English_expressive_narrator';
      const selectedVoiceId = voice_id || settings?.selected_voice_id || defaultVoice;

      const textChunks = chunkText(cleanedText);

      chunks = textChunks.map((text, i) => ({
        index: i,
        task_id: null,
        word_count: text.split(/\s+/).filter(w => w.length > 0).length,
        char_count: text.length,
        status: 'pending',
      }));

      // Store texts separately in memory — NOT in DB
      chunks._texts = textChunks;

      console.log(`🎙 Fresh start: ${totalWordCount} words → ${chunks.length} chunks, voice=${selectedVoiceId}`);

      // Save fresh chunks + reset all voiceover state
      const payload = {
        project_id,
        selected_voice_id: selectedVoiceId,
        voiceover_status: 'generating',
        voiceover_chunks: JSON.stringify(chunks),
        voiceover_total_chunks: chunks.length,
        voiceover_completed_chunks: 0,
        generation_task_id: '',
        voiceover_url: '',
      };

      if (settings) {
        await base44.asServiceRole.entities.ProductionSettings.update(settings.id, payload);
      } else {
        await base44.asServiceRole.entities.ProductionSettings.create(payload);
        settings = (await base44.asServiceRole.entities.ProductionSettings.filter({ project_id }))[0];
      }
    }

    // ── Find next pending chunk ─────────────────────────────────
    const nextChunk = chunks.find(c => c.status === 'pending');
    if (!nextChunk) {
      const submitted = chunks.filter(c => c.task_id).length;
      const failed = chunks.filter(c => c.status === 'failed').length;
      return Response.json({
        success: true,
        done: true,
        all_submitted: true,
        total_chunks: chunks.length,
        submitted,
        failed,
      });
    }

    // ── Submit this one chunk to AI33 ───────────────────────────
    const selectedVoiceId = settings?.selected_voice_id || voice_id || 'English_expressive_narrator';
    const isElevenlabs = /^[a-zA-Z0-9]{20,}$/.test(selectedVoiceId);
    const provider = isElevenlabs ? 'elevenlabs' : 'minimax';

    let submitUrl, submitBody;
    if (provider === 'minimax') {
      submitUrl = 'https://api.ai33.pro/v1m/task/text-to-speech';
      submitBody = JSON.stringify({
        text: chunks._texts?.[nextChunk.index] || nextChunk.text,
        model: 'speech-2.6-hd',
        voice_setting: { voice_id: selectedVoiceId, vol: 1, pitch: 0, speed: 1 },
        language_boost: 'Auto',
      });
    } else {
      submitUrl = `https://api.ai33.pro/v1/text-to-speech/${selectedVoiceId}?output_format=mp3_44100_128`;
      submitBody = JSON.stringify({
        text: chunks._texts?.[nextChunk.index] || nextChunk.text,
        model_id: 'eleven_multilingual_v2',
      });
    }

    try {
      const submitRes = await fetch(submitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY },
        body: submitBody,
      });

      const submitData = await submitRes.json();

      if (submitData.success && submitData.task_id) {
        nextChunk.task_id = submitData.task_id;
        nextChunk.status = 'submitted';
        // Remove text from submitted chunk to save DB space
        delete nextChunk.text;
        console.log(`  ✅ Chunk ${nextChunk.index + 1}/${chunks.length}: → ${submitData.task_id}`);
      } else {
        nextChunk.status = 'failed';
        nextChunk.error = JSON.stringify(submitData).substring(0, 200);
        delete nextChunk.text;
        console.error(`  ❌ Chunk ${nextChunk.index + 1}: ${nextChunk.error}`);
      }
    } catch (err) {
      nextChunk.status = 'failed';
      nextChunk.error = err.message;
      delete nextChunk.text;
      console.error(`  ❌ Chunk ${nextChunk.index + 1}: ${err.message}`);
    }

    // ── Save updated chunks ─────────────────────────────────────
    await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
      voiceover_chunks: JSON.stringify(chunks),
    });

    const remaining = chunks.filter(c => c.status === 'pending').length;
    const submitted = chunks.filter(c => c.task_id).length;
    const failed = chunks.filter(c => c.status === 'failed').length;

    return Response.json({
      success: true,
      done: remaining === 0,
      chunk_index: nextChunk.index,
      remaining,
      submitted,
      failed,
      total_chunks: chunks.length,
    });

  } catch (error) {
    console.error(`❌ generateVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});