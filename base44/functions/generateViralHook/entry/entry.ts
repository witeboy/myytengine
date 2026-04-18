// Generate 6 high-CTR 2-5 word viral thumbnail hooks via Gemini
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const MODEL = 'gemini-2.5-flash';

const STYLE_TIPS = ['yellow_bold', 'red_shock', 'white_stroke', 'black_box', 'green_money', 'neon'];

function extractJson(text) {
  if (!text) return null;
  // Strip markdown fences
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Try to find the first { ... } or [ ... ] block
  const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (_) {
    return null;
  }
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.95,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { transcript = '', title = '', niche = 'general' } = await req.json();

    const transcriptSnippet = (transcript || '').slice(0, 3000);

    const prompt = `You are a YouTube thumbnail copywriter who has worked on channels with 100M+ views.

Generate 6 PUNCHY viral thumbnail overlay hooks for this video. These are the BIG TEXT burned onto the thumbnail — the hook that makes people click.

CONTEXT:
- Title: ${title || '(unknown)'}
- Niche: ${niche}
- Transcript snippet: "${transcriptSnippet || '(no transcript)'}"

HARD RULES:
- 2 to 5 words MAX per hook (shorter is better)
- ALL CAPS
- Use curiosity gaps, shock, stakes, or raw emotion
- No generic phrases like "AMAZING" or "YOU WON'T BELIEVE"
- Pick ONE accent word per hook (the emotional trigger word — often a number, name, or power word) that should be colored differently
- Pick a style_tip from: ${STYLE_TIPS.join(', ')}

Return ONLY valid JSON in this exact shape (no markdown, no explanation):
{
  "hooks": [
    { "text": "HE LIED TO US", "accent_word": "LIED", "style_tip": "red_shock" },
    { "text": "$10K IN 30 DAYS", "accent_word": "$10K", "style_tip": "green_money" }
  ]
}`;

    const raw = await callGemini(prompt);
    const parsed = extractJson(raw);

    if (!parsed?.hooks || !Array.isArray(parsed.hooks) || parsed.hooks.length === 0) {
      return Response.json({ error: 'Could not parse hooks', raw: raw.slice(0, 500) }, { status: 500 });
    }

    // Normalize
    const hooks = parsed.hooks.slice(0, 6).map((h) => ({
      text: String(h.text || '').toUpperCase().trim(),
      accent_word: String(h.accent_word || '').toUpperCase().trim(),
      style_tip: STYLE_TIPS.includes(h.style_tip) ? h.style_tip : 'yellow_bold',
    })).filter(h => h.text);

    return Response.json({ hooks });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});