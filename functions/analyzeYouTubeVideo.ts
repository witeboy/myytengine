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
function extractTranscriptText(data) {
  // Try multiple paths to find transcript text in the API response
  const result = data.results?.[0];
  if (!result?.data) return '';

  const rd = result.data;

  // Path 1: data.transcript as string
  if (typeof rd.transcript === 'string' && rd.transcript.length > 50) {
    return rd.transcript;
  }

  // Path 2: data.transcript.text
  if (rd.transcript?.text && rd.transcript.text.length > 50) {
    return rd.transcript.text;
  }

  // Path 3: data.transcript as array of segments
  if (Array.isArray(rd.transcript)) {
    const joined = rd.transcript.map(seg => seg.text || seg.utf8 || '').join(' ').replace(/\s+/g, ' ').trim();
    if (joined.length > 50) return joined;
  }

  // Path 4: data.transcript.segments array
  if (Array.isArray(rd.transcript?.segments)) {
    const joined = rd.transcript.segments.map(seg => seg.text || seg.utf8 || '').join(' ').replace(/\s+/g, ' ').trim();
    if (joined.length > 50) return joined;
  }

  // Path 5: data.text directly
  if (typeof rd.text === 'string' && rd.text.length > 50) {
    return rd.text;
  }

  // Path 6: data.content
  if (typeof rd.content === 'string' && rd.content.length > 50) {
    return rd.content;
  }

  return '';
}

async function getYouTubeTranscript(videoId) {
  const apiKey = Deno.env.get("YOUTUBE_TRANSCRIPT_API_KEY");
  if (!apiKey) {
    console.log('[Transcript] No YOUTUBE_TRANSCRIPT_API_KEY set');
    return null;
  }

  const MAX_RETRIES = 5;
  const RETRY_DELAY = 4000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Transcript T1] Attempt ${attempt}/${MAX_RETRIES} for ${videoId}...`);
      const response = await fetch('https://youtubetranscript.dev/api/v2/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ video_ids: [videoId], lang: 'en', preserve_formatting: false })
      });

      if (!response.ok) {
        console.log(`[Transcript T1] API returned ${response.status}`);
        return null;
      }

      const data = await response.json();
      const status = data.results?.[0]?.status || 'no result';
      console.log(`[Transcript T1] Response status: ${status}`);

      // Log raw data keys for debugging
      const rawData = data.results?.[0]?.data;
      if (rawData) {
        console.log(`[Transcript T1] Raw data keys: ${Object.keys(rawData).join(', ')}`);
      }

      // If still processing, wait and retry
      if (status === 'processing' || status === 'pending' || status === 'queued') {
        console.log(`[Transcript T1] Still ${status}, waiting ${RETRY_DELAY}ms before retry...`);
        // Even while "processing", try to extract — some APIs populate data incrementally
        const earlyText = extractTranscriptText(data);
        if (earlyText.length > 50) {
          console.log(`[Transcript T1] Found text (${earlyText.length} chars) despite '${status}' status`);
          return earlyText;
        }
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAY));
          continue;
        }
        console.log('[Transcript T1] Max retries reached while processing');
        return null;
      }

      // Try to extract regardless of status (some APIs return data with non-"completed" status)
      const transcript = extractTranscriptText(data);
      if (transcript.length > 50) {
        console.log(`[Transcript T1] Got ${transcript.length} chars (status: ${status})`);
        return transcript;
      }

      if (status === 'completed') {
        console.log(`[Transcript T1] Status completed but no usable text found. Full data: ${JSON.stringify(rawData).substring(0, 500)}`);
      }

      console.log(`[Transcript T1] No usable transcript (status: ${status})`);
      return null;
    } catch (error) {
      console.log(`[Transcript T1] Error on attempt ${attempt}: ${error.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
        continue;
      }
      return null;
    }
  }
  return null;
}

