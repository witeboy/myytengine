import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// POLL VOICEOVER — Chunked polling + MP3 concatenation
// Polls all chunk task_ids, and when all are done, fetches each
// audio file, concatenates the MP3 bytes, uploads the result.
// ══════════════════════════════════════════════════════════════════

async function pollAI33Task(taskId, apiKey) {
  const pollUrl = `https://api.ai33.pro/v1m/task/fetch?task_id=${taskId}`;
  const res = await fetch(pollUrl, {
    headers: { 'xi-api-key': apiKey },
  });
  return await res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const AI33_KEY = Deno.env.get('AI33_API_KEY');
    if (!AI33_KEY) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    // Load settings
    const settingsList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const settings = settingsList[0];
    if (!settings) return Response.json({ error: 'No production settings found' }, { status: 404 });

    // ── Parse chunk metadata ────────────────────────────────────
    let chunks = [];
    try {
      chunks = JSON.parse(settings.voiceover_chunks || '[]');
    } catch (e) {
      // Backwards compat: single task_id (non-chunked)
      if (settings.generation_task_id) {
        chunks = [{
          index: 0,
          task_id: settings.generation_task_id,
          status: 'submitted',
        }];
      }
    }

    if (chunks.length === 0) {
      return Response.json({ error: 'No voiceover tasks to poll' }, { status: 400 });
    }

    // ── Poll each pending chunk ─────────────────────────────────
    let completedCount = 0;
    let failedCount = 0;
    let stillGenerating = 0;
    let updated = false;

    for (const chunk of chunks) {
      if (!chunk.task_id) {
        failedCount++;
        continue;
      }

      if (chunk.status === 'done') {
        completedCount++;
        continue;
      }

      if (chunk.status === 'failed' && !chunk.task_id) {
        failedCount++;
        continue;
      }

      // Poll this chunk
      try {
        const pollResult = await pollAI33Task(chunk.task_id, AI33_KEY);

        if (pollResult.status === 'Success' || pollResult.status === 'success') {
          // Task completed — extract audio URL
          const audioUrl = pollResult.audio_url || pollResult.file?.url || pollResult.data?.audio_url || pollResult.url;
          if (audioUrl) {
            chunk.status = 'done';
            chunk.audio_url = audioUrl;
            completedCount++;
            updated = true;
            console.log(`  ✅ Chunk ${chunk.index + 1}: done → ${audioUrl.substring(0, 60)}`);
          } else {
            // Success but no URL — try extracting from nested structures
            const jsonStr = JSON.stringify(pollResult);
            const urlMatch = jsonStr.match(/https?:\/\/[^"]+\.mp3[^"]*/);
            if (urlMatch) {
              chunk.status = 'done';
              chunk.audio_url = urlMatch[0];
              completedCount++;
              updated = true;
            } else {
              console.warn(`  ⚠ Chunk ${chunk.index + 1}: Success but no audio URL in response`);
              stillGenerating++;
            }
          }
        } else if (pollResult.status === 'Failed' || pollResult.status === 'failed' || pollResult.error) {
          chunk.status = 'failed';
          chunk.error = pollResult.error || pollResult.message || 'TTS generation failed';
          failedCount++;
          updated = true;
          console.log(`  ❌ Chunk ${chunk.index + 1}: failed — ${chunk.error}`);
        } else {
          // Still processing
          stillGenerating++;
        }
      } catch (err) {
        console.warn(`  ⚠ Chunk ${chunk.index + 1} poll error: ${err.message}`);
        stillGenerating++;
      }
    }

    const totalChunks = chunks.length;
    const allDone = completedCount + failedCount >= totalChunks;
    const allCompleted = completedCount === totalChunks;

    console.log(`📊 Poll: ${completedCount}/${totalChunks} done, ${failedCount} failed, ${stillGenerating} generating`);

    // ── Save updated chunk statuses ─────────────────────────────
    if (updated) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        voiceover_chunks: JSON.stringify(chunks),
        voiceover_completed_chunks: completedCount,
      });
    }

    // ── If all chunks are done, concatenate audio ───────────────
    if (allDone && completedCount > 0) {
      const doneChunks = chunks
        .filter(c => c.status === 'done' && c.audio_url)
        .sort((a, b) => a.index - b.index);

      if (doneChunks.length === 1) {
        // Single chunk — no concatenation needed
        const voiceoverUrl = doneChunks[0].audio_url;
        await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
          voiceover_url: voiceoverUrl,
          voiceover_status: 'completed',
        });

        // Also update project
        const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
        if (projects[0]) {
          await base44.asServiceRole.entities.Projects.update(project_id, {
            voiceover_url: voiceoverUrl,
          });
        }

        return Response.json({
          status: 'ready',
          voiceover_url: voiceoverUrl,
          chunks_completed: completedCount,
          chunks_total: totalChunks,
        });

      } else if (doneChunks.length > 1) {
        // Multiple chunks — concatenate MP3 bytes
        console.log(`🔗 Concatenating ${doneChunks.length} audio chunks...`);

        try {
          const audioBuffers = [];
          for (const chunk of doneChunks) {
            const res = await fetch(chunk.audio_url);
            if (!res.ok) {
              console.warn(`  ⚠ Fetch chunk ${chunk.index} failed: ${res.status}`);
              continue;
            }
            const buf = await res.arrayBuffer();
            audioBuffers.push(new Uint8Array(buf));
            console.log(`  📥 Chunk ${chunk.index + 1}: ${(buf.byteLength / 1024).toFixed(0)} KB`);
          }

          if (audioBuffers.length === 0) {
            throw new Error('No audio chunks could be fetched');
          }

          // Concatenate all MP3 buffers
          const totalSize = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);
          const concatenated = new Uint8Array(totalSize);
          let offset = 0;
          for (const buf of audioBuffers) {
            concatenated.set(buf, offset);
            offset += buf.length;
          }

          console.log(`  📦 Concatenated: ${(totalSize / (1024 * 1024)).toFixed(1)} MB total`);

          // Upload concatenated audio to Base44 storage
          const blob = new Blob([concatenated], { type: 'audio/mpeg' });
          const formData = new FormData();
          formData.append('file', blob, `voiceover_${project_id}.mp3`);

          // Use Base44's file upload
          const uploadResult = await base44.asServiceRole.storage.upload(blob, `voiceover_${project_id}.mp3`);
          const voiceoverUrl = uploadResult?.url || uploadResult;

          if (!voiceoverUrl || typeof voiceoverUrl !== 'string') {
            throw new Error('Upload returned no URL');
          }

          console.log(`  ✅ Uploaded concatenated voiceover: ${voiceoverUrl.substring(0, 80)}`);

          // Save final URL
          await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
            voiceover_url: voiceoverUrl,
            voiceover_status: 'completed',
          });

          const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
          if (projects[0]) {
            await base44.asServiceRole.entities.Projects.update(project_id, {
              voiceover_url: voiceoverUrl,
            });
          }

          return Response.json({
            status: 'ready',
            voiceover_url: voiceoverUrl,
            chunks_completed: completedCount,
            chunks_total: totalChunks,
            concatenated: true,
            file_size_mb: (totalSize / (1024 * 1024)).toFixed(1),
          });

        } catch (concatErr) {
          console.error(`❌ Concatenation failed: ${concatErr.message}`);

          // Fallback: just return the first chunk's URL so user gets something
          const fallbackUrl = doneChunks[0].audio_url;
          await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
            voiceover_url: fallbackUrl,
            voiceover_status: 'completed',
          });

          return Response.json({
            status: 'ready',
            voiceover_url: fallbackUrl,
            chunks_completed: completedCount,
            chunks_total: totalChunks,
            concatenated: false,
            concat_error: concatErr.message,
            chunk_urls: doneChunks.map(c => c.audio_url),
          });
        }
      }
    }

    // ── Still generating ────────────────────────────────────────
    if (failedCount > 0 && completedCount === 0 && stillGenerating === 0) {
      return Response.json({
        status: 'failed',
        error: 'All voiceover chunks failed to generate',
        chunks_completed: 0,
        chunks_total: totalChunks,
      });
    }

    return Response.json({
      status: 'generating',
      chunks_completed: completedCount,
      chunks_failed: failedCount,
      chunks_generating: stillGenerating,
      chunks_total: totalChunks,
      progress_percent: Math.round((completedCount / totalChunks) * 100),
    });

  } catch (error) {
    console.error(`❌ pollVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});