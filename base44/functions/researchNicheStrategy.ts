import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { channel_id } = await req.json();
    if (!channel_id) return Response.json({ error: 'channel_id required' }, { status: 400 });

    const channels = await base44.asServiceRole.entities.Channels.filter({ id: channel_id });
    const channel = channels[0];
    if (!channel) return Response.json({ error: 'Channel not found' }, { status: 404 });

    const apiKey = Deno.env.get("GEMINI_API_KEY");

    const prompt = `You are an expert YouTube content strategist. Research and create a viral script strategy for the "${channel.niche_label || channel.niche}" niche on YouTube.

Analyze what makes videos in this niche go viral. Consider:
- The psychology of viewers in this niche
- What hooks work best (first 3-5 seconds)
- Optimal story structure for retention
- Pacing and energy patterns
- Emotional triggers that drive engagement
- Comment-bait techniques
- Thumbnail/title synergy patterns

Return a JSON object with this EXACT structure:
{
  "hook_formula": "A specific instruction for how to open videos in this niche (1-2 sentences)",
  "structure": ["phase1_name", "phase2_name", "phase3_name", "phase4_name", "phase5_name"],
  "structure_details": {
    "phase1_name": "What happens in this phase and why it works",
    "phase2_name": "...",
    "...": "..."
  },
  "tone": "The ideal vocal/writing tone for this niche",
  "pacing": "Description of ideal pacing pattern",
  "retention_tricks": ["trick1", "trick2", "trick3", "trick4"],
  "emotional_triggers": ["trigger1", "trigger2", "trigger3"],
  "words_per_minute": 155,
  "cold_open_formula": "Exact formula for the first 7 seconds",
  "cta_strategy": "How to end videos for max engagement",
  "short_form_strategy": "How to adapt this for shorts/reels (under 200 words)",
  "long_form_strategy": "How to sustain a 10-20 minute narrative"
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
      throw new Error(`Gemini error: ${err.error?.message || response.status}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    let strategy;
    try {
      strategy = JSON.parse(rawText);
    } catch (_) {
      const match = rawText.match(/\{[\s\S]*\}/);
      strategy = match ? JSON.parse(match[0]) : {};
    }

    await base44.asServiceRole.entities.Channels.update(channel_id, {
      script_strategy: JSON.stringify(strategy),
    });

    console.log(`✓ Niche strategy researched for "${channel.niche}" channel "${channel.name}"`);

    return Response.json({ success: true, strategy });
  } catch (error) {
    console.error("researchNicheStrategy error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});