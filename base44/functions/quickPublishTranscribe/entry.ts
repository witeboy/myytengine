import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// QUICK PUBLISH — Transcribe via AssemblyAI
// speech_models: ["universal-3-pro", "universal-2"] per docs (April 2026)
// Response payload: minimal — only what QuickPublish.jsx actually reads
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    // ── BUNNY CONFIG ROUTE ─────────────────────────────────────────
    // Runs before auth — detected by action: 'bunny_config' in body.
    let body = {};
    try { body = await req.json(); } catch (_) {}

    if (body.action === 'bunny_config') {
      return Response.json({
        storage_zone:     Deno.env.get('BUNNY_STORAGE_ZONE')     || '',
        storage_password: Deno.env.get('BUNNY_STORAGE_PASSWORD') || '',
        storage_region:   Deno.env.get('BUNNY_STORAGE_REGION')   || 'ny',
        cdn_url:          Deno.env.get('BUNNY_CDN_URL')          || '',
      });
    }

    // ── EXTRACT BEST MOMENTS ROUTE ────────────────────────────────
    if (body.action === 'extract_best_moments') {
      const { transcript, words = [], duration = 0, max_clips = 5, clip_min_sec = 15, clip_max_sec = 60 } = body;
      if (!transcript || transcript.length < 200) {
        return Response.json({ error: 'Transcript too short' }, { status: 400 });
      }
      const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
      if (!GEMINI_KEY) return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

      const WINDOW = 10;
      const blocks = [];
      let currentStart = 0;
      let currentText = [];
      for (const w of words) {
        if (w.start - currentStart >= WINDOW && currentText.length) {
          blocks.push({ start: currentStart, end: w.start, text: currentText.join(' ') });
          currentStart = w.start;
          currentText = [];
        }
        currentText.push(w.word);
      }
      if (currentText.length) blocks.push({ start: currentStart, end: duration || currentStart + WINDOW, text: currentText.join(' ') });
      const timestampedBlock = blocks.map(b => `[${b.start.toFixed(1)}s-${b.end.toFixed(1)}s] ${b.text}`).join('\n')
        || `(no word timestamps)\n\n${transcript.slice(0, 12000)}`;

      const prompt = `You are a viral Shorts producer. Identify the ${max_clips} BEST moments that could be standalone Shorts. Each clip must be ${clip_min_sec}-${clip_max_sec} seconds long.

TRANSCRIPT WITH TIMESTAMPS:
"""
${timestampedBlock.slice(0, 40000)}
"""
Total duration: ${duration}s

Score each clip on: hook(1-10), payoff, standalone, quotability, emotional_peak, curiosity_loop, specificity.

Return JSON:
{
  "clips": [{
    "rank": 1, "start_time": 42.3, "end_time": 88.7, "duration": 46.4,
    "title": "Short title under 60 chars",
    "hook_sentence": "Exact opening words",
    "overall_score": 9.2,
    "scores": { "hook": 9, "payoff": 10, "standalone": 9, "quotability": 9, "emotional_peak": 8, "curiosity_loop": 10, "specificity": 9 },
    "caption_style": "hormozi",
    "platform": "all",
    "viral_reasoning": "One sentence why this goes viral"
  }]
}`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192, responseMimeType: 'application/json' },
          }),
        }
      );
      if (!geminiRes.ok) throw new Error(`Gemini ${geminiRes.status}: ${(await geminiRes.text()).slice(0, 200)}`);
      const geminiData = await geminiRes.json();
      const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

      let parsed;
      try { parsed = JSON.parse(raw); }
      catch (_) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else return Response.json({ error: 'Failed to parse Gemini response' }, { status: 500 });
      }

      const clips = (parsed.clips || [])
        .map((c, i) => ({ ...c, rank: c.rank || (i + 1), duration: c.duration || (c.end_time - c.start_time) }))
        .filter(c => { const d = c.end_time - c.start_time; return d >= clip_min_sec - 2 && d <= clip_max_sec + 5; })
        .sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0));

      return Response.json({ success: true, clips, source_duration: duration });
    }
    // ── END EXTRACT BEST MOMENTS ROUTE ───────────────────────────
    // ── END BUNNY CONFIG ROUTE ─────────────────────────────────────

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, file_url, transcript_id } = body;

    const API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY');
    if (!API_KEY) {
      return Response.json({
        error: 'ASSEMBLYAI_API_KEY not set. Add it in Base44 Settings → Environment Variables.',
      }, { status: 500 });
    }

    // ── SUBMIT ──────────────────────────────────────────────────
    if (action === 'submit') {
      if (!file_url) return Response.json({ error: 'file_url required' }, { status: 400 });

      const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: file_url,
          speech_models: ['universal-3-pro', 'universal-2'],
          language_detection: true,
        }),
      });

      if (!submitRes.ok) {
        let errBody = '';
        try { errBody = JSON.stringify(await submitRes.json()); }
        catch (_) { errBody = await submitRes.text(); }
        console.error('AssemblyAI submit failed:', submitRes.status, errBody);
        return Response.json({ error: `AssemblyAI submit failed (${submitRes.status}): ${errBody}` }, { status: 500 });
      }

      const submitData = await submitRes.json();
      const id = submitData.id;
      if (!id) {
        return Response.json({ error: `No transcript ID returned: ${JSON.stringify(submitData)}` }, { status: 500 });
      }

      console.log('Transcription submitted:', id);
      return Response.json({ success: true, transcript_id: id });
    }

    // ── POLL ────────────────────────────────────────────────────
    if (action === 'poll') {
      if (!transcript_id) return Response.json({ error: 'transcript_id required' }, { status: 400 });

      const res = await fetch(`https://api.assemblyai.com/v2/transcript/${transcript_id}`, {
        headers: { 'Authorization': API_KEY },
      });

      if (!res.ok) {
        let errBody = '';
        try { errBody = JSON.stringify(await res.json()); }
        catch (_) { errBody = await res.text(); }
        return Response.json({ error: `Poll failed (${res.status}): ${errBody}` }, { status: 500 });
      }

      const result = await res.json();

      if (result.status === 'completed') {
        // Only return the 3 fields QuickPublish.jsx actually reads:
        // words, chapters, text, duration — nothing else to keep payload small
        const words = (result.words || []).map(w => ({
          word: w.text,
          start: w.start / 1000,
          end: w.end / 1000,
        }));

        const chapters = (result.chapters || []).map(ch => ({
          gist: ch.gist,
          headline: ch.headline,
          summary: ch.summary,
          start: ch.start / 1000,
          end: ch.end / 1000,
        }));

        console.log('Transcription complete:', words.length, 'words,', chapters.length, 'chapters');
        return Response.json({
          status: 'completed',
          text: result.text || '',
          words,
          duration: result.audio_duration || 0,
          chapters,
        });
      }

      if (result.status === 'error') {
        console.error('AssemblyAI transcription error:', result.error);
        return Response.json({ status: 'error', error: result.error || 'Transcription failed' });
      }

      return Response.json({ status: result.status });
    }

    // ── BUNNY PROJECT MANIFEST HELPERS ────────────────────────────
    const bunnyHost = (() => {
      const region = (Deno.env.get('BUNNY_STORAGE_REGION') || 'ny').trim();
      return (region === 'de' || region === 'storage' || !region)
        ? 'storage.bunnycdn.com'
        : `${region}.storage.bunnycdn.com`;
    })();
    const bunnyZone = (Deno.env.get('BUNNY_STORAGE_ZONE') || '').trim();
    const bunnyPass = (Deno.env.get('BUNNY_STORAGE_PASSWORD') || '').trim();
    const bunnyCdn  = (Deno.env.get('BUNNY_CDN_URL') || '').trim().replace(/\/$/, '');
    const MANIFEST_PATH = `projects/openshorts_manifest.json`;
    const manifestCdnUrl  = `${bunnyCdn}/${MANIFEST_PATH}`;
    const manifestUploadUrl = `https://${bunnyHost}/${bunnyZone}/${MANIFEST_PATH}`;

    const bunnyHeaders = { 'AccessKey': bunnyPass, 'Content-Type': 'application/json' };

    const loadManifest = async () => {
      try {
        const res = await fetch(manifestCdnUrl + `?_=${Date.now()}`);
        if (!res.ok) return [];
        return await res.json();
      } catch (_) { return []; }
    };

    const saveManifest = async (projects) => {
      await fetch(manifestUploadUrl, {
        method: 'PUT',
        headers: bunnyHeaders,
        body: JSON.stringify(projects),
      });
    };

    // ── BUNNY_SAVE_PROJECT ────────────────────────────────────────
    if (action === 'bunny_save_project') {
      const project = body.project;
      if (!project?.job_id) return Response.json({ error: 'project.job_id required' }, { status: 400 });
      if (!bunnyZone || !bunnyPass) return Response.json({ error: 'Bunny env vars not configured' }, { status: 500 });

      const projects = await loadManifest();
      // Replace if exists, otherwise append
      const idx = projects.findIndex(p => p.job_id === project.job_id);
      if (idx >= 0) projects[idx] = project;
      else projects.unshift(project); // newest first

      await saveManifest(projects);
      return Response.json({ success: true, project_count: projects.length });
    }

    // ── BUNNY_LIST_PROJECTS ───────────────────────────────────────
    if (action === 'bunny_list_projects') {
      if (!bunnyZone || !bunnyPass) return Response.json({ error: 'Bunny env vars not configured' }, { status: 500 });
      const projects = await loadManifest();
      return Response.json({ success: true, projects });
    }

    // ── BUNNY_DELETE_PROJECT ──────────────────────────────────────
    if (action === 'bunny_delete_project') {
      const { job_id } = body;
      if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });
      if (!bunnyZone || !bunnyPass) return Response.json({ error: 'Bunny env vars not configured' }, { status: 500 });

      const projects = await loadManifest();
      const filtered = projects.filter(p => p.job_id !== job_id);
      await saveManifest(filtered);
      return Response.json({ success: true, deleted: projects.length - filtered.length });
    }

    // ── CLIP_VIDEO — ffmpeg cut + portrait crop + stream upload to Bunny ─
    if (action === 'clip_video') {
      const { source_url, start, end } = body;
      if (!source_url || start == null || end == null) {
        return Response.json({ error: 'source_url, start, end required' }, { status: 400 });
      }
      if (!bunnyZone || !bunnyPass) return Response.json({ error: 'Bunny env vars not configured' }, { status: 500 });

      const duration = Math.ceil(end - start);
      if (duration <= 0) return Response.json({ error: 'Invalid clip range' }, { status: 400 });

      const ts      = Date.now();
      const tmpIn   = `/tmp/clip_src_${ts}.mp4`;
      const tmpOut  = `/tmp/clip_out_${ts}.mp4`;

      try {
        // ── Step 1: Feed source URL directly to ffmpeg via HTTP ───
        // Skip downloading to disk entirely — ffmpeg reads the URL directly.
        // This avoids all memory and temp file issues with large source videos.
        console.log(`[clip_video] Source: ${source_url.slice(0, 80)}`);
        console.log(`[clip_video] Cutting ${start}s → ${end}s (${duration}s) with portrait crop`);

        // ── Step 2: ffmpeg — cut + portrait crop 9:16 ─────────────────────
        // Uses .output() which collects stdout+stderr and waits for exit cleanly
        console.log(`[clip_video] Running ffmpeg: ${Math.floor(start)}s → +${duration}s, portrait crop`);
        const ffOut = await new Deno.Command('ffmpeg', {
          args: [
            '-y',
            '-ss', String(Math.floor(start)),
            '-i', source_url,
            '-t',  String(duration),
            '-vf', 'crop=ih*9/16:ih,scale=720:1280',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '26',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-f', 'mp4',
            tmpOut,
          ],
          stdout: 'piped',
          stderr: 'piped',
        }).output();  // .output() waits for completion and collects all output

        if (!ffOut.success) {
          const errText = new TextDecoder().decode(ffOut.stderr).slice(-800);
          console.error('[clip_video] ffmpeg stderr:', errText);
          throw new Error(`ffmpeg failed: ${errText.slice(0, 400)}`);
        }
        console.log('[clip_video] ffmpeg complete');

       // ── Step 3: Upload cut clip to Bunny ──────────────────────
        // Cut clip is small (20-60MB) — safe to readFile, only the source was huge
        const clipName  = `clips/clip_${ts}_${Math.round(start)}s_${duration}s_9x16.mp4`;
        const uploadUrl = `https://${bunnyHost}/${bunnyZone}/${clipName}`;

        const clipBytes = await Deno.readFile(tmpOut);
        console.log(`[clip_video] Uploading ${(clipBytes.length / 1024 / 1024).toFixed(1)}MB to Bunny`);

        const upRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'AccessKey': bunnyPass,
            'Content-Type': 'video/mp4',
          },
          body: clipBytes,
        });

        if (!upRes.ok) {
          const upErr = await upRes.text();
          throw new Error(`Bunny upload failed: HTTP ${upRes.status} — ${upErr.slice(0, 200)}`);
        }

        const clip_url = `${bunnyCdn}/${clipName}`;
        console.log(`[clip_video] Done: ${clip_url}`);
        return Response.json({ success: true, clip_url, duration });

      } finally {
        try { await Deno.remove(tmpOut); } catch (_) {}
      }
    }

    return Response.json({ error: 'Invalid action. Use submit or poll' }, { status: 400 });

  } catch (error) {
    console.error('quickPublishTranscribe error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});