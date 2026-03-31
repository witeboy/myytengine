import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, PutObjectCommand, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

// ══════════════════════════════════════════════════════════════════
// INWORLD AI TTS — Chunked voiceover generation (v2)
//
// Inworld API: POST https://api.inworld.ai/tts/v1/voice
// Auth: Basic <INWORLD_API_KEY>
// Limit: 2000 chars per request → chunk at 1500 chars
// Returns: base64 audio (WAV) synchronously
//
// Actions:
//   start   → chunk script, save metadata, process first batch
//   process → process next batch of chunks
//   status  → return progress
//
// Frontend calls start once, then process every 3-5 seconds until done.
// ══════════════════════════════════════════════════════════════════

const CHUNK_SIZE = 1500;
const CHUNKS_PER_CALL = 3; // process 3 chunks per function call to stay within Deno limits
const DELAY_BETWEEN_CHUNKS = 200; // ms between API calls to avoid rate limiting

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${(Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: (Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '').trim(),
      secretAccessKey: (Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '').trim(),
    },
  });
}

function getR2Bucket() {
  return (Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '').trim();
}

function getR2PublicUrl() {
  return (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');
}

async function uploadToR2(audioBytes, fileName) {
  const r2 = getR2Client();
  await r2.send(new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: fileName,
    Body: audioBytes,
    ContentType: 'audio/wav',
  }));
  return `${getR2PublicUrl()}/${fileName}`;
}

async function downloadFromR2(key) {
  const r2 = getR2Client();
  const res = await r2.send(new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }));
  return new Uint8Array(await res.Body.transformToByteArray());
}

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

function chunkText(text, maxLen = CHUNK_SIZE) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Find a good break point: sentence end, then paragraph, then word
    let breakAt = -1;

    // Try sentence break (. ! ?) within range
    for (let i = maxLen; i >= maxLen * 0.5; i--) {
      if ('.!?'.includes(remaining[i]) && (i + 1 >= remaining.length || remaining[i + 1] === ' ' || remaining[i + 1] === '\n')) {
        breakAt = i + 1;
        break;
      }
    }

    // Try newline break
    if (breakAt === -1) {
      for (let i = maxLen; i >= maxLen * 0.5; i--) {
        if (remaining[i] === '\n') {
          breakAt = i + 1;
          break;
        }
      }
    }

    // Try space break
    if (breakAt === -1) {
      for (let i = maxLen; i >= maxLen * 0.5; i--) {
        if (remaining[i] === ' ') {
          breakAt = i + 1;
          break;
        }
      }
    }

    // Hard cut as last resort
    if (breakAt === -1) breakAt = maxLen;

    chunks.push(remaining.substring(0, breakAt).trim());
    remaining = remaining.substring(breakAt).trim();
  }

  return chunks.filter(c => c.length > 0);
}