// ===================================================================
// TIER 1.5: Free YouTube Transcript via InnerTube API (no key needed)
// ===================================================================
async function getYouTubeTranscriptFree(videoId) {
  try {
    console.log(`[Transcript T1.5] Fetching via InnerTube for ${videoId}...`);
    
    // Fetch the video page to get captions
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await pageRes.text();
    
    // Extract captions URL from the page
    const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionMatch) {
      console.log('[Transcript T1.5] No captionTracks found in page');
      return null;
    }
    
    let captionTracks;
    try {
      captionTracks = JSON.parse(captionMatch[1]);
    } catch (e) {
      console.log('[Transcript T1.5] Failed to parse captionTracks');
      return null;
    }
    
    // Prefer English, fall back to any language
    const enTrack = captionTracks.find(t => t.languageCode === 'en') || 
                    captionTracks.find(t => t.languageCode?.startsWith('en')) ||
                    captionTracks[0];
    
    if (!enTrack?.baseUrl) {
      console.log('[Transcript T1.5] No caption track URL found');
      return null;
    }
    
    // Fetch the caption XML
    const captionRes = await fetch(enTrack.baseUrl);
    const captionXml = await captionRes.text();
    
    // Parse XML to extract text
    const textParts = [];
    const textRegex = /<text[^>]*>(.*?)<\/text>/gs;
    let match;
    while ((match = textRegex.exec(captionXml)) !== null) {
      let text = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, '')
        .trim();
      if (text) textParts.push(text);
    }
    
    const transcript = textParts.join(' ').replace(/\s+/g, ' ').trim();
    
    if (transcript.length > 50) {
      console.log(`[Transcript T1.5] Got ${transcript.length} chars from InnerTube captions`);
      return transcript;
    }
    
    console.log(`[Transcript T1.5] Transcript too short: ${transcript.length} chars`);
    return null;
  } catch (error) {
    console.log(`[Transcript T1.5] Error: ${error.message}`);
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

    // Tier 1.5: Free InnerTube captions (no API key needed)
    if (!transcript || transcript.length < 50) {
      console.log('[Analyze] Trying free InnerTube transcript fallback...');
      transcript = await getYouTubeTranscriptFree(videoId);
      if (transcript && transcript.length >= 50) {
        transcriptSource = 'youtube_innertube';
        console.log(`[Analyze] Transcript from InnerTube: ${transcript.length} chars`);
      }
    }

    // Tier 2: Cobalt (extract audio) → AssemblyAI (speech-to-text)
    if (!transcript || transcript.length < 50) {
      console.log('[Analyze] No captions found, falling back to Cobalt + AssemblyAI...');
      const cobaltUrl = Deno.env.get("COBALT_API_URL");
      const aaiKey = Deno.env.get("ASSEMBLYAI_API_KEY");

      if (cobaltUrl && aaiKey) {
        try {
          // Step A: Extract audio via Cobalt
          console.log('[Cobalt] Requesting audio extraction...');
          const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
          // Normalize Cobalt URL — remove trailing slash, ensure correct endpoint
          const cobaltEndpoint = cobaltUrl.replace(/\/+$/, '');
          const cobaltRes = await fetch(cobaltEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ url: youtubeUrl, downloadMode: "audio", audioFormat: "mp3" })
          });

          let cobaltData;
          try {
            cobaltData = await cobaltRes.json();
          } catch (parseErr) {
            console.log(`[Cobalt] Failed to parse response as JSON (status ${cobaltRes.status})`);
            throw new Error('Cobalt returned non-JSON response');
          }
          console.log(`[Cobalt] Response keys: ${Object.keys(cobaltData).join(', ')}`);
          const audioUrl = cobaltData.url || cobaltData.audio;

          if (!audioUrl) {
            console.log(`[Cobalt] No audio URL returned: ${JSON.stringify(cobaltData).substring(0, 300)}`);
          } else {
            console.log(`[Cobalt] Got audio URL, downloading...`);

            // Step B: Download the audio
            const audioRes = await fetch(audioUrl);
            if (!audioRes.ok) {
              console.log(`[Cobalt] Audio download failed: ${audioRes.status}`);
            } else {
              const audioData = await audioRes.arrayBuffer();
              console.log(`[Cobalt] Downloaded ${(audioData.byteLength / 1024 / 1024).toFixed(1)}MB`);

              // Step C: Upload raw audio to AssemblyAI
              console.log('[AssemblyAI] Uploading audio...');
              const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
                method: 'POST',
                headers: { 'authorization': aaiKey, 'content-type': 'application/octet-stream' },
                body: audioData,
              });

              if (!uploadRes.ok) {
                console.log(`[AssemblyAI] Upload failed: ${uploadRes.status}`);
              } else {
                const uploadData = await uploadRes.json();
                if (!uploadData.upload_url) {
                  console.log('[AssemblyAI] No upload_url returned');
                } else {
                  // Step D: Start transcription
                  console.log('[AssemblyAI] Starting transcription...');
                  const startRes = await fetch("https://api.assemblyai.com/v2/transcript", {
                    method: "POST",
                    headers: { "authorization": aaiKey, "content-type": "application/json" },
                    body: JSON.stringify({ audio_url: uploadData.upload_url, language_detection: true })
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
                        transcriptSource = 'cobalt_assemblyai';
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
                }
              }
            }
          }
        } catch (err) {
          console.log(`[Cobalt+AssemblyAI] Error: ${err.message}`);
        }
      } else {
        console.log('[Analyze] Missing COBALT_API_URL or ASSEMBLYAI_API_KEY for Tier 2');
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

    // ALWAYS use the raw transcript as original_script — never trust Gemini to echo it back fully
    if (transcript && transcript.length > 50) {
      console.log(`[Analyze] Using raw transcript (${transcript.length} chars) as original_script instead of Gemini output (${(analysis.original_script || '').length} chars)`);
      analysis.original_script = transcript;
      analysis.transcript_source = transcriptSource;
    } else if (!analysis.original_script || analysis.original_script.length < 50) {
      analysis.original_script = '';
      analysis.transcript_source = 'none';
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