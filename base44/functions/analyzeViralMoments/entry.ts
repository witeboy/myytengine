import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// ANALYZE VIRAL MOMENTS — Gemini-powered clip detection (Claude fallback)
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
//           virality_reason, category, transcript_excerpt }], model_used }
// ══════════════════════════════════════════════════════════════════

const GEMINI_MODEL = 'gemini-3.1-pro-preview';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// ── Gemini (primary) ────────────────────────────────────────────
async function callGemini(systemPrompt, userPrompt) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const response = await fetch(`${url}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
        temperature: 0.4,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    const msg = err.error?.message || JSON.stringify(err);
    throw new Error(`Gemini API Error ${response.status}: ${msg}`);
  }

  const data = await response.json();

  // Join ALL text parts (thinking models may split output across parts),
  // skipping internal "thought" parts.
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  if (!text) throw new Error('Gemini returned empty response');

  // responseMimeType:"application/json" should give clean JSON, but parse defensively
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```json?\s*/, '').replace(/```\s*$/, '').trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch (_) {
    // Extra content after/around the JSON — extract the first BALANCED object
    const obj = extractBalancedJson(jsonStr);
    if (obj) return obj;
    console.error('[Gemini raw output head]', jsonStr.slice(0, 800));
    console.error('[Gemini raw output tail]', jsonStr.slice(-800));
    throw new Error('Gemini returned unparseable JSON');
  }
}

// Scan for the first balanced {...} block (string-aware) and parse it.
function extractBalancedJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { if (inStr) esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch (_) { return null; }
      }
    }
  }
  return null;
}

// ── Claude (fallback) ───────────────────────────────────────────
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
      max_tokens: 8192,
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

// ── Base44 built-in LLM (primary) ───────────────────────────────
async function callBase44LLM(base44, systemPrompt, userPrompt) {
  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `${systemPrompt}\n\n${userPrompt}`,
    response_json_schema: {
      type: 'object',
      properties: {
        clips: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              hook: { type: 'string' },
              start: { type: 'number' },
              end: { type: 'number' },
              duration: { type: 'number' },
              virality_score: { type: 'number' },
              virality_reason: { type: 'string' },
              category: { type: 'string' },
              content_type: { type: 'string' },
              ending_reason: { type: 'string' },
              transcript_excerpt: { type: 'string' },
            },
          },
        },
      },
    },
  });
  if (!result?.clips) throw new Error('Base44 LLM returned no clips field');
  return result;
}

// ── Unified caller with fallback ────────────────────────────────
async function callAI(base44, systemPrompt, userPrompt) {
  const errors = [];

  // 1. Base44 built-in LLM first
  try {
    console.log(`🟣 Trying Base44 built-in LLM...`);
    const result = await callBase44LLM(base44, systemPrompt, userPrompt);
    console.log(`✅ Base44 LLM succeeded`);
    return { result, model_used: 'base44_llm' };
  } catch (b44Err) {
    errors.push(`Base44 LLM: ${b44Err.message}`);
    console.warn(`⚠️ Base44 LLM failed: ${b44Err.message}`);
  }

  // 2. Fall back to Gemini
  try {
    console.log(`🟢 Falling back to Gemini (${GEMINI_MODEL})...`);
    const result = await callGemini(systemPrompt, userPrompt);
    console.log(`✅ Gemini succeeded`);
    return { result, model_used: GEMINI_MODEL };
  } catch (geminiErr) {
    errors.push(`Gemini: ${geminiErr.message}`);
    console.warn(`⚠️ Gemini failed: ${geminiErr.message}`);
  }

  // 3. Fall back to Claude
  try {
    console.log(`🔵 Falling back to Claude (${CLAUDE_MODEL})...`);
    const result = await callClaude(systemPrompt, userPrompt);
    console.log(`✅ Claude fallback succeeded`);
    return { result, model_used: CLAUDE_MODEL };
  } catch (claudeErr) {
    errors.push(`Claude: ${claudeErr.message}`);
    console.error(`❌ All AI providers failed`);
    throw new Error(`All AI providers failed. ${errors.join('. ')}`);
  }
}

function buildTimestampedTranscript(words) {
  // Build paragraph-style transcript with timestamp markers every ~10 seconds
  const chunks = [];
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

    // Build timestamped transcript for AI
    const timestampedTranscript = buildTimestampedTranscript(words);

    const systemPrompt = `You are an elite short-form content strategist who has studied thousands of viral YouTube Shorts, TikToks, and Instagram Reels. You identify clips using proven retention mechanics — grounded analysis, not guesswork.

SCORING FRAMEWORK — weight each clip on these retention-backed dimensions:
1. HOOK STRENGTH (30%) — The first 2 seconds must be a pattern interrupt: a bold claim, open question, shocking number, or mid-conflict entry. If the opening sentence would not stop a scroll, the clip fails regardless of what follows.
2. PAYOFF (20%) — The clip opens a curiosity loop early and CLOSES it before ending. No unresolved setups, no "watch the full video" energy.
3. EMOTIONAL PEAK (20%) — Surprise, outrage, awe, humor, or heartbreak with a clear intensity spike. Flat informational segments score low.
4. SHARE TRIGGERS (15%) — Identity signaling ("this is so me"), controversy, high practical value, or awe. Something a viewer would send to a friend.
5. LOOPABILITY (15%) — The ending flows naturally back into the opening, driving rewatches (a key ranking signal on all three platforms).

CALIBRATION — be harsh and honest, do not inflate scores:
- 85-100: exceptional, genuine viral potential (rare — at most 1-2 per video)
- 70-84: strong, worth posting
- 50-69: decent but unremarkable
- below 50: DO NOT return it — fewer great clips beat many mediocre ones

CRITICAL RULES:
- Each clip MUST be self-contained — it should make sense WITHOUT context from the rest of the video
- Prefer moments with natural energy/emotion shifts over flat monologues
- The clip's START must begin at a complete sentence, commentary phrase, scene beat, or natural breath before the hook — never on a dangling conjunction or pronoun
- The clip's END must resolve the thought: a full sentence ending, punchline, conclusion, revelation, commentary pause, completed sports play, reaction after the play, or completed movie scene beat
- Never cut immediately after a goal, basket, tackle, reveal, or punchline; include the outcome/reaction and stop at the next natural break
- Detect podcasts/interviews, football/soccer, basketball/other sports, and movie/TV footage automatically. Sports clips prioritize complete plays with setup → action → result; movie clips prioritize self-contained scene turns without relying on earlier dialogue
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
      "category": "one of: hot_take | story | humor | insight | emotional | dramatic | quotable | controversial | sports_highlight | movie_scene",
      "content_type": "one of: conversation | sports | movie | general",
      "ending_reason": "The exact completed sentence, play outcome, reaction, or scene beat that makes this a natural ending",
      "transcript_excerpt": "Key 1-2 sentence excerpt from this clip that represents the peak moment"
    }
  ]
}

