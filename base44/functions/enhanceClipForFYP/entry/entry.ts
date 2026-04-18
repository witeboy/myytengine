import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ══════════════════════════════════════════════════════════════════
// ENHANCE CLIP FOR FYP — Single Claude call for ALL enhancements (v2 — redeployed)
//
// Input:  { clip, words, video_duration, niche? }
//   - clip: { title, start, end, duration, virality_score, category, transcript_excerpt }
//   - words: ASR word array [{word, start, end}] for this clip's time range
//   - video_duration: total source video duration
//   - niche: optional context
//
// Output: All 5 layers of enhancement metadata in one response
// ══════════════════════════════════════════════════════════════════

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

async function callClaude(systemPrompt: string, userPrompt: string) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Claude API Error ${response.status}: ${err.error?.message || 'Unknown'}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  let jsonStr = text;
  if (text.includes('```json')) {
    jsonStr = text.split('```json')[1].split('```')[0].trim();
  } else if (text.includes('```')) {
    jsonStr = text.split('```')[1].split('```')[0].trim();
  }

  return JSON.parse(jsonStr);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { clip, words, video_duration, niche = '' } = await req.json();

    if (!clip || !words?.length) {
      return Response.json({ error: 'clip and words required' }, { status: 400 });
    }

    // Extract only the words within this clip's time range
    const clipWords = words.filter((w: any) => w.start >= clip.start && w.end <= clip.end);
    const clipTranscript = clipWords.map((w: any) => w.word).join(' ');

    const systemPrompt = `You are a world-class short-form video producer who has created viral content with billions of views across TikTok, YouTube Shorts, and Instagram Reels. You understand every element that makes content perform on the FYP algorithm.

Your job: take a raw clip and design EVERY enhancement needed to make it scroll-stopping, FYP-worthy content. You output precise, actionable production instructions.

You understand:
- Caption psychology (word-by-word highlight timing, font choice, placement)
- Hook engineering (the first 0.5s decides everything)
- Audio design (mood-matched music, punchline SFX, loudness standards)
- Vertical reframing (9:16 crop strategy from 16:9 source)
- SEO optimization (titles, hashtags, descriptions for each platform)
- Thumbnail/cover frame selection (the most expressive moment)

Return ONLY valid JSON.`;

    const userPrompt = `Enhance this ${clip.duration.toFixed(0)}s clip for maximum FYP performance.

CLIP INFO:
- Title: ${clip.title}
- Category: ${clip.category}
- Virality Score: ${clip.virality_score}/100
- Timerange: ${clip.start.toFixed(1)}s → ${clip.end.toFixed(1)}s
${niche ? `- Niche: ${niche}` : ''}

FULL CLIP TRANSCRIPT:
"${clipTranscript}"

Return JSON with ALL of these sections:

{
  "hook": {
    "text": "Bold scroll-stopping text for first 2 seconds (max 8 words, ALL CAPS works)",
    "style": "one of: shock | question | bold_claim | number | controversy | curiosity_gap",
    "display_duration": 2.5,
    "animation": "one of: slam | typewriter | fade_scale | glitch | bounce"
  },

  "captions": {
    "recommended_preset": "one of: hormozi_bold | mrbeast_pop | minimal_clean | karaoke_glow | ali_abdaal | subtitle_classic",
    "highlight_words": ["list", "of", "key", "words", "to", "emphasize"],
    "emoji_cues": [
      { "after_word_index": 12, "emoji": "🔥" },
      { "after_word_index": 25, "emoji": "💡" }
    ]
  },

  "reframe": {
    "strategy": "one of: center_lock | face_track | split_screen_top | rule_of_thirds_left | rule_of_thirds_right",
    "crop_focus_x_percent": 50,
    "crop_focus_y_percent": 35,
    "reasoning": "Brief explanation of why this crop strategy"
  },

  "audio": {
    "mood": "one of: energetic | chill | dramatic | inspirational | dark | playful | intense | emotional",
    "music_energy": "one of: low | medium | high",
    "music_genre_hint": "lo-fi hip hop, cinematic orchestra, trap beat, acoustic guitar, etc",
    "voice_boost_db": 3,
    "sfx_cues": [
      {
        "timestamp": 2.5,
        "type": "one of: whoosh | bass_drop | ding | vine_boom | record_scratch | swoosh | impact | sparkle | cash_register",
        "reason": "Why this SFX at this moment"
      }
    ],
    "normalize_lufs": -14
  },

  "cover_frame": {
    "timestamp": 12.5,
    "reason": "Why this frame is the most expressive/clickable moment"
  },

  "seo": {
    "title": "Primary title (max 100 chars, with emoji)",
    "ab_titles": [
      "A/B variant 1 — different hook angle",
      "A/B variant 2 — curiosity-driven",
      "A/B variant 3 — controversial/bold"
    ],
    "description": "Platform description with line breaks and CTAs (max 300 chars)",
    "hashtags": ["viral", "shorts", "fyp", "plus", "5-8", "niche", "specific", "tags"],
    "best_post_time": "one of: morning | afternoon | evening | night",
    "platform_notes": {
      "youtube_shorts": "Any YT-specific advice for this clip",
      "tiktok": "Any TikTok-specific advice",
      "instagram_reels": "Any Reels-specific advice"
    }
  },

  "progress_bar": {
    "enabled": true,
    "style": "one of: thin_top | gradient_top | dot_progress | countdown_text",
    "color": "hex color that matches the clip mood"
  }
}`;

    console.log(`🎬 Enhancing clip "${clip.title}" (${clip.duration.toFixed(0)}s, ${clipWords.length} words)...`);

    const result = await callClaude(systemPrompt, userPrompt);

    console.log(`✅ Enhancement complete for "${clip.title}"`);
    console.log(`   Hook: "${result.hook?.text}" | Captions: ${result.captions?.recommended_preset} | Mood: ${result.audio?.mood}`);
    console.log(`   SFX cues: ${result.audio?.sfx_cues?.length || 0} | Cover frame: ${result.cover_frame?.timestamp}s`);

    return Response.json({
      success: true,
      enhancement: result,
    });

  } catch (error) {
    console.error('❌ enhanceClipForFYP error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});