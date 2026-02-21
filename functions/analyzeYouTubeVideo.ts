import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ===================================================================
// HELPERS
// ===================================================================
function extractVideoId(url) {
  const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  const embedMatch = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  return null;
}

function parseDuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 60;
  return parseInt(match[1] || '0') * 3600 + parseInt(match[2] || '0') * 60 + parseInt(match[3] || '0');
}

// ===================================================================
// TIER 1: YouTube Transcript API (captions)
// ===================================================================
async function getYouTubeTranscript(videoId) {
  const apiKey = Deno.env.get("YOUTUBE_TRANSCRIPT_API_KEY");
  if (!apiKey) {
    console.log('[Transcript] No YOUTUBE_TRANSCRIPT_API_KEY set');
    return null;
  }

  try {
    console.log(`[Transcript] Fetching captions for ${videoId}...`);
    const response = await fetch('https://youtubetranscript.dev/api/v2/batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ video_ids: [videoId], lang: 'en', preserve_formatting: false })
    });

    if (!response.ok) {
      console.log(`[Transcript] API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.results?.[0] || data.results[0].status !== 'completed') {
      console.log('[Transcript] No completed result');
      return null;
    }

    const transcriptData = data.results[0].data?.transcript;
    let transcript = '';
    if (typeof transcriptData === 'string') {
      transcript = transcriptData;
    } else if (transcriptData?.text) {
      transcript = transcriptData.text;
    } else if (Array.isArray(transcriptData?.segments)) {
      transcript = transcriptData.segments.map(seg => seg.text || seg.utf8 || '').join(' ').replace(/\s+/g, ' ').trim();
    }

    if (transcript && transcript.length > 50) {
      console.log(`[Transcript] Got ${transcript.length} chars from captions`);
      return transcript;
    }
    return null;
  } catch (error) {
    console.log(`[Transcript] Error: ${error.message}`);
    return null;
  }
}

// ===================================================================
// TIER 2: AssemblyAI transcription (upload binary + poll)
// ===================================================================
async function transcribeAudioBuffer(audioData) {
  const apiKey = Deno.env.get("ASSEMBLYAI_API_KEY");
  if (!apiKey) {
    console.log('[AssemblyAI] No ASSEMBLYAI_API_KEY set');
    return null;
  }

  try {
    console.log(`[AssemblyAI] Uploading ${(audioData.byteLength / 1024 / 1024).toFixed(1)}MB...`);
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: { 'authorization': apiKey, 'content-type': 'application/octet-stream' },
      body: audioData,
    });

    if (!uploadRes.ok) {
      console.log(`[AssemblyAI] Upload failed: ${uploadRes.status}`);
      return null;
    }

    const uploadData = await uploadRes.json();
    if (!uploadData.upload_url) {
      console.log('[AssemblyAI] No upload_url returned');
      return null;
    }

    console.log('[AssemblyAI] Starting transcription...');
    const startRes = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: { "authorization": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ audio_url: uploadData.upload_url, language_detection: true })
    });

    const startData = await startRes.json();
    if (startData.error) {
      console.log(`[AssemblyAI] Start error: ${startData.error}`);
      return null;
    }

    const transcriptId = startData.id;
    console.log(`[AssemblyAI] Job ${transcriptId} — polling...`);

    for (let i = 0; i < 80; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { "authorization": apiKey }
      });
      const result = await pollRes.json();
      console.log(`[AssemblyAI] Poll ${i + 1}: ${result.status}`);

      if (result.status === "completed") {
        console.log(`[AssemblyAI] Done! ${result.text?.length} chars`);
        return result.text;
      }
      if (result.status === "error") {
        console.log(`[AssemblyAI] Error: ${result.error}`);
        return null;
      }
    }

    console.log('[AssemblyAI] Timed out');
    return null;
  } catch (error) {
    console.log(`[AssemblyAI] Error: ${error.message}`);
    return null;
  }
}

// ===================================================================
// MAIN
// ===================================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { video_url } = await req.json();
    if (!video_url) return Response.json({ error: 'Missing video_url' }, { status: 400 });

    const videoId = extractVideoId(video_url);
    if (!videoId) return Response.json({ error: 'Could not extract video ID from URL' }, { status: 400 });

    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    // ── 1. Fetch YouTube metadata ────────────────────────────────
    console.log(`[Analyze] Fetching YouTube metadata for ${videoId}...`);
    const ytUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`;
    const ytResp = await fetch(ytUrl);
    const ytData = await ytResp.json();

    if (!ytData.items || ytData.items.length === 0) {
      return Response.json({ error: 'Video not found on YouTube' }, { status: 404 });
    }

    const video = ytData.items[0];
    const snippet = video.snippet;
    const stats = video.statistics;
    const durationSec = parseDuration(video.contentDetails.duration);
    const isShort = durationSec <= 60 || video_url.includes('/shorts/');

    let channelName = snippet.channelTitle;
    let subscriberCount = 0;
    try {
      const chUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${snippet.channelId}&key=${apiKey}`;
      const chResp = await fetch(chUrl);
      const chData = await chResp.json();
      if (chData.items?.[0]) {
        subscriberCount = parseInt(chData.items[0].statistics.subscriberCount || '0');
      }
    } catch (e) {
      console.warn('Channel fetch failed:', e.message);
    }

    // ── 2. Get FULL transcript (2-tier: Captions → AssemblyAI) ───
    console.log('[Analyze] Extracting full transcript...');
    let transcript = null;
    let transcriptSource = 'none';

    // Tier 1: YouTube captions API
    transcript = await getYouTubeTranscript(videoId);
    if (transcript && transcript.length >= 50) {
      transcriptSource = 'youtube_captions';
      console.log(`[Analyze] Transcript from captions: ${transcript.length} chars`);
    }

    // Tier 2: Download YouTube audio via ytdl endpoint and transcribe with AssemblyAI
    if (!transcript || transcript.length < 50) {
      console.log('[Analyze] No captions found, falling back to AssemblyAI audio transcription...');
      const aaiKey = Deno.env.get("ASSEMBLYAI_API_KEY");

      if (aaiKey) {
        // AssemblyAI supports YouTube URLs natively
        try {
          console.log('[AssemblyAI] Submitting YouTube URL directly...');
          const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
          const startRes = await fetch("https://api.assemblyai.com/v2/transcript", {
            method: "POST",
            headers: { "authorization": aaiKey, "content-type": "application/json" },
            body: JSON.stringify({ audio_url: youtubeUrl, language_detection: true, speech_models: ["best"] })
          });

          const startData = await startRes.json();
          if (startData.id && !startData.error) {
            const transcriptId = startData.id;
            console.log(`[AssemblyAI] Job ${transcriptId} — polling...`);

            for (let i = 0; i < 80; i++) {
              await new Promise(r => setTimeout(r, 3000));
              const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
                headers: { "authorization": aaiKey }
              });
              const result = await pollRes.json();
              console.log(`[AssemblyAI] Poll ${i + 1}: ${result.status}`);

              if (result.status === "completed" && result.text?.length >= 50) {
                transcript = result.text;
                transcriptSource = 'assemblyai';
                console.log(`[AssemblyAI] Done! ${transcript.length} chars`);
                break;
              }
              if (result.status === "error") {
                console.log(`[AssemblyAI] Error: ${result.error}`);
                break;
              }
            }
          } else {
            console.log(`[AssemblyAI] Submit failed: ${startData.error || 'unknown'}`);
          }
        } catch (aaiErr) {
          console.log(`[AssemblyAI] Error: ${aaiErr.message}`);
        }
      }
    }

    if (!transcript || transcript.length < 50) {
      console.log('[Analyze] WARNING: No transcript available, analysis will be metadata-only');
    }

    // ── 3. Deep analysis with Gemini (using real transcript) ─────
    const maxTranscriptLen = 50000;
    const truncatedTranscript = transcript
      ? (transcript.length > maxTranscriptLen
          ? transcript.substring(0, maxTranscriptLen) + '... [truncated]'
          : transcript)
      : null;

    const transcriptSection = truncatedTranscript
      ? `\n\nFULL ORIGINAL TRANSCRIPT (${transcript.length} chars):\n"""\n${truncatedTranscript}\n"""`
      : '\n\n(No transcript available — analyze based on metadata only)';

    const analysisPrompt = `You are an elite YouTube content analyst and scriptwriting expert. Analyze this video using BOTH the metadata AND the full transcript below.

VIDEO METADATA:
- Title: "${snippet.title}"
- Channel: "${channelName}" (${subscriberCount.toLocaleString()} subscribers)
- Description: "${(snippet.description || '').substring(0, 2000)}"
- Tags: ${(snippet.tags || []).slice(0, 20).join(', ') || 'none'}
- Duration: ${durationSec} seconds (${isShort ? 'YouTube Short' : 'standard video'})
- Views: ${parseInt(stats.viewCount || '0').toLocaleString()}
- Likes: ${parseInt(stats.likeCount || '0').toLocaleString()}
- Comments: ${parseInt(stats.commentCount || '0').toLocaleString()}
- Published: ${snippet.publishedAt}
${transcriptSection}

INSTRUCTIONS:
${truncatedTranscript ? `You have the FULL original transcript. Use it to:
1. Identify the EXACT script style — word choice, sentence length, rhetorical devices, transitions
2. Capture the EXACT hook/opening technique used (quote the first 2-3 sentences)
3. Map the complete content structure with timestamps
4. Note signature phrases, recurring patterns, and stylistic choices
5. The "original_script" field MUST contain the COMPLETE cleaned-up transcript — every word of the original narration, cleaned of filler/timestamps but preserving the full content. Do NOT summarize — include the ENTIRE script.
6. The "reconstructed_outline" should be a detailed beat-by-beat breakdown of the video` :
`No transcript available. Analyze based on metadata, title patterns, description, and tags. Estimate the script style and structure.
The "original_script" field should say "Transcript unavailable — metadata-only analysis"`}

Return a JSON object:
{
  "title": "exact video title",
  "estimated_duration_seconds": ${durationSec},
  "niche": "content niche category",
  "script_style": "detailed description of writing/narration style with specific examples from transcript",
  "voiceover_style": "voice delivery style — tone, speed, emphasis patterns",
  "visual_style": "visual production style",
  "pacing": "content pacing — fast/medium/slow with specifics",
  "hook_technique": "exact opening hook technique with quote if available",
  "content_structure": "detailed content structure breakdown",
  "key_topics": ["topic1", "topic2", ...],
  "estimated_word_count": ${transcript ? transcript.split(/\\s+/).length : Math.round(durationSec / 60 * 150)},
  "reconstructed_outline": "detailed beat-by-beat outline of the video content",
  "tone_description": "overall tone and mood with examples",
  "original_script": "THE COMPLETE ORIGINAL TRANSCRIPT/SCRIPT — every word, cleaned up but FULL. This is critical for repurposing."
}

CRITICAL: The "original_script" field must contain the ENTIRE original transcript, not a summary. This is used downstream for content repurposing.`;

    console.log('[Analyze] Sending to Gemini for deep analysis...');
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: analysisPrompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 65536, responseMimeType: "application/json" }
        })
      }
    );

    const geminiData = await geminiResp.json();
    if (!geminiData.candidates?.[0]) {
      console.error('[Analyze] Gemini failed:', JSON.stringify(geminiData).substring(0, 500));
      return Response.json({ error: 'AI analysis failed' }, { status: 500 });
    }

    const analysisText = geminiData.candidates[0].content.parts[0].text;
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch (e) {
      const start = analysisText.indexOf('{');
      const end = analysisText.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        analysis = JSON.parse(analysisText.substring(start, end + 1));
      } else {
        return Response.json({ error: 'Failed to parse analysis' }, { status: 500 });
      }
    }

    // Override with real data
    analysis.title = snippet.title;
    analysis.estimated_duration_seconds = durationSec;
    analysis.is_short = isShort;
    analysis.transcript_source = transcriptSource;
    analysis.transcript_length = transcript ? transcript.length : 0;

    // If Gemini truncated the script, use raw transcript instead
    if (transcript && transcript.length > 100) {
      const scriptField = analysis.original_script || '';
      if (scriptField.length < transcript.length * 0.5) {
        console.log(`[Analyze] Gemini script too short (${scriptField.length} vs ${transcript.length}), using raw transcript`);
        analysis.original_script = transcript;
      }
    }

    analysis.youtube_stats = {
      views: parseInt(stats.viewCount || '0'),
      likes: parseInt(stats.likeCount || '0'),
      comments: parseInt(stats.commentCount || '0'),
      channel: channelName,
      subscribers: subscriberCount,
      published: snippet.publishedAt,
    };

    console.log(`[Analyze] Complete! Transcript: ${transcriptSource} (${analysis.original_script?.length || 0} chars script)`);
    return Response.json(analysis);

  } catch (error) {
    console.error('analyzeYouTubeVideo error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});