Sort clips by virality_score descending (best first).`;

    console.log(`🧠 Analyzing ${words.length} words, ${Math.round(duration)}s video for viral moments...`);

    const { result, model_used } = await callAI(base44, systemPrompt, userPrompt);

    if (!result?.clips?.length) {
      return Response.json({
        success: true,
        clips: [],
        message: 'No strong viral moments found in this content',
        model_used,
      });
    }

    // Snap AI ranges to real linguistic/play boundaries instead of arbitrary nearby words.
    const sentenceEnd = word => /[.!?][\"')\]]*$/.test(String(word.word || ''));
    const pauseAfter = index => index >= words.length - 1 ? 10 : words[index + 1].start - words[index].end;
    const snappedClips = result.clips.map(clip => {
      const isSports = clip.content_type === 'sports' || clip.category === 'sports_highlight';
      const hasPauseAfter = index => pauseAfter(index) >= (isSports ? 0.45 : 0.65);
      const naturalBreak = index => sentenceEnd(words[index]) || hasPauseAfter(index);
      let startIndex = words.findIndex(word => word.start >= clip.start);
      if (startIndex < 0) startIndex = 0;
      for (let index = startIndex - 1; index >= 0 && words[startIndex].start - words[index].end <= 8; index--) {
        if (naturalBreak(index)) { startIndex = index + 1; break; }
      }

      let endIndex = words.findIndex(word => word.end >= clip.end);
      if (endIndex < 0) endIndex = words.length - 1;
      const latestNaturalEnd = Math.min(duration, words[startIndex].start + max_clip_seconds + 10);
      let resolvedEnd = -1;
      for (let index = endIndex; index < words.length && words[index].end <= latestNaturalEnd; index++) {
        if (naturalBreak(index)) { resolvedEnd = index; break; }
      }
      if (resolvedEnd < 0) {
        for (let index = endIndex; index >= startIndex; index--) {
          if (naturalBreak(index) && words[index].end - words[startIndex].start >= min_clip_seconds) { resolvedEnd = index; break; }
        }
      }
      endIndex = resolvedEnd >= 0 ? resolvedEnd : endIndex;
      // Sports commentary often pauses once at the play and again after the reaction.
      // Include that second beat when it is close, preventing cuts immediately after a goal or basket.
      if (isSports) {
        const reactionLimit = Math.min(words.length - 1, endIndex + 30);
        for (let index = endIndex + 1; index <= reactionLimit && words[index].end - words[endIndex].end <= 6; index++) {
          if (naturalBreak(index) && words[index].end - words[endIndex].end >= 1) { endIndex = index; break; }
        }
      }
      const snappedStart = Math.max(0, words[startIndex].start - 0.25);
      const snappedEnd = Math.min(duration, words[endIndex].end + (hasPauseAfter(endIndex) ? 0.35 : 0.6));
      return { ...clip, start: Math.round(snappedStart * 100) / 100, end: Math.round(snappedEnd * 100) / 100, duration: Math.round((snappedEnd - snappedStart) * 100) / 100 };
    });

    // Enforce hard minimum — respect the caller's requested min length (small tolerance)
    const HARD_MIN = Math.max(10, min_clip_seconds - 2);
    const beforeFilter = snappedClips.length;
    const filtered = snappedClips.filter((c) => {
      if (c.duration < HARD_MIN) {
        console.warn(`⚠️  Dropping clip "${c.title}" — ${c.duration}s is below ${HARD_MIN}s hard minimum`);
        return false;
      }
      return true;
    });
    snappedClips.length = 0;
    snappedClips.push(...filtered);
    console.log(`🔍 Length filter: ${beforeFilter} → ${snappedClips.length} clips (min ${HARD_MIN}s)`);

    // Sort by virality score descending
    snappedClips.sort((a, b) => (b.virality_score || 0) - (a.virality_score || 0));

    // Drop heavily-overlapping clips — keep the higher-scored one
    const deduped = [];
    for (const c of snappedClips) {
      const overlaps = deduped.some(d => {
        const overlap = Math.min(d.end, c.end) - Math.max(d.start, c.start);
        return overlap > 0.5 * (c.end - c.start);
      });
      if (!overlaps) deduped.push(c);
      else console.warn(`⚠️  Dropping overlapping clip "${c.title}" (${c.start}s-${c.end}s)`);
    }
    snappedClips.length = 0;
    snappedClips.push(...deduped);

    console.log(`✅ Found ${snappedClips.length} viral clips (via ${model_used})`);
    snappedClips.forEach((c, i) => {
      console.log(`  #${i + 1} [${c.virality_score}] ${c.start.toFixed(1)}s → ${c.end.toFixed(1)}s "${c.title}"`);
    });

    return Response.json({
      success: true,
      clips: snappedClips,
      total_found: snappedClips.length,
      video_duration: duration,
      model_used,
    });

  } catch (error) {
    console.error('❌ analyzeViralMoments error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});