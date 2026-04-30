import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

// ══════════════════════════════════════════════════════════════════
// BEST MOMENT EXTRACTOR — Analyze transcript for viral Shorts candidates
// Input:  transcript text + word-level timestamps
// Output: 3-5 timestamped "best moments" scored for virality
// Competes with: Opus Clip, 1Click.ai, Klap
// ══════════════════════════════════════════════════════════════════

async function callGemini(apiKey, prompt, maxTokens = 8192) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Build a compact timestamped transcript from words[] so Gemini can reference timestamps
function buildTimestampedBlock(words, duration) {
  if (!words?.length) return '';
  // Group words into ~10-second windows for readability
  const WINDOW = 10;
  const blocks = [];
  let currentStart = 0;
  let currentText = [];
  for (const w of words) {
    if (w.start - currentStart >= WINDOW && currentText.length) {
      blocks.push({ start: currentStart, end: w.start, text: currentText.join(' ') });
      currentStart = w.start;
      currentText = [];
    }
    currentText.push(w.word);
  }
  if (currentText.length) blocks.push({ start: currentStart, end: duration || currentStart + WINDOW, text: currentText.join(' ') });
  return blocks.map(b => `[${b.start.toFixed(1)}s-${b.end.toFixed(1)}s] ${b.text}`).join('\n');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { transcript, words = [], duration = 0, max_clips = 5, clip_min_sec = 15, clip_max_sec = 60 } = await req.json();
    if (!transcript || transcript.length < 200) {
      return Response.json({ error: 'Transcript too short for moment extraction' }, { status: 400 });
    }

    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_KEY) return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    const timestampedBlock = words.length ? buildTimestampedBlock(words, duration) : `(no word timestamps — return relative position %)\n\n${transcript.slice(0, 12000)}`;

    const prompt = `You are a viral Shorts producer who has clipped 10,000+ videos for creators like Alex Hormozi, Lex Fridman, and MrBeast. You know exactly what makes a 15-60 second clip stop the scroll and generate 1M+ views on Shorts/Reels/TikTok.

FULL TRANSCRIPT WITH TIMESTAMPS:
"""
${timestampedBlock.slice(0, 40000)}
"""

Total duration: ${duration || 'unknown'}s

YOUR TASK: Identify the ${max_clips} BEST moments that could be standalone Shorts. Each clip must be ${clip_min_sec}-${clip_max_sec} seconds long.

WHAT MAKES A VIRAL MOMENT (score each on 10):
1. HOOK STRENGTH — does the opening sentence stop the scroll? (no "so...", "umm...", "basically...")
2. PAYOFF — does the clip deliver something shocking / counter-intuitive / emotional?
3. STANDALONE — can a viewer with zero context understand it?
4. QUOTABILITY — is there a "save this" line people will screenshot?
5. EMOTIONAL PEAK — laughter, anger, revelation, vulnerability
6. CURIOSITY LOOP — does it open + close a loop inside the clip?
7. SPECIFICITY — numbers, names, concrete examples (vs generic talk)

For each clip provide:
- exact start_time and end_time in SECONDS (matching the timestamps above)
- a killer SHORTS TITLE (under 60 chars, front-loaded keyword)
- the viral score breakdown (all 7 criteria, 1-10)
- the "hook sentence" — exact words the clip should START with (no "and", "so", "but")
- suggested caption style: "hormozi" (bold + yellow highlight) | "mrbeast" (giant + shadow) | "minimal"
- recommended platform: "tiktok" | "shorts" | "reels" | "all"
- a 1-sentence explanation of why this clip will go viral

Return JSON:
{
  "clips": [
    {
      "rank": 1,
      "start_time": 42.3,
      "end_time": 88.7,
      "duration": 46.4,
      "title": "The One Habit That Made Me a Millionaire",
      "hook_sentence": "Most people will never be rich because of this one habit",
      "overall_score": 9.2,
      "scores": {
        "hook": 9, "payoff": 10, "standalone": 9, "quotability": 9,
        "emotional_peak": 8, "curiosity_loop": 10, "specificity": 9
      },
      "caption_style": "hormozi",
      "platform": "all",
      "viral_reasoning": "Opens with pattern-break insult-compliment, delivers specific action in <60s"
    }
  ]
}

CRITICAL:
- Start times must snap to moments where a full sentence begins (not mid-word)
- End times must land on natural sentence endings (not cliffhangers unless intentional)
- Reject any clip that starts with filler: "so", "um", "and", "but", "yeah", "okay"
- Prefer clips where the timestamp range contains a COMPLETE story/point/insight
- If the video has fewer than ${max_clips} viral moments, return fewer — quality over quantity`;

    const raw = await callGemini(GEMINI_KEY, prompt, 8192);
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (_) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else return Response.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    const clips = (parsed.clips || []).map((c, i) => ({
      ...c,
      rank: c.rank || (i + 1),
      duration: c.duration || (c.end_time - c.start_time),
    })).filter(c => {
      const d = c.end_time - c.start_time;
      return d >= clip_min_sec - 2 && d <= clip_max_sec + 5;
    }).sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0));

    console.log(`[extractBestMoments] Found ${clips.length} viral candidates from ${duration}s source`);

    return Response.json({ success: true, clips, source_duration: duration });
  } catch (error) {
    console.error('extractBestMoments error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
