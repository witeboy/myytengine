import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// ANALYZE VIRAL MOMENTS — Claude-powered clip detection
//
// Input:  { transcript, words, duration, max_clips?, min_clip_seconds?, max_clip_seconds?, context? }
//   - transcript: full text of the video
//   - words: [{word, start, end}, ...] from ASR with timestamps
//   - duration: total video duration in seconds
//   - max_clips: max number of clips to extract (default 8)
//   - min_clip_seconds: minimum clip length (default 15)
//   - max_clip_seconds: maximum clip length (default 90)
//   - context: optional context about the video (niche, topic)
//
// Output: { clips: [{ title, hook, start, end, duration, virality_score,
//           virality_reason, category, transcript_excerpt }] }
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

  // Parse JSON from response
  let jsonStr = text;
  if (text.includes('```json')) {
    jsonStr = text.split('```json')[1].split('```')[0].trim();
  } else if (text.includes('```')) {
    jsonStr = text.split('```')[1].split('```')[0].trim();
  }

  return JSON.parse(jsonStr);
}

function buildTimestampedTranscript(words: Array<{word: string, start: number, end: number}>) {
  // Build paragraph-style transcript with timestamp markers every ~10 seconds
  const chunks: string[] = [];
  let currentChunk = '';
  let lastMarker = -10;

  for (const w of words) {
    if (w.start - lastMarker >= 10) {
      if (currentChunk) chunks.push(currentChunk.trim());
      const mins = Math.floor(w.start / 60);
      const secs = Math.floor(w.start % 60);
      currentChunk = `[${mins}:${secs.toString().padStart(2, '0')}] `;
      lastMarker = w.start;
    }
    currentChunk += w.word + ' ';
  }
  if (currentChunk) chunks.push(currentChunk.trim());

  return chunks.join('\n');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      transcript,
      words,
      duration,
      max_clips = 8,
      min_clip_seconds = 15,
      max_clip_seconds = 90,
      context = '',
    } = await req.json();

    if (!words?.length) {
      return Response.json({ error: 'words array required (from ASR)' }, { status: 400 });
    }

    // Build timestamped transcript for Claude
    const timestampedTranscript = buildTimestampedTranscript(words);

    const systemPrompt = `You are a viral content strategist and video editor with deep expertise in YouTube Shorts, TikTok, and Instagram Reels. Your job is to analyze a long-form video transcript and identify the most "clippable" viral moments.

You understand what makes content go viral:
- Emotional peaks (surprise, humor, outrage, awe, controversy)
- Strong standalone hooks that grab attention in the first 2 seconds
- Complete mini-stories or self-contained insights
- Contrarian or counterintuitive takes
- Quotable one-liners or "mic drop" moments
- Dramatic reveals or plot twists
- High-energy delivery shifts
- Relatable pain points with satisfying resolutions
- "Wait, what?" moments that stop the scroll

CRITICAL RULES:
- Each clip MUST be self-contained — it should make sense WITHOUT context from the rest of the video
- Prefer moments with natural energy/emotion shifts over flat monologues
- The clip's START should be a natural hook (question, bold claim, surprising fact)
- The clip's END should feel complete (punchline, conclusion, revelation) — no mid-sentence cuts
- Use the [M:SS] timestamp markers in the transcript to determine accurate start/end times
- Timestamps are in SECONDS in your output (convert from M:SS format)
- Clips must be between ${min_clip_seconds}s and ${max_clip_seconds}s
- Return at most ${max_clips} clips
- Rank by virality_score (0-100) based on likely engagement

Return ONLY valid JSON.`;

    const userPrompt = `Analyze this ${Math.round(duration / 60)}-minute video transcript and find the top viral clip moments.
${context ? `\nVideo context: ${context}` : ''}

TIMESTAMPED TRANSCRIPT:
${timestampedTranscript}

Return JSON in this exact format:
{
  "clips": [
    {
      "title": "Short punchy title for this clip (max 60 chars)",
      "hook": "The opening line/hook that grabs attention (first 10 words of the clip)",
      "start": 45.0,
      "end": 78.5,
      "duration": 33.5,
      "virality_score": 92,
      "virality_reason": "Why this moment is viral-worthy (1-2 sentences)",
      "category": "one of: hot_take | story | humor | insight | emotional | dramatic | quotable | controversial",
      "transcript_excerpt": "Key 1-2 sentence excerpt from this clip that represents the peak moment"
    }
  ]
}

Sort clips by virality_score descending (best first).`;

    console.log(`🧠 Analyzing ${words.length} words, ${Math.round(duration)}s video for viral moments...`);

    const result = await callClaude(systemPrompt, userPrompt);

    if (!result?.clips?.length) {
      return Response.json({
        success: true,
        clips: [],
        message: 'No strong viral moments found in this content',
      });
    }

    // Post-process: snap start/end to nearest word boundaries for precision
    const snappedClips = result.clips.map((clip: any) => {
      // Find the closest ASR word to the start timestamp
      let startWord = words.reduce((best: any, w: any) =>
        Math.abs(w.start - clip.start) < Math.abs(best.start - clip.start) ? w : best
      , words[0]);

      // Find the closest ASR word to the end timestamp
      let endWord = words.reduce((best: any, w: any) =>
        Math.abs(w.end - clip.end) < Math.abs(best.end - clip.end) ? w : best
      , words[words.length - 1]);

      // Add 0.3s padding before start and 0.5s after end for natural feel
      const snappedStart = Math.max(0, startWord.start - 0.3);
      const snappedEnd = Math.min(duration, endWord.end + 0.5);

      return {
        ...clip,
        start: Math.round(snappedStart * 100) / 100,
        end: Math.round(snappedEnd * 100) / 100,
        duration: Math.round((snappedEnd - snappedStart) * 100) / 100,
      };
    });

    // Sort by virality score descending
    snappedClips.sort((a: any, b: any) => (b.virality_score || 0) - (a.virality_score || 0));

    console.log(`✅ Found ${snappedClips.length} viral clips`);
    snappedClips.forEach((c: any, i: number) => {
      console.log(`  #${i + 1} [${c.virality_score}] ${c.start.toFixed(1)}s → ${c.end.toFixed(1)}s "${c.title}"`);
    });

    return Response.json({
      success: true,
      clips: snappedClips,
      total_found: snappedClips.length,
      video_duration: duration,
    });

  } catch (error) {
    console.error('❌ analyzeViralMoments error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