async function synthesizeChunk(text, voiceId, apiKey, modelId = 'inworld-tts-1.5-mini') {
  const res = await fetch('https://api.inworld.ai/tts/v1/voice', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voiceId,
      modelId,
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: 22050,
      },
      temperature: 1.0,
      applyTextNormalization: 'ON',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Inworld API ${res.status}: ${errText.substring(0, 200)}`);
  }

  const data = await res.json();

  if (!data.audioContent) {
    throw new Error('Inworld returned no audioContent');
  }

  // Decode base64 to bytes
  const binaryString = atob(data.audioContent);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, voice_id, action, model_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const INWORLD_KEY = Deno.env.get('INWORLD_API_KEY');
    if (!INWORLD_KEY) return Response.json({ error: 'INWORLD_API_KEY not configured' }, { status: 500 });

    const settingsList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    let settings = settingsList[0];

    // ════════════════════════════════════════════════════════════
    // ACTION: start — chunk script, save metadata, process first batch
    // ════════════════════════════════════════════════════════════
    if (action === 'start') {
      if (!voice_id) return Response.json({ error: 'Missing voice_id' }, { status: 400 });

      // Load script
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
      const chunks = chunkText(cleanedText);

      console.log(`🎙 Inworld: ${cleanedText.length} chars → ${chunks.length} chunks, voice=${voice_id}`);

      // Build chunk metadata (no text stored — re-chunk from script each time)
      const chunkMeta = chunks.map((_, i) => ({
        index: i,
        status: 'pending', // pending | done | failed
        r2_key: null,
        error: null,
      }));

      // Save initial state
      const payload = {
        project_id,
        selected_voice_id: voice_id,
        voiceover_status: 'generating',
        generation_task_id: `inworld:${Date.now()}`,
        voiceover_url: '',
        voiceover_chunks: JSON.stringify(chunkMeta),
        voiceover_total_chunks: chunks.length,
        voiceover_completed_chunks: 0,
      };

      if (settings) {
        await base44.asServiceRole.entities.ProductionSettings.update(settings.id, payload);
      } else {
        settings = await base44.asServiceRole.entities.ProductionSettings.create(payload);
      }

      return Response.json({
        success: true,
        status: 'generating',
        chunks_total: chunks.length,
        chunks_completed: 0,
        provider: 'inworld',
        instant: false,
      });
    }

    // ════════════════════════════════════════════════════════════
    // ACTION: process — process next batch of chunks
    // ════════════════════════════════════════════════════════════
    if (action === 'process') {
      if (!settings) return Response.json({ error: 'No production settings' }, { status: 404 });
      if (!settings.generation_task_id?.startsWith('inworld:')) {
        return Response.json({ error: 'No active Inworld task' }, { status: 400 });
      }

      let chunkMeta;
      try { chunkMeta = JSON.parse(settings.voiceover_chunks || '[]'); } catch { chunkMeta = []; }

      if (chunkMeta.length === 0) return Response.json({ error: 'No chunk metadata' }, { status: 400 });

      // Re-chunk script to get text for each chunk
      const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
      const script = allScripts.find(s => s.version === 'final_aggregated');
      if (!script?.full_script) return Response.json({ error: 'Script not found' }, { status: 400 });

      const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
      const project = projects[0];
      const isSleepMode = project?.project_mode === 'sleep_meditation' || project?.project_mode === 'sleep_story';
      const cleanedText = cleanScript(script.full_script, isSleepMode);
      const textChunks = chunkText(cleanedText);

      const voiceId = settings.selected_voice_id;
      const selectedModel = model_id || 'inworld-tts-1.5-mini';

      // Find next pending chunks
      const pendingIndices = chunkMeta
        .filter(c => c.status === 'pending')
        .map(c => c.index)
        .slice(0, CHUNKS_PER_CALL);

      if (pendingIndices.length === 0) {
        // All chunks processed — check if we need to concatenate
        const doneChunks = chunkMeta.filter(c => c.status === 'done');
        const failedChunks = chunkMeta.filter(c => c.status === 'failed');

        if (doneChunks.length === 0) {
          await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
          return Response.json({ status: 'failed', error: 'All chunks failed' });
        }

        // Concatenate all chunk audio files
        console.log(`🔗 Concatenating ${doneChunks.length} chunks...`);

        try {
          const sortedChunks = doneChunks.sort((a, b) => a.index - b.index);
          const audioBuffers = [];

          for (const chunk of sortedChunks) {
            const bytes = await downloadFromR2(chunk.r2_key);
            // Skip WAV header (44 bytes) for all chunks except the first
            if (audioBuffers.length === 0) {
              audioBuffers.push(bytes); // keep header from first chunk
            } else {
              audioBuffers.push(bytes.slice(44)); // skip header for subsequent chunks
            }
          }

          // Combine all buffers
          const totalSize = audioBuffers.reduce((s, b) => s + b.length, 0);
          const combined = new Uint8Array(totalSize);
          let offset = 0;
          for (const buf of audioBuffers) {
            combined.set(buf, offset);
            offset += buf.length;
          }

          // Fix WAV header with correct file size
          if (combined.length > 44) {
            const dataView = new DataView(combined.buffer);
            dataView.setUint32(4, combined.length - 8, true); // ChunkSize
            dataView.setUint32(40, combined.length - 44, true); // Subchunk2Size
          }

          // Upload final concatenated file
          const finalKey = `voiceover/${project_id}_inworld_${Date.now()}.wav`;
          const voiceoverUrl = await uploadToR2(combined, finalKey);

          console.log(`✅ Inworld done: ${(combined.length / 1024 / 1024).toFixed(1)} MB → ${voiceoverUrl}`);

          await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
            voiceover_url: voiceoverUrl,
            voiceover_status: 'completed',
          });
          try { await base44.asServiceRole.entities.Projects.update(project_id, { voiceover_url: voiceoverUrl }); } catch (e) {}

          return Response.json({
            status: 'ready',
            voiceover_url: voiceoverUrl,
            chunks_completed: doneChunks.length,
            chunks_failed: failedChunks.length,
            chunks_total: chunkMeta.length,
          });

        } catch (concatErr) {
          console.error('Concatenation failed:', concatErr.message);
          // Fallback: use first chunk as voiceover
          const firstDone = doneChunks.sort((a, b) => a.index - b.index)[0];
          const fallbackUrl = `${getR2PublicUrl()}/${firstDone.r2_key}`;
          await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
            voiceover_url: fallbackUrl,
            voiceover_status: 'completed',
          });
          return Response.json({ status: 'ready', voiceover_url: fallbackUrl, concatenated: false });
        }
      }

      // Process this batch
      let newCompleted = 0;
      let newFailed = 0;

      for (const idx of pendingIndices) {
        const chunkText = textChunks[idx];
        if (!chunkText) {
          chunkMeta[idx].status = 'failed';
          chunkMeta[idx].error = 'Chunk text missing';
          newFailed++;
          continue;
        }

        try {
          console.log(`🔊 Chunk ${idx + 1}/${chunkMeta.length}: ${chunkText.length} chars`);

          const audioBytes = await synthesizeChunk(chunkText, voiceId, INWORLD_KEY, selectedModel);

          // Upload chunk audio to R2
          const chunkKey = `voiceover/chunks/${project_id}_inworld_${idx}.wav`;
          await uploadToR2(audioBytes, chunkKey);

          chunkMeta[idx].status = 'done';
          chunkMeta[idx].r2_key = chunkKey;
          newCompleted++;

          // Delay between chunks to avoid rate limiting
          if (pendingIndices.indexOf(idx) < pendingIndices.length - 1) {
            await sleep(DELAY_BETWEEN_CHUNKS);
          }

        } catch (err) {
          console.warn(`❌ Chunk ${idx + 1} failed: ${err.message}`);
          chunkMeta[idx].status = 'failed';
          chunkMeta[idx].error = err.message.substring(0, 100);
          newFailed++;
        }
      }

      // Update progress
      const completedTotal = chunkMeta.filter(c => c.status === 'done').length;
      const failedTotal = chunkMeta.filter(c => c.status === 'failed').length;
      const pendingTotal = chunkMeta.filter(c => c.status === 'pending').length;

      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        voiceover_chunks: JSON.stringify(chunkMeta),
        voiceover_completed_chunks: completedTotal,
      });

      console.log(`📊 Progress: ${completedTotal}/${chunkMeta.length} done, ${failedTotal} failed, ${pendingTotal} pending`);

      return Response.json({
        status: pendingTotal > 0 ? 'generating' : 'processing',
        chunks_completed: completedTotal,
        chunks_failed: failedTotal,
        chunks_pending: pendingTotal,
        chunks_total: chunkMeta.length,
        progress_percent: Math.round((completedTotal / chunkMeta.length) * 100),
      });
    }

    // ════════════════════════════════════════════════════════════
    // ACTION: status — just return current progress
    // ════════════════════════════════════════════════════════════
    if (action === 'status') {
      if (!settings) return Response.json({ status: 'idle' });

      if (settings.voiceover_status === 'completed' && settings.voiceover_url) {
        return Response.json({ status: 'ready', voiceover_url: settings.voiceover_url });
      }

      let chunkMeta;
      try { chunkMeta = JSON.parse(settings.voiceover_chunks || '[]'); } catch { chunkMeta = []; }

      const completed = chunkMeta.filter(c => c.status === 'done').length;
      const failed = chunkMeta.filter(c => c.status === 'failed').length;
      const pending = chunkMeta.filter(c => c.status === 'pending').length;

      return Response.json({
        status: settings.voiceover_status || 'idle',
        chunks_completed: completed,
        chunks_failed: failed,
        chunks_pending: pending,
        chunks_total: chunkMeta.length,
        progress_percent: chunkMeta.length > 0 ? Math.round((completed / chunkMeta.length) * 100) : 0,
      });
    }

    return Response.json({ error: 'Invalid action. Use start, process, or status.' }, { status: 400 });

  } catch (error) {
    console.error(`❌ inworldVoiceover: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});