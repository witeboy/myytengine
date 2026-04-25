import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// ANALYZE VIDEO WITH GEMINI
// Gemini watches a YouTube URL directly and returns viral clip
// timestamps + captions. No download. No Python. No Docker.
//
// Input:  { videoUrl, geminiKey, maxClips?, minSec?, maxSec? }
// Output: { clips: [...], cost_analysis }
// ══════════════════════════════════════════════════════════════════

const GEMINI_MODEL = 'gemini-2.0-flash';

const buildPrompt = (maxClips, minSec, maxSec) => `
You are a senior short-form video strategist. Watch this entire video carefully and identify the ${maxClips} MOST VIRAL moments perfect for TikTok, Instagram Reels, and YouTube Shorts.

STRICT REQUIREMENTS:
- Each clip must be between ${minSec} and ${maxSec} seconds long
- Every clip must be SELF-CONTAINED — makes sense without any other context
- Start point: a natural hook (bold claim, surprising fact, question, emotional peak, or humor spike)
- End point: feels complete (punchline, revelation, resolution) — NEVER cut mid-sentence
- All timestamps are ABSOLUTE SECONDS from the very start of the video

WHAT MAKES CONTENT GO VIRAL:
- Emotional peak (surprise, shock, humor, inspiration, outrage)
- Contrarian or unexpected perspective
- Quotable one-liner or mic-drop moment  
- Dramatic reveal or before/after transformation
- Strong relatable problem with a satisfying answer
- High energy or humor shift that stops the scroll

OUTPUT: Return ONLY a valid JSON object. No markdown. No explanation. No backticks. Just raw JSON:
{
  "clips": [
    {
      "start": 45.5,
      "end": 78.0,
      "viral_hook_text": "Hook overlay text, max 8 words, same language as video",
      "video_title_for_youtube_short": "YouTube Short title, max 80 characters",
      "video_description_for_tiktok": "TikTok caption with relevant hashtags and call to action",
      "video_description_for_instagram": "Instagram caption with hashtags",
      "virality_score": 94,
      "virality_reason": "One sentence explaining exactly why this specific moment will go viral"
    }
  ]
}

Return clips sorted by virality_score descending. Return ${maxClips} clips maximum.
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      videoUrl,
      geminiKey,
      maxClips = 8,
      minSec = 20,
      maxSec = 60,
    } = await req.json();

    if (!videoUrl)   return Response.json({ error: 'videoUrl is required' }, { status: 400 });
    if (!geminiKey)  return Response.json({ error: 'geminiKey is required — add it in Open Shorts Settings' }, { status: 400 });

    console.log(`🎬 Gemini analyzing: ${videoUrl.slice(0, 80)}...`);

    const requestBody = {
      contents: [
        {
          parts: [
            { fileData: { fileUri: videoUrl } },
            { text: buildPrompt(maxClips, minSec, maxSec) },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      const msg = errData?.error?.message || `Gemini API error ${geminiRes.status}`;
      console.error('❌ Gemini error:', msg);
      return Response.json({ error: `Gemini failed: ${msg}` }, { status: 500 });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText) {
      return Response.json({ error: 'Gemini returned an empty response. Try a different video.' }, { status: 500 });
    }

    // Strip markdown fences if Gemini added them despite instructions
    let parsed;
    try {
      let clean = rawText.trim();
      if (clean.startsWith('```json')) clean = clean.slice(7);
      if (clean.startsWith('```'))     clean = clean.slice(3);
      if (clean.endsWith('```'))       clean = clean.slice(0, -3);
      parsed = JSON.parse(clean.trim());
    } catch (e) {
      console.error('❌ JSON parse failed. Raw response:', rawText.slice(0, 400));
      return Response.json({ error: 'Could not parse Gemini response. Try again.' }, { status: 500 });
    }

    const clips = parsed?.clips || [];

    if (!clips.length) {
      return Response.json({
        success: true,
        clips: [],
        message: 'No strong viral moments found. Try a video with more varied content.',
      });
    }

    // Cost calculation (Gemini 2.0 Flash pricing)
    const usage = geminiData?.usageMetadata;
    let cost_analysis = null;
    if (usage) {
      const inputTokens  = usage.promptTokenCount    || 0;
      const outputTokens = usage.candidatesTokenCount || 0;
      const inputCost    = (inputTokens  / 1_000_000) * 0.10;
      const outputCost   = (outputTokens / 1_000_000) * 0.40;
      cost_analysis = {
        input_tokens:  inputTokens,
        output_tokens: outputTokens,
        total_cost:    +(inputCost + outputCost).toFixed(6),
        model:         GEMINI_MODEL,
      };
      console.log(`💰 Cost: $${cost_analysis.total_cost} (${inputTokens}+${outputTokens} tokens)`);
    }

    console.log(`✅ Found ${clips.length} viral moments`);
    clips.forEach((c, i) =>
      console.log(`  #${i + 1} [${c.virality_score}] ${c.start}s→${c.end}s "${String(c.video_title_for_youtube_short || '').slice(0, 50)}"`)
    );

    return Response.json({ success: true, clips, cost_analysis });

  } catch (err) {
    console.error('❌ analyzeVideoWithGemini error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
