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
    
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    const html = await pageRes.text();
    
    // Multiple extraction patterns (YouTube changes these periodically)
    let captionTracks = null;
    const patterns = [
      /"captionTracks":\s*(\[.*?\])\s*[,}]/,
      /captionTracks\\?":\s*(\[.*?\])/,
      /"playerCaptionsTracklistRenderer".*?"captionTracks":\s*(\[.*?\])/s,
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          let jsonStr = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          captionTracks = JSON.parse(jsonStr);
          console.log(`[Transcript T1.5] Found ${captionTracks.length} caption tracks`);
          break;
        } catch (_) { continue; }
      }
    }
    
    if (!captionTracks || captionTracks.length === 0) {
      // Try extracting from ytInitialPlayerResponse
      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.*?});/s);
      if (playerMatch) {
        try {
          const player = JSON.parse(playerMatch[1]);
          captionTracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (captionTracks) console.log(`[Transcript T1.5] Found ${captionTracks.length} tracks from playerResponse`);
        } catch (_) {}
      }
    }
    
    if (!captionTracks || captionTracks.length === 0) {
      console.log('[Transcript T1.5] No captionTracks found');
      return null;
    }
    
    // Priority: manual English > auto English > manual any > auto any
    const enManual = captionTracks.find(t => t.languageCode === 'en' && t.kind !== 'asr');
    const enAuto = captionTracks.find(t => t.languageCode === 'en' && t.kind === 'asr');
    const enAny = captionTracks.find(t => t.languageCode?.startsWith('en'));
    const anyManual = captionTracks.find(t => t.kind !== 'asr');
    const track = enManual || enAuto || enAny || anyManual || captionTracks[0];
    
    if (!track?.baseUrl) {
      console.log('[Transcript T1.5] No caption track URL found');
      return null;
    }
    
    console.log(`[Transcript T1.5] Using track: ${track.languageCode} (${track.kind === 'asr' ? 'auto-generated' : 'manual'})`);
    
    // Fetch caption XML — try with fmt=json3 first (more reliable), fall back to XML
    let transcript = '';
    
    // Try JSON3 format
    try {
      const json3Url = track.baseUrl + (track.baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';
      const json3Res = await fetch(json3Url);
      if (json3Res.ok) {
        const json3 = await json3Res.json();
        if (json3.events) {
          const parts = json3.events
            .filter(e => e.segs)
            .flatMap(e => e.segs.map(s => s.utf8?.trim()).filter(Boolean));
          transcript = parts.join(' ').replace(/\s+/g, ' ').trim();
          if (transcript.length > 50) {
            console.log(`[Transcript T1.5] Got ${transcript.length} chars from JSON3 format`);
            return transcript;
          }
        }
      }
    } catch (_) {}
    
    // Fall back to XML format
    const captionRes = await fetch(track.baseUrl);
    const captionXml = await captionRes.text();
    
    const textParts = [];
    const textRegex = /<text[^>]*>(.*?)<\/text>/gs;
    let match;
    while ((match = textRegex.exec(captionXml)) !== null) {
      let text = match[1]
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/<[^>]+>/g, '').trim();
      if (text) textParts.push(text);
    }
    
    transcript = textParts.join(' ').replace(/\s+/g, ' ').trim();
    
    if (transcript.length > 50) {
      console.log(`[Transcript T1.5] Got ${transcript.length} chars from XML format`);
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

// Tier 1.6: Try youtube-transcript via RapidAPI
    if (!transcript || transcript.length < 50) {
      const rapidKey = Deno.env.get("RAPIDAPI_KEY");
      if (rapidKey) {
        try {
          console.log(`[Transcript T1.6] Trying RapidAPI YouTube Transcript...`);
          const rapidRes = await fetch(`https://youtube-transcriptor.p.rapidapi.com/transcript?video_id=${videoId}&lang=en`, {
            headers: { 'X-RapidAPI-Key': rapidKey, 'X-RapidAPI-Host': 'youtube-transcriptor.p.rapidapi.com' }
          });
          if (rapidRes.ok) {
            const rapidData = await rapidRes.json();
            let rapidText = '';
            if (Array.isArray(rapidData)) {
              rapidText = rapidData.map(s => s.subtitle || s.text || '').join(' ').replace(/\s+/g, ' ').trim();
            } else if (rapidData?.transcription) {
              rapidText = Array.isArray(rapidData.transcription) 
                ? rapidData.transcription.map(s => s.subtitle || s.text || '').join(' ').replace(/\s+/g, ' ').trim()
                : rapidData.transcription;
            }
            if (rapidText && rapidText.length > 50) {
              transcript = rapidText;
              transcriptSource = 'rapidapi';
              console.log(`[Transcript T1.6] Got ${transcript.length} chars`);
            }
          }
        } catch (err) {
          console.log(`[Transcript T1.6] Error: ${err.message}`);
        }
      }
    }

    // Tier 1.7: Try Kome.ai transcript API
    if (!transcript || transcript.length < 50) {
      try {
        console.log(`[Transcript T1.7] Trying Kome.ai...`);
        const komeRes = await fetch(`https://kome.ai/api/transcript?url=https://www.youtube.com/watch?v=${videoId}`, {
          headers: { 'Accept': 'application/json' }
        });
        if (komeRes.ok) {
          const komeData = await komeRes.json();
          const komeText = komeData?.transcript || komeData?.text || '';
          if (komeText.length > 50) {
            transcript = komeText;
            transcriptSource = 'kome';
            console.log(`[Transcript T1.7] Got ${transcript.length} chars`);
          }
        }
      } catch (err) {
        console.log(`[Transcript T1.7] Error: ${err.message}`);
      }
    }

    // Tier 1.75: Try supadata.ai free transcript API
    if (!transcript || transcript.length < 50) {
      try {
        console.log(`[Transcript T1.75] Trying Supadata API...`);
        const supaRes = await fetch(`https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&lang=en`);
        if (supaRes.ok) {
          const supaData = await supaRes.json();
          let supaText = '';
          if (typeof supaData === 'string') {
            supaText = supaData;
          } else if (supaData?.content) {
            supaText = supaData.content;
          } else if (supaData?.transcript) {
            supaText = typeof supaData.transcript === 'string' ? supaData.transcript : '';
          } else if (Array.isArray(supaData)) {
            supaText = supaData.map(s => s.text || s.content || '').join(' ').replace(/\s+/g, ' ').trim();
          }
          if (supaText && supaText.length > 50) {
            transcript = supaText;
            transcriptSource = 'supadata';
            console.log(`[Transcript T1.75] Got ${transcript.length} chars from Supadata`);
          } else {
            console.log(`[Transcript T1.75] No usable text (${supaText?.length || 0} chars)`);
          }
        } else {
          console.log(`[Transcript T1.75] Supadata returned ${supaRes.status}`);
        }
      } catch (err) {
        console.log(`[Transcript T1.75] Error: ${err.message}`);
      }
    }

    // Tier 2: OpenAI Whisper via direct audio URL (no Cobalt needed)
    if (!transcript || transcript.length < 50) {
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (openaiKey) {
        try {
          console.log('[Transcript T2] Trying OpenAI Whisper via audio extraction...');
          
          // Step A: Get audio URL from multiple sources
          let audioUrl = null;
          
          // Try Cobalt first
          const cobaltUrl = Deno.env.get("COBALT_API_URL");
          if (cobaltUrl) {
            try {
              const cobaltEndpoint = cobaltUrl.replace(/\/+$/, '');
              const cobaltRes = await fetch(cobaltEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
                body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}`, downloadMode: "audio", audioFormat: "mp3" })
              });
              const cobaltData = await cobaltRes.json();
              audioUrl = cobaltData.url || cobaltData.audio;
              if (audioUrl) console.log('[Transcript T2] Got audio URL from Cobalt');
            } catch (err) {
              console.log(`[Transcript T2] Cobalt failed: ${err.message}`);
            }
          }
          
          if (!audioUrl) {
            console.log('[Transcript T2] No audio URL available, skipping Whisper');
          } else {
            // Step B: Download audio (cap at 24MB for Whisper limit)
            console.log('[Transcript T2] Downloading audio...');
            const audioRes = await fetch(audioUrl);
            if (audioRes.ok) {
              const audioData = await audioRes.arrayBuffer();
              const sizeMB = audioData.byteLength / 1024 / 1024;
              console.log(`[Transcript T2] Downloaded ${sizeMB.toFixed(1)}MB`);
              
              if (sizeMB > 24) {
                console.log('[Transcript T2] Audio too large for Whisper (>24MB), falling back to AssemblyAI');
                // Use AssemblyAI for large files — submit-only, poll separately
                const aaiKey = Deno.env.get("ASSEMBLYAI_API_KEY");
                if (aaiKey) {
                  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
                    method: 'POST',
                    headers: { 'authorization': aaiKey, 'content-type': 'application/octet-stream' },
                    body: audioData,
                  });
                  if (uploadRes.ok) {
                    const uploadData = await uploadRes.json();
                    const startRes = await fetch("https://api.assemblyai.com/v2/transcript", {
                      method: "POST",
                      headers: { "authorization": aaiKey, "content-type": "application/json" },
                      body: JSON.stringify({ audio_url: uploadData.upload_url, language_detection: true })
                    });
                    const startData = await startRes.json();
                    if (startData.id) {
                      console.log(`[Transcript T2] AssemblyAI job ${startData.id} — polling (max 45s)...`);
                      for (let i = 0; i < 15; i++) {
                        await new Promise(r => setTimeout(r, 3000));
                        const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${startData.id}`, {
                          headers: { "authorization": aaiKey }
                        });
                        const result = await pollRes.json();
                        if (result.status === "completed" && result.text?.length >= 50) {
                          transcript = result.text;
                          transcriptSource = 'assemblyai';
                          console.log(`[Transcript T2] AssemblyAI done: ${transcript.length} chars`);
                          break;
                        }
                        if (result.status === "error") {
                          console.log(`[Transcript T2] AssemblyAI error: ${result.error}`);
                          break;
                        }
                      }
                    }
                  }
                }
              } else {
                // Step C: Send to OpenAI Whisper
                console.log('[Transcript T2] Sending to Whisper...');
                const formData = new FormData();
                formData.append('file', new File([audioData], 'audio.mp3', { type: 'audio/mpeg' }));
                formData.append('model', 'whisper-1');
                formData.append('response_format', 'text');
                formData.append('language', 'en');
                
                const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${openaiKey}` },
                  body: formData
                });
                
                if (whisperRes.ok) {
                  const whisperText = await whisperRes.text();
                  if (whisperText.length > 50) {
                    transcript = whisperText.trim();
                    transcriptSource = 'openai_whisper';
                    console.log(`[Transcript T2] Whisper done: ${transcript.length} chars`);
                  }
                } else {
                  console.log(`[Transcript T2] Whisper failed: ${whisperRes.status}`);
                }
              }
            }
          }
        } catch (err) {
          console.log(`[Transcript T2] Error: ${err.message}`);
        }
      }
    }

    // Tier 2.5: AssemblyAI direct (if Cobalt gave audio but Whisper failed)
    if (!transcript || transcript.length < 50) {
      const aaiKey = Deno.env.get("ASSEMBLYAI_API_KEY");
      if (aaiKey) {
        try {
          // Try using YouTube URL directly with AssemblyAI (they support some URLs)
          console.log('[Transcript T2.5] Trying AssemblyAI with YouTube URL...');
          const startRes = await fetch("https://api.assemblyai.com/v2/transcript", {
            method: "POST",
            headers: { "authorization": aaiKey, "content-type": "application/json" },
            body: JSON.stringify({ 
              audio_url: `https://www.youtube.com/watch?v=${videoId}`,
              language_detection: true 
            })
          });
          const startData = await startRes.json();
          if (startData.id && !startData.error) {
            console.log(`[Transcript T2.5] AssemblyAI job ${startData.id} — polling...`);
            for (let i = 0; i < 15; i++) {
              await new Promise(r => setTimeout(r, 3000));
              const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${startData.id}`, {
                headers: { "authorization": aaiKey }
              });
              const result = await pollRes.json();
              if (result.status === "completed" && result.text?.length >= 50) {
                transcript = result.text;
                transcriptSource = 'assemblyai_direct';
                console.log(`[Transcript T2.5] Done: ${transcript.length} chars`);
                break;
              }
              if (result.status === "error") {
                console.log(`[Transcript T2.5] Error: ${result.error}`);
                break;
              }
            }
          }
        } catch (err) {
          console.log(`[Transcript T2.5] Error: ${err.message}`);
        }
      }
    }

    if (!transcript || transcript.length < 50) {
      console.log('[Analyze] WARNING: No transcript available, analysis will be metadata-only');
    }

    // ── 3. Deep analysis with Gemini (using real transcript) ─────
    // Send full transcript to Gemini — use gemini-2.0-flash with 1M context window
    const maxTranscriptLen = 120000; // ~30K words = 2 hour video
    const truncatedTranscript = transcript
      ? (transcript.length > maxTranscriptLen
          ? transcript.substring(0, maxTranscriptLen) + '... [truncated from ' + transcript.length + ' chars]'
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
          generationConfig: { temperature: 0.5, maxOutputTokens: 100000, responseMimeType: "application/json" }
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