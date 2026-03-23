import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
const YT_API_KEY = Deno.env.get('YOUTUBE_API_KEY');
// v2: Fixed array response parsing, improved InnerTube extraction, URL unescaping

// ── Extract video ID from URL ────────────────────────────────────
function extractVideoId(url) {
  if (!url) return '';
  const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  const embedMatch = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  return '';
}

// ── Transcript Tier 1: YouTube Transcript API ────────────────────
async function getTranscriptAPI(videoId) {
  const apiKey = Deno.env.get("YOUTUBE_TRANSCRIPT_API_KEY");
  if (!apiKey) {
    console.log('[Transcript T1] No API key configured');
    return null;
  }

  const MAX_RETRIES = 3;
  
  // Try both GET and POST endpoints
  const endpoints = [
    { url: `https://youtubetranscript.dev/api/v2/transcript?video_id=${videoId}&lang=en`, method: 'GET' },
    { url: 'https://youtubetranscript.dev/api/v2/batch', method: 'POST', body: JSON.stringify({ video_ids: [videoId], lang: 'en', preserve_formatting: false }) },
    { url: `https://youtubetranscript.dev/api/transcript?video_id=${videoId}&lang=en`, method: 'GET' },
  ];

  for (const ep of endpoints) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[Transcript T1] ${ep.method} ${ep.url.split('?')[0]} attempt ${attempt}`);
        const fetchOpts = {
          method: ep.method,
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        };
        if (ep.body) fetchOpts.body = ep.body;
        
        const response = await fetch(ep.url, fetchOpts);
        console.log(`[Transcript T1] Status: ${response.status}`);
        
        if (!response.ok) {
          if (response.status === 405 || response.status === 404) break; // Wrong endpoint, try next
          if (attempt < MAX_RETRIES) { await new Promise(r => setTimeout(r, 3000)); continue; }
          break;
        }

        const data = await response.json();
        
        // Handle direct transcript response
        if (typeof data.transcript === 'string' && data.transcript.length > 50) return data.transcript;
        if (data.transcript?.text?.length > 50) return data.transcript.text;
        if (typeof data.text === 'string' && data.text.length > 50) return data.text;
        if (Array.isArray(data.transcript)) {
          const joined = data.transcript.map(s => s.text || s.utf8 || '').join(' ').replace(/\s+/g, ' ').trim();
          if (joined.length > 50) return joined;
        }
        
        // Handle batch response
        const rd = data.results?.[0]?.data;
        if (rd) {
          if (typeof rd.transcript === 'string' && rd.transcript.length > 50) return rd.transcript;
          if (rd.transcript?.text?.length > 50) return rd.transcript.text;
          if (Array.isArray(rd.transcript)) {
            const joined = rd.transcript.map(s => s.text || s.utf8 || '').join(' ').replace(/\s+/g, ' ').trim();
            if (joined.length > 50) return joined;
          }
          if (typeof rd.text === 'string' && rd.text.length > 50) return rd.text;
        }
        
        if (data.results?.[0]?.status === 'processing' && attempt < MAX_RETRIES) {
          console.log(`[Transcript T1] Processing, retrying...`);
          await new Promise(r => setTimeout(r, 4000));
          continue;
        }
        
        console.log(`[Transcript T1] No transcript in response: ${JSON.stringify(data).slice(0, 300)}`);
        break; // Try next endpoint
      } catch (e) {
        console.log(`[Transcript T1] Error: ${e.message}`);
        if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  return null;
}

// ── Transcript Tier 1.5: Free InnerTube captions ─────────────────
async function getTranscriptInnerTube(videoId) {
  try {
    console.log(`[Transcript T1.5] InnerTube for ${videoId}`);
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    console.log(`[Transcript T1.5] Page fetch status: ${pageRes.status}, content-length: ${pageRes.headers.get('content-length')}`);
    const html = await pageRes.text();
    console.log(`[Transcript T1.5] HTML length: ${html.length}, has captionTracks: ${html.includes('captionTracks')}, has playerResponse: ${html.includes('ytInitialPlayerResponse')}`);

    let captionTracks = null;
    
    // Strategy 1: Extract ytInitialPlayerResponse using balanced brace matching
    const playerStart = html.indexOf('ytInitialPlayerResponse');
    if (playerStart !== -1) {
      const eqIdx = html.indexOf('=', playerStart);
      if (eqIdx !== -1) {
        const jsonStart = html.indexOf('{', eqIdx);
        if (jsonStart !== -1) {
          // Find matching closing brace
          let depth = 0, i = jsonStart;
          for (; i < html.length && i < jsonStart + 500000; i++) {
            if (html[i] === '{') depth++;
            else if (html[i] === '}') { depth--; if (depth === 0) break; }
          }
          if (depth === 0) {
            const jsonStr = html.substring(jsonStart, i + 1);
            try {
              const player = JSON.parse(jsonStr);
              captionTracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
              if (captionTracks?.length) {
                console.log(`[Transcript T1.5] Found ${captionTracks.length} caption tracks via playerResponse`);
              } else {
                console.log(`[Transcript T1.5] playerResponse parsed OK but no captionTracks (video may not have captions)`);
              }
            } catch (e) {
              console.log(`[Transcript T1.5] playerResponse JSON parse failed: ${e.message.slice(0, 100)}`);
            }
          }
        }
      }
    }
    
    // Strategy 2: Direct regex for captionTracks
    if (!captionTracks?.length) {
      const directPatterns = [
        /"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*,\s*"/,
        /captionTracks['"]\s*:\s*(\[[\s\S]*?\])/,
      ];
      for (const pattern of directPatterns) {
        const match = html.match(pattern);
        if (match) {
          try {
            const cleaned = match[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"');
            captionTracks = JSON.parse(cleaned);
            if (captionTracks?.length) {
              console.log(`[Transcript T1.5] Found ${captionTracks.length} caption tracks via regex`);
              break;
            }
          } catch (_) {}
        }
      }
    }

    if (!captionTracks?.length) {
      console.log(`[Transcript T1.5] No caption tracks found in page`);
      return null;
    }

    const enManual = captionTracks.find(t => t.languageCode === 'en' && t.kind !== 'asr');
    const enAuto = captionTracks.find(t => t.languageCode === 'en' && t.kind === 'asr');
    const track = enManual || enAuto || captionTracks[0];
    console.log(`[Transcript T1.5] Selected track: lang=${track?.languageCode}, kind=${track?.kind}, hasBaseUrl=${!!track?.baseUrl}`);
    if (!track?.baseUrl) {
      console.log(`[Transcript T1.5] No baseUrl on track`);
      return null;
    }

    // Fix escaped URLs
    const baseUrl = track.baseUrl.replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
    console.log(`[Transcript T1.5] Caption URL: ${baseUrl.slice(0, 200)}`);

    // Try JSON3 format first
    try {
      const json3Url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';
      const json3Res = await fetch(json3Url);
      console.log(`[Transcript T1.5] JSON3 status: ${json3Res.status}`);
      if (json3Res.ok) {
        const json3 = await json3Res.json();
        if (json3.events) {
          const text = json3.events
            .filter(e => e.segs)
            .flatMap(e => e.segs.map(s => s.utf8?.trim()).filter(Boolean))
            .join(' ').replace(/\s+/g, ' ').trim();
          console.log(`[Transcript T1.5] JSON3 extracted ${text.length} chars`);
          if (text.length > 50) return text;
        }
      }
    } catch (e) {
      console.log(`[Transcript T1.5] JSON3 error: ${e.message}`);
    }

    // Fall back to XML
    console.log(`[Transcript T1.5] Trying XML fallback`);
    const captionRes = await fetch(baseUrl);
    console.log(`[Transcript T1.5] XML status: ${captionRes.status}`);
    const captionXml = await captionRes.text();
    console.log(`[Transcript T1.5] XML length: ${captionXml.length}, starts with: ${captionXml.slice(0, 100)}`);
    const textParts = [];
    const textRegex = /<text[^>]*>(.*?)<\/text>/gs;
    let xmlMatch;
    while ((xmlMatch = textRegex.exec(captionXml)) !== null) {
      const t = xmlMatch[1]
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, '').trim();
      if (t) textParts.push(t);
    }
    const transcript = textParts.join(' ').replace(/\s+/g, ' ').trim();
    console.log(`[Transcript T1.5] XML extracted ${transcript.length} chars from ${textParts.length} segments`);
    return transcript.length > 50 ? transcript : null;
  } catch (e) {
    console.log(`[Transcript T1.5] Error: ${e.message}`);
    return null;
  }
}

// ── Main handler ─────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { channel_id, video_title, video_url, video_id: passedVideoId, competitor_name } = await req.json();
    if (!channel_id || !video_title) {
      return Response.json({ error: 'channel_id and video_title required' }, { status: 400 });
    }

    // Get channel info
    const channels = await base44.asServiceRole.entities.Channels.filter({ id: channel_id });
    const channel = channels[0];
    if (!channel) return Response.json({ error: 'Channel not found' }, { status: 404 });

    const niche = channel.niche_label || channel.niche || 'general';

    // Determine video ID
    let videoId = passedVideoId || '';
    if (!videoId && video_url) {
      videoId = extractVideoId(video_url);
    }

    console.log(`[Repurpose] Video: "${video_title}" | ID: ${videoId || 'none'} | Competitor: ${competitor_name}`);

    // ── Fetch transcript using multi-tier approach ────────────────
    let transcript = '';
    let transcriptSource = 'none';
    let videoDescription = '';

    if (videoId) {
      // Fetch video metadata (description, tags) for extra context
      try {
        const vidUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YT_API_KEY}`;
        console.log(`[Repurpose] Fetching video metadata for ${videoId}`);
        const vidRes = await fetch(vidUrl);
        if (vidRes.ok) {
          const vidData = await vidRes.json();
          const snippet = vidData.items?.[0]?.snippet;
          videoDescription = snippet?.description || '';
          console.log(`[Repurpose] Got description: ${videoDescription.length} chars, tags: ${(snippet?.tags || []).length}`);
          // Also grab tags for context
          if (snippet?.tags?.length) {
            videoDescription += '\n\nTags: ' + snippet.tags.slice(0, 20).join(', ');
          }
        } else {
          console.log(`[Repurpose] Video metadata response: ${vidRes.status}`);
        }
      } catch (e) {
        console.log('Description fetch skipped:', e.message);
      }

      // Tier 1: YouTube Transcript API
      transcript = await getTranscriptAPI(videoId);
      if (transcript) {
        transcriptSource = 'youtube_captions';
        console.log(`[Repurpose] ✅ Transcript from captions: ${transcript.length} chars`);
      } else {
        console.log(`[Repurpose] ❌ Tier 1 (Transcript API) returned null`);
      }

      // Tier 1.5: InnerTube free captions
      if (!transcript) {
        transcript = await getTranscriptInnerTube(videoId);
        if (transcript) {
          transcriptSource = 'youtube_innertube';
          console.log(`[Repurpose] ✅ Transcript from InnerTube: ${transcript.length} chars`);
        } else {
          console.log(`[Repurpose] ❌ Tier 1.5 (InnerTube) returned null`);
        }
      }
    }

    // Truncate transcript for prompt (keep first 15K chars for context)
    const maxLen = 15000;
    const truncatedTranscript = transcript
      ? (transcript.length > maxLen ? transcript.substring(0, maxLen) + '...' : transcript)
      : '';

    if (!transcript) {
      console.log('[Repurpose] No transcript available, using metadata only');
    }

    // ── AI repurpose generation ──────────────────────────────────
    if (!GEMINI_KEY) return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

    const existingTopics = await base44.asServiceRole.entities.ChannelTopics.filter({ channel_id });
    const existingTitles = existingTopics.map(t => t.title).slice(0, 20);

    const prompt = `You are a YouTube content strategist for a "${niche}" channel called "${channel.name}".

A competitor channel "${competitor_name || 'Unknown'}" has a video:
TITLE: "${video_title}"
${videoDescription ? `DESCRIPTION:\n${videoDescription.slice(0, 2000)}\n` : ''}
${truncatedTranscript ? `FULL TRANSCRIPT (${transcript.length} chars):\n"""\n${truncatedTranscript}\n"""\n` : '(No transcript available — use title and description only)'}

Your job: Create a REPURPOSED topic for OUR channel. Not a copy — a better, unique angle on the same subject.

${truncatedTranscript ? `IMPORTANT: You have the competitor's full transcript. Use it to:
- Understand exactly what they covered and HOW they covered it
- Identify their hook, structure, key arguments, and emotional beats
- Find what they MISSED, oversimplified, or got wrong
- Create a content brief that covers the topic MORE thoroughly from a DIFFERENT angle` : ''}

EXISTING TOPICS WE ALREADY HAVE (avoid duplicates):
${existingTitles.join('\n')}

Create:
1. A compelling, unique title for OUR version (different angle/hook than the original)
2. A detailed content brief/summary (200-400 words) covering:
   - The unique angle we'll take vs the competitor
   - Key points to cover
   - Hook strategy for the first 5 seconds
   - What makes our version better/different
   - Target emotional triggers
${truncatedTranscript ? '3. A concise summary of what the competitor actually said in their video (100-200 words)\n4. Their specific angle/approach based on the transcript' : '3. What the competitor likely covers based on the title'}
5. Whether this should be short-form or long-form
6. Strategic notes on why this repurpose will work

Respond with ONLY valid JSON:
{
  "title": "our unique repurposed title",
  "summary": "detailed content brief...",
  "format": "short" or "long",
  "strategic_notes": "why this will outperform the original",
  "original_angle": "what the competitor actually covered/their approach",
  "our_angle": "what we'll do differently and why it's better",
  "competitor_summary": "summary of what the competitor said in their video"
}`;

    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096, responseMimeType: 'application/json' }
        })
      }
    );

    if (!gemRes.ok) {
      const errText = await gemRes.text();
      return Response.json({ error: 'AI generation failed: ' + errText.slice(0, 200) }, { status: 500 });
    }

    const gemData = await gemRes.json();
    const text = gemData.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log(`[Repurpose] Gemini raw response length: ${text?.length || 0}`);
    console.log(`[Repurpose] Gemini raw (first 500): ${(text || '').slice(0, 500)}`);
    if (!text) {
      console.log(`[Repurpose] Gemini full response:`, JSON.stringify(gemData).slice(0, 1000));
      return Response.json({ error: 'AI returned empty response' }, { status: 500 });
    }

    let result;
    try {
      let parsed = JSON.parse(text);
      // Handle if Gemini returns an array instead of object
      if (Array.isArray(parsed)) {
        parsed = parsed[0] || {};
      }
      result = parsed;
    } catch (parseErr) {
      // Try to extract JSON from markdown
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        let parsed = JSON.parse(jsonMatch[1].trim());
        if (Array.isArray(parsed)) parsed = parsed[0] || {};
        result = parsed;
      } else {
        console.error('[Repurpose] JSON parse failed:', parseErr.message);
        return Response.json({ error: 'Failed to parse AI response' }, { status: 500 });
      }
    }
    console.log(`[Repurpose] Parsed result keys: ${Object.keys(result).join(', ')}, title: ${(result.title || '').slice(0, 80)}`);

    const topicTitle = result.title || `Repurposed: ${video_title}`;
    const fullNotes = [
      `🔄 REPURPOSED from: "${video_title}" by ${competitor_name || 'competitor'}`,
      '',
      `📝 CONTENT BRIEF:`,
      result.summary || '',
      '',
      result.competitor_summary ? `📺 COMPETITOR'S VIDEO SUMMARY:\n${result.competitor_summary}\n` : '',
      `🎯 THEIR ANGLE: ${result.original_angle || 'N/A'}`,
      `💡 OUR ANGLE: ${result.our_angle || 'N/A'}`,
    ].filter(Boolean).join('\n');

    // Create the ChannelTopic
    const topic = await base44.asServiceRole.entities.ChannelTopics.create({
      channel_id,
      title: topicTitle,
      format: result.format === 'long' ? 'long' : 'short',
      status: 'queued',
      notes: fullNotes,
      ai_notes: result.strategic_notes || '',
      priority: 0,
      trend_score: 85,
    });

    // Update channel topic count
    const currentCount = channel.total_topics || 0;
    await base44.asServiceRole.entities.Channels.update(channel_id, {
      total_topics: currentCount + 1,
    });

    console.log(`[Repurpose] Created topic "${topicTitle}" | Transcript: ${transcriptSource} (${transcript?.length || 0} chars)`);

    return Response.json({
      success: true,
      transcript_source: transcriptSource,
      transcript_length: transcript?.length || 0,
      topic: {
        id: topic.id,
        title: topicTitle,
        format: result.format || 'short',
        summary: result.summary || '',
        strategic_notes: result.strategic_notes || '',
        original_angle: result.original_angle || '',
        our_angle: result.our_angle || '',
        competitor_summary: result.competitor_summary || '',
      }
    });
  } catch (error) {
    console.error('repurposeCompetitorVideo error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});