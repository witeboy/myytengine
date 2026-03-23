import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const PLATFORM_RULES = {
  youtube: {
    titleMax: 100,
    descMax: 5000,
    tagMax: 500,
    hashtagMax: 15,
    instructions: `YouTube SEO optimization:
- Title: Under 70 chars for full display, front-load keywords, use power words and numbers
- Description: First 150 chars appear in search — pack keywords there. Include timestamps, links, CTA. 3-5 paragraphs.
- Tags: Mix short (1-2 words), medium (2-3 words), and long-tail (4+ words). Include misspellings of key terms. Total under 500 chars.
- Hashtags: Max 15, place at bottom of description. First 3 appear above title.`
  },
  tiktok: {
    titleMax: 150,
    descMax: 2200,
    tagMax: 0,
    hashtagMax: 5,
    instructions: `TikTok algorithm optimization:
- Title: Not displayed — this becomes the caption. Must hook in first 5 words. Use conversational tone.
- Description/Caption: Under 2200 chars. Start with a bold hook question or statement. Use line breaks. End with CTA ("Follow for more").
- No traditional tags — use 3-5 viral hashtags ONLY. Mix trending + niche-specific.
- Hashtags: #fyp #foryou are dead weight — use NICHE hashtags that TikTok's algo actually indexes.
- Tone: Casual, direct, provocative. Like texting a friend.`
  },
  x: {
    titleMax: 0,
    descMax: 280,
    tagMax: 0,
    hashtagMax: 3,
    instructions: `X.com (Twitter) optimization:
- No title field — everything is the post text (280 chars max).
- Post must be self-contained, punchy, provocative. Front-load the hook.
- Use 1-3 hashtags MAX, embedded naturally in the text (not dumped at the end).
- Include a thread hook if the content is substantial: "🧵 Thread:" or "Here's what nobody tells you about..."
- Tone: Authoritative, slightly controversial, shareable. Designed for quote-tweets and replies.
- End with engagement bait: "Agree?" or "What would you do?" or "Save this."`
  },
  instagram: {
    titleMax: 0,
    descMax: 2200,
    tagMax: 0,
    hashtagMax: 30,
    instructions: `Instagram Reels optimization:
- No title — caption is king. First line must stop the scroll.
- Caption: Start with a hook line, then storytelling micro-paragraph, then CTA. Use emojis sparingly for visual breaks.
- Hashtags: Use 20-30. Mix: 10 high-volume (1M+ posts), 10 medium (100K-1M), 10 niche (<100K). Place in first comment OR at bottom.
- Tone: Inspirational, relatable, community-focused. "Save this for later" drives algorithm.
- Include line breaks and emoji bullets for scannability.`
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { platform, title, description, tags, hashtags, niche } = await req.json();

    if (!platform || !PLATFORM_RULES[platform]) {
      return Response.json({ error: `Invalid platform. Use: ${Object.keys(PLATFORM_RULES).join(', ')}` }, { status: 400 });
    }

    if (!title && !description) {
      return Response.json({ error: 'Provide at least a title or description to adapt' }, { status: 400 });
    }

    const rules = PLATFORM_RULES[platform];

    const prompt = `You are a world-class social media strategist specializing in ${platform.toUpperCase()} algorithm optimization.

ORIGINAL CONTENT:
Title: ${title || 'N/A'}
Description: ${description || 'N/A'}
Tags: ${tags || 'N/A'}
Hashtags: ${hashtags || 'N/A'}
Content Niche: ${niche || 'general'}

PLATFORM RULES FOR ${platform.toUpperCase()}:
${rules.instructions}

ADAPT the content above specifically for ${platform.toUpperCase()}'s algorithm. 
DO NOT just copy — REWRITE and OPTIMIZE for maximum reach on this specific platform.

Return JSON:
{
  "adapted_title": "Platform-optimized title (or empty string if platform doesn't use titles)",
  "adapted_description": "Full platform-optimized description/caption",
  "adapted_tags": ["tag1", "tag2", ...],
  "adapted_hashtags": ["#hashtag1", "#hashtag2", ...],
  "platform_tips": ["Specific tip 1 for this post", "Tip 2", "Tip 3"],
  "character_count": {
    "title": 0,
    "description": 0
  },
  "optimization_score": 8,
  "optimization_notes": "Brief explanation of key adaptations made"
}`;

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096, responseMimeType: "application/json" }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini ${response.status}: ${err.error?.message || "Unknown"}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No response from Gemini");

    let parsed;
    try { parsed = JSON.parse(text); } catch (_) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("Failed to parse Gemini response");
    }

    // Enforce platform limits
    if (rules.titleMax && parsed.adapted_title) {
      parsed.adapted_title = parsed.adapted_title.slice(0, rules.titleMax);
    }
    if (rules.descMax && parsed.adapted_description) {
      parsed.adapted_description = parsed.adapted_description.slice(0, rules.descMax);
    }
    if (rules.hashtagMax && Array.isArray(parsed.adapted_hashtags)) {
      parsed.adapted_hashtags = parsed.adapted_hashtags.slice(0, rules.hashtagMax);
    }

    parsed.platform = platform;
    parsed.limits = {
      title_max: rules.titleMax,
      description_max: rules.descMax,
      hashtag_max: rules.hashtagMax,
    };

    return Response.json(parsed);
  } catch (error) {
    console.error('adaptForPlatform error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});