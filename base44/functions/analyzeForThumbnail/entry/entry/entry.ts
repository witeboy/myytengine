import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// ANALYZE FOR THUMBNAIL
// Reads transcript → detects content type → recommends best template
// → generates 5 text overlay options suited to that template
// ══════════════════════════════════════════════════════════════════

async function callClaude(prompt) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(`Claude ${res.status}: ${e.error?.message}`); }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callGemini(prompt) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
      }),
    }
  );
  if (!res.ok) { const e = await res.text(); throw new Error(`Gemini ${res.status}: ${e.substring(0, 200)}`); }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callLLM(prompt) {
  try { return await callClaude(prompt); }
  catch (e) {
    console.warn('Claude failed, trying Gemini:', e.message.substring(0, 100));
    return await callGemini(prompt);
  }
}

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { transcript, title, niche, has_photos } = await req.json();

    const prompt = `You are a world-class YouTube thumbnail strategist. Analyze this video and recommend the best thumbnail template and overlay text options.

VIDEO TITLE: "${title || 'Untitled'}"
NICHE: ${niche || 'general'}
HAS CHARACTER PHOTOS: ${has_photos ? 'YES — user uploaded real photos to use' : 'NO — AI will generate characters'}

TRANSCRIPT EXCERPT:
"""
${(transcript || '').substring(0, 2000)}
"""

AVAILABLE TEMPLATES:
- vs_confrontation: Two forces in conflict, split-screen, bold VS text. Best for drama/conflict/debate/true crime.
- quote_dark: Bold short statement, person reacting naturally, dark background. Best for finance/motivation/business.
- before_after: Transformation comparison with stats, split screen. Best for growth/finance/fitness/youtube.
- character_product: Energetic person with flying objects around them. Best for entertainment/product/gaming.
- shock_number: Massive number dominates, shocked reaction face. Best for finance/business/true crime/gaming.
- mrbeast_chaos: Extreme close-up face, chaotic background, stat overlays. Best for entertainment/challenge/viral.

ANALYSIS TASK:
1. Read the transcript and title carefully
2. Identify: key subject/character, main conflict or hook, dominant emotion, content category
3. Pick the BEST template for maximum CTR based on content type
4. Generate 5 text overlay options (2-4 words MAX, ALL CAPS, punchy — like MrBeast thumbnails)

TEXT RULES (critical):
- MAX 4 words per option
- ALL CAPS always
- Must directly reference the video topic — NO generic phrases
- Think: what would stop someone mid-scroll?
- Template-aware: VS template gets "X vs Y" format, shock template gets number + emotion word, quote template gets bold statement

Return ONLY valid JSON:
{
  "recommended_template": "template_id_here",
  "key_subject": "main person or topic in 3 words",
  "emotion": "primary emotion (shocked/angry/laughing/dramatic/etc)",
  "content_category": "drama/finance/education/motivation/entertainment/etc",
  "reasoning": "One sentence why this template wins for this content",
  "text_options": [
    "OPTION ONE",
    "OPTION TWO",
    "OPTION THREE",
    "OPTION FOUR",
    "OPTION FIVE"
  ]
}`;

    const raw = await callLLM(prompt);
    const parsed = parseJson(raw);

    if (!parsed) {
      return Response.json({
        recommended_template: 'quote_dark',
        key_subject: title || 'video subject',
        emotion: 'shocked',
        content_category: niche || 'general',
        reasoning: 'Default recommendation based on niche.',
        text_options: [
          title?.substring(0, 25).toUpperCase() || 'WATCH THIS',
          'YOU NEED THIS',
          'CHANGED EVERYTHING',
          'THE TRUTH',
          'NOBODY TALKS ABOUT',
        ],
      });
    }

    console.log('Thumbnail analysis:', parsed.recommended_template, '|', parsed.key_subject);
    return Response.json(parsed);

  } catch (error) {
    console.error('analyzeForThumbnail error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
