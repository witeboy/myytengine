import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// POLL VOICEOVER — Handles all AI33 response formats
//
// AI33 can return:
// 1. JSON with status + audio_url  (normal)
// 2. Raw MP3 binary bytes          (some endpoints)
// 3. 404 text                      (invalid task_id)
//
// When all chunks done: concatenates MP3s, uploads final file.
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const AI33_KEY = Deno.env.get('AI33_API_KEY');
    if (!AI33_KEY) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    // ── Load settings ───────────────────────────────────────────
    const settingsList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const settings = settingsList[0];
    if (!settings) return Response.json({ error: 'No production settings' }, { status: 404 });

    // ── Parse chunks ────────────────────────────────────────────
    let chunks = [];
    try {
      chunks = JSON.parse(settings.voiceover_chunks || '[]');
    } catch (e) {
      // Backwards compat: single task
      if (settings.generation_task_id) {
        chunks = [{ index: 0, task_id: settings.generation_task_id, status: 'submitted' }];
      }
    }

    if (chunks.length === 0) {
      return Response.json({ error: 'No voiceover tasks to poll' }, { status: 400 });
    }

    // ── Poll each submitted chunk (max 3 per call to avoid timeout) ─
    let completedCount = 0;
    let failedCount = 0;
    let stillGenerating = 0;
    let pendingCount = 0;
    let updated = false;
    let pollsThisCall = 0;
    const MAX_POLLS_PER_CALL = 3;

    for (const chunk of chunks) {
      // Count already-resolved chunks
      if (chunk.status === 'done') { completedCount++; continue; }
      if (chunk.status === 'pending') { pendingCount++; continue; }
      if (chunk.status === 'failed') { failedCount++; continue; }

      // Skip if no task_id
      if (!chunk.task_id) { failedCount++; chunk.status = 'failed'; updated = true; continue; }

      // Limit polls per call to avoid Deno timeout
      if (pollsThisCall >= MAX_POLLS_PER_CALL) {
        stillGenerating++;
        continue;
      }
      pollsThisCall++;

      // ── Poll AI33 ──────────────────────────────────────────
      try {
        const pollUrl = `https://api.ai33.pro/v1m/task/fetch?task_id=${chunk.task_id}`;
        const res = await fetch(pollUrl, {
          headers: { 'xi-api-key': AI33_KEY },
        });

        // Handle HTTP errors
        if (res.status === 404) {
          chunk.status = 'failed';
          chunk.error = 'Task not found (404)';
          failedCount++;
          updated = true;
          console.log(`  ❌ Chunk ${chunk.index + 1}: 404 — task not found`);
          continue;
        }

        if (!res.ok && res.status >= 500) {
          // Server error — don't mark as failed, retry next poll
          console.warn(`  ⚠ Chunk ${chunk.index + 1}: server error ${res.status}`);
          stillGenerating++;
          continue;
        }

        const contentType = res.headers.get('content-type') || '';

        // ── CASE 1: Binary audio response ────────────────────
        if (contentType.includes('audio/') || contentType.includes('octet-stream')) {
          try {
            const audioBytes = new Uint8Array(await res.arrayBuffer());
            if (audioBytes.length < 1000) {
              // Too small to be real audio — probably an error
              console.warn(`  ⚠ Chunk ${chunk.index + 1}: audio response too small (${audioBytes.length} bytes)`);
              stillGenerating++;
              continue;
            }
            console.log(`  📥 Chunk ${chunk.index + 1}: ${(audioBytes.length / 1024).toFixed(0)} KB audio`);

            const blob = new Blob([audioBytes], { type: 'audio/mpeg' });
            const uploadResult = await base44.asServiceRole.storage.upload(blob, `vo_chunk_${chunk.index}_${project_id}.mp3`);
            const uploadedUrl = uploadResult?.url || uploadResult;

            if (uploadedUrl && typeof uploadedUrl === 'string') {
              chunk.status = 'done';
              chunk.audio_url = uploadedUrl;
              completedCount++;
              updated = true;
              console.log(`  ✅ Chunk ${chunk.index + 1}: uploaded → ${uploadedUrl.substring(0, 60)}`);
            } else {
              console.warn(`  ⚠ Chunk ${chunk.index + 1}: upload returned no URL`);
              stillGenerating++;
            }
          } catch (uploadErr) {
            console.warn(`  ⚠ Chunk ${chunk.index + 1}: upload failed: ${uploadErr.message}`);
            stillGenerating++;
          }
          continue;
        }

        // ── CASE 2: Text/JSON response ───────────────────────
        const rawText = await res.text();

        // Check if it's binary disguised as text (MP3 starts with 0xFF 0xFB or "ID3")
        if (rawText.length > 500 && (
          rawText.charCodeAt(0) === 0xFF ||
          rawText.charCodeAt(0) === 0x49 ||
          rawText.startsWith('ID3')
        )) {
          // Re-fetch as binary
          try {
            const reFetch = await fetch(pollUrl, { headers: { 'xi-api-key': AI33_KEY } });
            const audioBytes = new Uint8Array(await reFetch.arrayBuffer());
            const blob = new Blob([audioBytes], { type: 'audio/mpeg' });
            const uploadResult = await base44.asServiceRole.storage.upload(blob, `vo_chunk_${chunk.index}_${project_id}.mp3`);
            const uploadedUrl = uploadResult?.url || uploadResult;
            if (uploadedUrl && typeof uploadedUrl === 'string') {
              chunk.status = 'done';
              chunk.audio_url = uploadedUrl;
              completedCount++;
              updated = true;
              console.log(`  ✅ Chunk ${chunk.index + 1}: binary-as-text → ${uploadedUrl.substring(0, 60)}`);
            } else {
              stillGenerating++;
            }
          } catch (e) {
            console.warn(`  ⚠ Chunk ${chunk.index + 1}: binary re-fetch failed: ${e.message}`);
            stillGenerating++;
          }
          continue;
        }

        // Parse as JSON
        let pollResult;
        try {
          pollResult = JSON.parse(rawText);
        } catch (e) {
          // Not JSON, not binary — probably an error page
          const preview = rawText.substring(0, 100).replace(/\n/g, ' ');
          console.warn(`  ⚠ Chunk ${chunk.index + 1}: unparseable: "${preview}"`);
          // If it says "not found" or "404", mark as failed
          if (rawText.toLowerCase().includes('not found') || rawText.includes('404')) {
            chunk.status = 'failed';
            chunk.error = 'Task not found';
            failedCount++;
            updated = true;
          } else {
            stillGenerating++;
          }
          continue;
        }

        // ── Parse JSON status ────────────────────────────────
        const status = (pollResult.status || '').toLowerCase();

        if (status === 'success' || status === 'completed' || status === 'done') {
          const audioUrl = pollResult.audio_url
            || pollResult.file?.url
            || pollResult.data?.audio_url
            || pollResult.url
            || pollResult.result?.url;

          if (audioUrl) {
            chunk.status = 'done';
            chunk.audio_url = audioUrl;
            completedCount++;
            updated = true;
            console.log(`  ✅ Chunk ${chunk.index + 1}: done → ${audioUrl.substring(0, 60)}`);
          } else {
            // Search entire response for an MP3 URL
            const jsonStr = JSON.stringify(pollResult);
            const urlMatch = jsonStr.match(/https?:\/\/[^"]+\.(mp3|wav|ogg)[^"]*/);
            if (urlMatch) {
              chunk.status = 'done';
              chunk.audio_url = urlMatch[0];
              completedCount++;
              updated = true;
              console.log(`  ✅ Chunk ${chunk.index + 1}: found URL → ${urlMatch[0].substring(0, 60)}`);
            } else {
              console.warn(`  ⚠ Chunk ${chunk.index + 1}: success but no audio URL in: ${jsonStr.substring(0, 200)}`);
              stillGenerating++;
            }
          }
        } else if (status === 'failed' || status === 'error') {
          chunk.status = 'failed';
          chunk.error = pollResult.error || pollResult.message || 'TTS failed';
          failedCount++;
          updated = true;
          console.log(`  ❌ Chunk ${chunk.index + 1}: ${chunk.error}`);
        } else {
          // Still processing
          stillGenerating++;
        }

      } catch (err) {
        console.warn(`  ⚠ Chunk ${chunk.index + 1} error: ${err.message}`);
        stillGenerating++;
      }
    }

    const totalChunks = chunks.length;
    const allResolved = completedCount + failedCount >= totalChunks && pendingCount === 0 && stillGenerating === 0;

    console.log(`📊 Poll: ${completedCount}/${totalChunks} done, ${failedCount} failed, ${stillGenerating} generating, ${pendingCount} pending`);

    // ── Save updated statuses ───────────────────────────────────
    if (updated) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        voiceover_chunks: JSON.stringify(chunks),
        voiceover_completed_chunks: completedCount,
      });
    }

    // ── All resolved → concatenate audio ────────────────────────
    if (allResolved && completedCount > 0) {
      const doneChunks = chunks
        .filter(c => c.status === 'done' && c.audio_url)
        .sort((a, b) => a.index - b.index);

      // Single chunk — no concatenation
      if (doneChunks.length === 1) {
        const voiceoverUrl = doneChunks[0].audio_url;
        await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
          voiceover_url: voiceoverUrl,
          voiceover_status: 'completed',
        });
        try {
          await base44.asServiceRole.entities.Projects.update(project_id, { voiceover_url: voiceoverUrl });
        } catch (e) {}

        return Response.json({
          status: 'ready',
          voiceover_url: voiceoverUrl,
          chunks_completed: completedCount,
          chunks_total: totalChunks,
        });
      }

      // Multiple chunks — concatenate MP3s
      if (doneChunks.length > 1) {
        console.log(`🔗 Concatenating ${doneChunks.length} chunks...`);

        try {
          const audioBuffers = [];
          for (const chunk of doneChunks) {
            try {
              const res = await fetch(chunk.audio_url);
              if (res.ok) {
                const buf = new Uint8Array(await res.arrayBuffer());
                audioBuffers.push(buf);
                console.log(`  📥 Chunk ${chunk.index + 1}: ${(buf.length / 1024).toFixed(0)} KB`);
              } else {
                console.warn(`  ⚠ Chunk ${chunk.index + 1}: fetch failed ${res.status}`);
              }
            } catch (e) {
              console.warn(`  ⚠ Chunk ${chunk.index + 1}: ${e.message}`);
            }
          }

          if (audioBuffers.length === 0) throw new Error('No audio fetched');

          // Concatenate
          const totalSize = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);
          const concatenated = new Uint8Array(totalSize);
          let offset = 0;
          for (const buf of audioBuffers) {
            concatenated.set(buf, offset);
            offset += buf.length;
          }
          console.log(`  📦 Total: ${(totalSize / (1024 * 1024)).toFixed(1)} MB from ${audioBuffers.length} chunks`);

          // Upload final
          const blob = new Blob([concatenated], { type: 'audio/mpeg' });
          const uploadResult = await base44.asServiceRole.storage.upload(blob, `voiceover_full_${project_id}.mp3`);
          const voiceoverUrl = uploadResult?.url || uploadResult;

          if (!voiceoverUrl || typeof voiceoverUrl !== 'string') {
            throw new Error('Upload returned no URL');
          }

          console.log(`  ✅ Final voiceover: ${voiceoverUrl.substring(0, 80)}`);

          await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
            voiceover_url: voiceoverUrl,
            voiceover_status: 'completed',
          });
          try {
            await base44.asServiceRole.entities.Projects.update(project_id, { voiceover_url: voiceoverUrl });
          } catch (e) {}

          return Response.json({
            status: 'ready',
            voiceover_url: voiceoverUrl,
            chunks_completed: completedCount,
            chunks_total: totalChunks,
            concatenated: true,
            file_size_mb: (totalSize / (1024 * 1024)).toFixed(1),
          });

        } catch (concatErr) {
          console.error(`❌ Concat failed: ${concatErr.message}`);
          // Fallback: return first chunk
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
            chunk_urls: doneChunks.map(c => c.audio_url),
          });
        }
      }
    }

    // ── All failed ──────────────────────────────────────────────
    if (allResolved && completedCount === 0) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        voiceover_status: 'failed',
      });
      return Response.json({
        status: 'failed',
        error: 'All voiceover chunks failed',
        chunks_total: totalChunks,
      });
    }

    // ── Still in progress ───────────────────────────────────────
    return Response.json({
      status: pendingCount > 0 ? 'submitting' : 'generating',
      chunks_completed: completedCount,
      chunks_failed: failedCount,
      chunks_generating: stillGenerating,
      chunks_pending: pendingCount,
      chunks_total: totalChunks,
      progress_percent: totalChunks > 0 ? Math.round((completedCount / totalChunks) * 100) : 0,
    });

  } catch (error) {
    console.error(`❌ pollVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});