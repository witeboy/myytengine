import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// ANALYZE VIRAL MOMENTS — Claude-powered clip detection
// v2 — adopts video-use clipping strategy:
//   1. Silence gap detection: finds pauses >=0.5s, surfaces as [GAP] markers
//   2. Word-boundary snapping: cuts land on ASR word edges, never mid-word
//   3. 150ms pre-roll + 200ms post-roll padding (video-use spec)
// ══════════════════════════════════════════════════════════════════

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

async function callClaude(systemPrompt, userPrompt) {
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

// Silence gap detection — video-use strategy:
// "candidate cuts come from speech boundaries and silence gaps"
function findSilenceGaps(words, minGapSec) {
  const gaps = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= minGapSec) {
      gaps.push({
        at: words[i - 1].end + gap / 2,
        duration: gap,
        wordIdxBefore: i - 1,
      });
    }
  }
  return gaps;
}

// Build transcript with [GAP] markers at silence boundaries
// Claude uses these as preferred cut points
function buildTimestampedTranscript(words, silenceGaps) {
  const chunks = [];
  let currentChunk = '';
  let lastMarker = -10;
  let gapIdx = 0;

  for (const w of words) {
    while (gapIdx < silenceGaps.length && silenceGaps[gapIdx].at <= w.start) {
      const g = silenceGaps[gapIdx];
      if (currentChunk) chunks.push(currentChunk.trim());
      chunks.push(`[GAP ${g.duration.toFixed(1)}s — natural cut point]`);
      currentChunk = '';
      lastMarker = -10;
      gapIdx++;
    }

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

// Snap time to nearest word START — video-use: "never cut inside a word"
function snapToWordStart(targetTime, words) {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < words.length; i++) {
    const dist = Math.abs(words[i].start - targetTime);
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  }
  return words[bestIdx].start;
}

// Snap time to nearest word END
function snapToWordEnd(targetTime, words) {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < words.length; i++) {
    const dist = Math.abs(words[i].end - targetTime);
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  }
  return words[bestIdx].end;
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
      silence_gaps: incomingSilenceGaps = null,
    } = await req.json();

    if (!words?.length) {
      return Response.json({ error: 'words array required (from ASR)' }, { status: 400 });
    }

    const silenceGaps = incomingSilenceGaps ?? findSilenceGaps(words, 0.5);
    const naturalCutCount = silenceGaps.length;
    const timestampedTranscript = buildTimestampedTranscript(words, silenceGaps);

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

CUT POINT RULES (non-negotiable):
- [GAP Xs] markers are natural silence boundaries — PREFER these as clip start/end points
- Clip START should land just before a strong hook — aim for a [GAP] or start of a new thought
- Clip END should land just after the punchline completes — aim for a [GAP] or natural pause
- Never aim for a mid-word or mid-sentence time
- Each clip MUST be self-contained without context from the rest of the video
- Clips must be between ${min_clip_seconds}s and ${max_clip_seconds}s
- Return at most ${max_clips} clips, ranked by virality_score descending

Return ONLY valid JSON.`;

    const userPrompt = `Analyze this ${Math.round(duration / 60)}-minute video transcript and find the top viral clip moments.
${context ? `\nVideo context: ${context}` : ''}
${naturalCutCount > 0 ? `\nNatural silence gaps: ${naturalCutCount} — [GAP] markers are your preferred cut points.` : ''}

TIMESTAMPED TRANSCRIPT (with silence gap markers):
${timestampedTranscript}

Return JSON in this exact format:
{
  "clips": [
    {
      "title": "Short punchy title for this clip (max 60 chars)",
      "hook": "The opening line that grabs attention (first 10 words of the clip)",
      "start": 45.0,
      "end": 78.5,
      "duration": 33.5,
      "virality_score": 92,
      "virality_reason": "Why this moment is viral-worthy (1-2 sentences)",
      "category": "one of: hot_take | story | humor | insight | emotional | dramatic | quotable | controversial",
      "transcript_excerpt": "Key 1-2 sentence excerpt representing the peak moment"
    }
  ]
}

Sort clips by virality_score descending (best first).`;

    console.log(`Analyzing ${words.length} words, ${Math.round(duration)}s video, ${naturalCutCount} silence gaps...`);

    const result = await callClaude(systemPrompt, userPrompt);

    if (!result?.clips?.length) {
      return Response.json({ success: true, clips: [], message: 'No strong viral moments found' });
    }

    // Snap every clip to word boundaries — video-use: "never cut inside a word"
    // 150ms pre-roll + 200ms post-roll absorbs ASR timestamp drift
    const PRE_ROLL = 0.15;
    const POST_ROLL = 0.20;

    const snappedClips = result.clips.map((clip) => {
      const wordStart = snapToWordStart(clip.start, words);
      const wordEnd = snapToWordEnd(clip.end, words);
      const snappedStart = Math.max(0, wordStart - PRE_ROLL);
      const snappedEnd = Math.min(duration, wordEnd + POST_ROLL);
      const snappedDuration = snappedEnd - snappedStart;

      if (snappedDuration < min_clip_seconds || snappedDuration > max_clip_seconds + 5) {
        return null;
      }

      return {
        ...clip,
        start: Math.round(snappedStart * 1000) / 1000,
        end: Math.round(snappedEnd * 1000) / 1000,
        duration: Math.round(snappedDuration * 1000) / 1000,
      };
    }).filter(Boolean);

    snappedClips.sort((a, b) => (b.virality_score || 0) - (a.virality_score || 0));

    console.log(`Found ${snappedClips.length} viral clips`);
    snappedClips.forEach((c, i) => {
      console.log(`  #${i + 1} [${c.virality_score}] ${c.start.toFixed(2)}s to ${c.end.toFixed(2)}s "${c.title}"`);
    });

    return Response.json({
      success: true,
      clips: snappedClips,
      total_found: snappedClips.length,
      video_duration: duration,
      silence_gaps_used: naturalCutCount,
    });

  } catch (error) {
    console.error('analyzeViralMoments error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});