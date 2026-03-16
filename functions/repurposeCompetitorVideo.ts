import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
const YT_API_KEY = Deno.env.get('YOUTUBE_API_KEY');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { channel_id, video_title, video_url, competitor_name } = await req.json();
    if (!channel_id || !video_title) {
      return Response.json({ error: 'channel_id and video_title required' }, { status: 400 });
    }

    // Get channel info
    const channels = await base44.asServiceRole.entities.Channels.filter({ id: channel_id });
    const channel = channels[0];
    if (!channel) return Response.json({ error: 'Channel not found' }, { status: 404 });

    const niche = channel.niche_label || channel.niche || 'general';

    // Try to get video transcript via YouTube video ID
    let transcript = '';
    let videoId = '';
    
    // Extract video ID from URL or published field
    if (video_url) {
      const match = video_url.match(/(?:v=|\/vi\/|\/v\/|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
      if (match) videoId = match[1];
    }

    // Try fetching transcript/captions if we have a video ID
    if (videoId) {
      try {
        // Get captions list
        const captionsUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${YT_API_KEY}`;
        const captionsRes = await fetch(captionsUrl);
        if (captionsRes.ok) {
          const captionsData = await captionsRes.json();
          console.log(`Found ${captionsData.items?.length || 0} caption tracks`);
        }
      } catch (e) {
        console.log('Caption fetch skipped:', e.message);
      }

      // Try to get video description as additional context
      try {
        const vidUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YT_API_KEY}`;
        const vidRes = await fetch(vidUrl);
        if (vidRes.ok) {
          const vidData = await vidRes.json();
          const desc = vidData.items?.[0]?.snippet?.description || '';
          if (desc) transcript = desc.slice(0, 3000);
        }
      } catch (e) {
        console.log('Description fetch skipped:', e.message);
      }
    }

    // Use AI to generate a repurposed topic + summary
    if (!GEMINI_KEY) return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

    const existingTopics = await base44.asServiceRole.entities.ChannelTopics.filter({ channel_id });
    const existingTitles = existingTopics.map(t => t.title).slice(0, 20);

    const prompt = `You are a YouTube content strategist for a "${niche}" channel called "${channel.name}".

A competitor channel "${competitor_name || 'Unknown'}" has a top-performing video:
TITLE: "${video_title}"
${transcript ? `VIDEO DESCRIPTION/CONTEXT:\n${transcript}\n` : ''}

Your job: Create a REPURPOSED topic for OUR channel. Not a copy — a better, unique angle on the same subject that will outperform the original.

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
3. Whether this should be short-form or long-form
4. Strategic notes on why this repurpose will work

Respond with ONLY valid JSON:
{
  "title": "our unique repurposed title",
  "summary": "detailed content brief...",
  "format": "short" or "long",
  "strategic_notes": "why this will outperform the original",
  "original_angle": "what the competitor did",
  "our_angle": "what we'll do differently"
}`;

    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: 'application/json' }
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

    // Build the notes combining everything
    const fullNotes = [
      `🔄 REPURPOSED from: "${video_title}" by ${competitor_name || 'competitor'}`,
      '',
      `📝 CONTENT BRIEF:`,
      result.summary,
      '',
      `🎯 THEIR ANGLE: ${result.original_angle || 'N/A'}`,
      `💡 OUR ANGLE: ${result.our_angle || 'N/A'}`,
    ].join('\n');

    // Create the ChannelTopic
    const topic = await base44.asServiceRole.entities.ChannelTopics.create({
      channel_id,
      title: result.title,
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

    return Response.json({
      success: true,
      topic: {
        id: topic.id,
        title: result.title,
        format: result.format,
        summary: result.summary,
        strategic_notes: result.strategic_notes,
        original_angle: result.original_angle,
        our_angle: result.our_angle,
      }
    });
  } catch (error) {
    console.error('repurposeCompetitorVideo error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});