// Generate punchy 2-5 word viral thumbnail hook text variants (MrBeast / Nollywood style)
// Input: transcript (optional), title (optional), niche (optional)
// Output: { hooks: [{ text, style_tip }] }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_KEY) return Response.json({ error: 'GEMINI_API_KEY missing' }, { status: 500 });

    const body = await req.json();
    const transcript = (body.transcript || '').substring(0, 4000);
    const title = body.title || '';
    const niche = body.niche || 'general';

    const prompt = `You are a world-class YouTube thumbnail copywriter specialized in HIGH-CTR overlay text.

Your job: generate 5 thumbnail overlay hooks in the style of Nollywood / MrBeast / viral shorts.

RULES:
- 2 to 5 WORDS MAX. Absolutely no more than 5.
- ALL CAPS only.
- Emotionally loaded — shock, betrayal, money, secret, caught, exposed, trapped, revealed, battle, war, truth.
- Can include one of: ! ? "" or a single emoji indicator like 💔 🔥 💰 — optional, sparingly.
- Must feel like a punchy accusation, reveal, or cliffhanger.
- NO generic phrases like "Amazing story" / "Must watch" / "You won't believe".
- NO hashtags. NO sentences. NO explanations.

STYLE EXAMPLES (the level of punch we want):
- "INHERITANCE BATTLE!"
- "CAUGHT RED HANDED"
- "SECRET EXPOSED!"
- "TRAPPED BY LIES?"
- "NEXT OF KIN"
- "GOD PUNISH POVERTY"
- "DOMESTIC WAR"
- "HIDDEN FEES REVEALED"
- "GRANDMA EXPLODES!"
- "$130K BROKE?"

CONTENT CONTEXT:
Niche: ${niche}
Title: ${title}
Transcript excerpt: ${transcript.substring(0, 2000) || '(none)'}

Return STRICT JSON only, no markdown:
{
  "hooks": [
    { "text": "HOOK ONE", "accent_word": "ONE", "style_tip": "yellow_bold" },
    { "text": "HOOK TWO!", "accent_word": "TWO", "style_tip": "red_alert" },
    { "text": "HOOK THREE?", "accent_word": "THREE", "style_tip": "white_quote" },
    { "text": "HOOK FOUR", "accent_word": "FOUR", "style_tip": "yellow_bold" },
    { "text": "HOOK FIVE", "accent_word": "FIVE", "style_tip": "nollywood" }
  ]
}

style_tip values must be one of: yellow_bold | white_quote | red_alert | nollywood
accent_word = the single most punchy word in the hook (for 2-line layouts where we color it differently)`;

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 1500 },
        }),
      }
    );

    const data = await r.json();
    if (!r.ok) return Response.json({ error: 'Gemini error: ' + JSON.stringify(data).substring(0, 300) }, { status: 500 });

    console.log('Gemini response keys:', Object.keys(data || {}));
    console.log('Candidates count:', (data?.candidates || []).length);
    console.log('Finish reason:', data?.candidates?.[0]?.finishReason);
    console.log('Full response (first 500):', JSON.stringify(data).substring(0, 500));

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    console.log('Gemini raw text (first 400):', raw.substring(0, 400));
    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) { try { parsed = JSON.parse(match[0]); } catch (_) {} }
    }

    let hooks = Array.isArray(parsed?.hooks) ? parsed.hooks : [];
    console.log('Parsed hooks count:', hooks.length);
    hooks = hooks
      .map((h) => ({
        text: String(h.text || '').toUpperCase().trim().slice(0, 40),
        accent_word: String(h.accent_word || '').toUpperCase().trim(),
        style_tip: ['yellow_bold', 'white_quote', 'red_alert', 'nollywood'].includes(h.style_tip)
          ? h.style_tip
          : 'yellow_bold',
      }))
      .filter((h) => {
        if (!h.text) return false;
        // Count alphanumeric "words" only — ignore stray punctuation
        const wordCount = h.text.split(/\s+/).filter((w) => /[A-Z0-9]/.test(w)).length;
        return wordCount >= 1 && wordCount <= 6;
      })
      .slice(0, 5);

    const usedFallback = hooks.length === 0;
    if (usedFallback) {
      hooks = [
        { text: 'SHOCKING TRUTH!', accent_word: 'TRUTH', style_tip: 'yellow_bold' },
        { text: 'CAUGHT!', accent_word: 'CAUGHT', style_tip: 'red_alert' },
        { text: '"SECRET EXPOSED"', accent_word: 'EXPOSED', style_tip: 'white_quote' },
      ];
    }

    return Response.json({ success: true, hooks, used_fallback: usedFallback });
  } catch (error) {
    console.error('generateViralHook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});