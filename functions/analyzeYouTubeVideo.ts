import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function extractVideoId(url) {
  // Handle youtube.com/shorts/ID
  const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  // Handle youtube.com/watch?v=ID
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // Handle youtu.be/ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // Handle youtube.com/embed/ID
  const embedMatch = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  return null;
}

function parseDuration(iso) {
  // PT1H2M3S -> seconds
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 60;
  const h = parseInt(match[1] || '0');
  const m = parseInt(match[2] || '0');
  const s = parseInt(match[3] || '0');
  return h * 3600 + m * 60 + s;
}

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

    // Fetch video details from YouTube Data API
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

    // Fetch channel info
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

    // Now use Gemini to do deep content analysis with the REAL metadata
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const analysisPrompt = `You are a YouTube content analyst. Analyze this video based on the real metadata below and provide a detailed content breakdown.

VIDEO METADATA:
- Title: "${snippet.title}"
- Channel: "${channelName}" (${subscriberCount.toLocaleString()} subscribers)
- Description: "${(snippet.description || '').substring(0, 1000)}"
- Tags: ${(snippet.tags || []).slice(0, 15).join(', ') || 'none'}
- Category: ${snippet.categoryId}
- Duration: ${durationSec} seconds (${isShort ? 'YouTube Short' : 'standard video'})
- Views: ${parseInt(stats.viewCount || '0').toLocaleString()}
- Likes: ${parseInt(stats.likeCount || '0').toLocaleString()}
- Comments: ${parseInt(stats.commentCount || '0').toLocaleString()}
- Published: ${snippet.publishedAt}
- URL: ${video_url}

Based on the title, description, tags, and metrics, provide a thorough content analysis. For a Short, estimate ~100-200 words of script. For longer videos, estimate ~150 words per minute.

Return a JSON object:
{
  "title": "exact video title",
  "estimated_duration_seconds": ${durationSec},
  "niche": "content niche category",
  "script_style": "writing/narration style description",
  "voiceover_style": "voice delivery style",
  "visual_style": "visual production style",
  "pacing": "content pacing description",
  "hook_technique": "how the video hooks viewers in first seconds",
  "content_structure": "overall content structure",
  "key_topics": ["topic1", "topic2", "topic3"],
  "estimated_word_count": ${Math.round(durationSec / 60 * 150)},
  "reconstructed_outline": "detailed outline of likely content flow",
  "tone_description": "overall tone and mood"
}

Fill in ALL fields with meaningful values based on the metadata. Never leave any field empty.`;

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: analysisPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096, responseMimeType: "application/json" }
        })
      }
    );

    const geminiData = await geminiResp.json();
    if (!geminiData.candidates?.[0]) {
      return Response.json({ error: 'AI analysis failed' }, { status: 500 });
    }

    const analysisText = geminiData.candidates[0].content.parts[0].text;
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch (e) {
      // Try to extract JSON
      const start = analysisText.indexOf('{');
      const end = analysisText.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        analysis = JSON.parse(analysisText.substring(start, end + 1));
      } else {
        return Response.json({ error: 'Failed to parse analysis' }, { status: 500 });
      }
    }

    // Ensure title is always the real title
    analysis.title = snippet.title;
    analysis.estimated_duration_seconds = durationSec;
    analysis.is_short = isShort;

    // Add raw YouTube stats for UI
    analysis.youtube_stats = {
      views: parseInt(stats.viewCount || '0'),
      likes: parseInt(stats.likeCount || '0'),
      comments: parseInt(stats.commentCount || '0'),
      channel: channelName,
      subscribers: subscriberCount,
      published: snippet.publishedAt,
    };

    return Response.json(analysis);
  } catch (error) {
    console.error('analyzeYouTubeVideo error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});