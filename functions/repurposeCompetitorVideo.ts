import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
const YT_API_KEY = Deno.env.get('YOUTUBE_API_KEY');

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
  if (!apiKey) return null;

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Transcript T1] Attempt ${attempt} for ${videoId}`);
      const response = await fetch('https://youtubetranscript.dev/api/v2/batch', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_ids: [videoId], lang: 'en', preserve_formatting: false })
      });
      if (!response.ok) return null;

      const data = await response.json();
      const rd = data.results?.[0]?.data;
      if (!rd) {
        if (data.results?.[0]?.status === 'processing' && attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 4000));
          continue;
        }
        return null;
      }

      // Try multiple paths
      if (typeof rd.transcript === 'string' && rd.transcript.length > 50) return rd.transcript;
      if (rd.transcript?.text?.length > 50) return rd.transcript.text;
      if (Array.isArray(rd.transcript)) {
        const joined = rd.transcript.map(s => s.text || s.utf8 || '').join(' ').replace(/\s+/g, ' ').trim();
        if (joined.length > 50) return joined;
      }
      if (Array.isArray(rd.transcript?.segments)) {
        const joined = rd.transcript.segments.map(s => s.text || s.utf8 || '').join(' ').replace(/\s+/g, ' ').trim();
        if (joined.length > 50) return joined;
      }
      if (typeof rd.text === 'string' && rd.text.length > 50) return rd.text;
      return null;
    } catch (e) {
      console.log(`[Transcript T1] Error: ${e.message}`);
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 3000));
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await pageRes.text();

    let captionTracks = null;
    const patterns = [
      /"captionTracks":\s*(\[.*?\])\s*[,}]/,
      /captionTracks\\?":\s*(\[.*?\])/,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          captionTracks = JSON.parse(match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
          break;
        } catch (_) {}
      }
    }

    if (!captionTracks?.length) {
      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.*?});/s);
      if (playerMatch) {
        try {
          const player = JSON.parse(playerMatch[1]);
          captionTracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        } catch (_) {}
      }
    }

    if (!captionTracks?.length) return null;

    const enManual = captionTracks.find(t => t.languageCode === 'en' && t.kind !== 'asr');
    const enAuto = captionTracks.find(t => t.languageCode === 'en' && t.kind === 'asr');
    const track = enManual || enAuto || captionTracks[0];
    if (!track?.baseUrl) return null;

    // Try JSON3 format first
    try {
      const json3Url = track.baseUrl + (track.baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';
      const json3Res = await fetch(json3Url);
      if (json3Res.ok) {
        const json3 = await json3Res.json();
        if (json3.events) {
          const text = json3.events
            .filter(e => e.segs)
            .flatMap(e => e.segs.map(s => s.utf8?.trim()).filter(Boolean))
            .join(' ').replace(/\s+/g, ' ').trim();
          if (text.length > 50) return text;
        }
      }
    } catch (_) {}

    // Fall back to XML
    const captionRes = await fetch(track.baseUrl);
    const captionXml = await captionRes.text();
    const textParts = [];
    const textRegex = /<text[^>]*>(.*?)<\/text>/gs;
    let match;
    while ((match = textRegex.exec(captionXml)) !== null) {
      const text = match[1]
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, '').trim();
      if (text) textParts.push(text);
    }
    const transcript = textParts.join(' ').replace(/\s+/g, ' ').trim();
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
    if (!text) return Response.json({ error: 'AI returned empty response' }, { status: 500 });

    const result = JSON.parse(text);

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