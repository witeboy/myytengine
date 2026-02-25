import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Style mapping: map genre strings to style_id
const STYLE_MAP = {
  'pop': '1', 'urban': '2', 'rock': '3', 'hip hop': '4', 'hip-hop': '4',
  'electronic': '5', 'edm': '5', 'reggae': '6', 'blues': '7', 'jazz': '8',
  'folk': '9', 'country': '10', 'classical': '11', 'orchestral': '11',
  'r&b': '12', 'rnb': '12', 'disco': '13', 'experimental': '15',
  'world': '17', 'ethnic': '18', 'cinematic': '11', 'ambient': '5',
};

// Mood mapping
const MOOD_MAP = {
  'relaxed': '1', 'calm': '1', 'chill': '1', 'ambient': '1',
  'happy': '2', 'upbeat': '2', 'cheerful': '2',
  'energetic': '3', 'powerful': '3', 'intense': '3',
  'romantic': '4', 'love': '4',
  'sad': '5', 'melancholic': '5', 'somber': '5', 'dark': '5',
  'angry': '6', 'aggressive': '6',
  'inspired': '7', 'inspirational': '7', 'epic': '7', 'dramatic': '7',
  'warm': '8', 'cozy': '8', 'comforting': '8',
  'passionate': '9', 'emotional': '9',
  'joyful': '10', 'fun': '10',
  'longing': '11', 'nostalgic': '11', 'reflective': '11', 'suspenseful': '7',
};

function findBestMatch(text, map) {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key)) return val;
  }
  return undefined;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { track_id, prompt, genre, mood } = await req.json();

    const apiKey = Deno.env.get('AI33_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
    }

    if (track_id) {
      await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'generating' });
    }

    // Determine style/mood IDs from genre/mood/prompt
    const styleId = findBestMatch(genre, STYLE_MAP) || findBestMatch(prompt, STYLE_MAP) || '11';
    const moodId = findBestMatch(mood, MOOD_MAP) || findBestMatch(prompt, MOOD_MAP) || '7';

    // Ensure idea is 20-300 chars
    let idea = prompt || 'Cinematic background music for storytelling narration';
    if (idea.length < 20) idea = idea + ' — cinematic instrumental';
    if (idea.length > 300) idea = idea.substring(0, 297) + '...';

    const title = (prompt || 'Background Track').substring(0, 40);

    console.log(`Generating music via AI33 MiniMax: style=${styleId}, mood=${moodId}`);
    console.log('Idea:', idea);

    const response = await fetch('https://api.ai33.pro/v1m/task/music-generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        title,
        idea,
        n: 1,
        style_id: styleId,
        mood_id: moodId,
        scenario_id: '5',
        rewrite_idea_switch: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI33 music generation error:', errText);
      if (track_id) {
        await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
      }
      return Response.json({ error: `Music generation error: ${errText}` }, { status: 500 });
    }

    const data = await response.json();
    console.log('AI33 music response:', JSON.stringify(data));

    if (data.success && data.task_id) {
      return Response.json({
        success: true,
        status: 'pending',
        task_id: data.task_id,
      });
    }

    console.error('Unexpected AI33 response:', JSON.stringify(data));
    if (track_id) {
      await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
    }
    return Response.json({ error: 'Unexpected response from music API', data }, { status: 500 });
  } catch (error) {
    console.error('generateMusic error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});