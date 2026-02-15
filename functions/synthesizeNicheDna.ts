import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function safeGeminiCall(prompt, temperature = 0.7, maxTokens = 16384) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || "Unknown"}`);
  }

  const data = await response.json();
  if (!data.candidates || data.candidates.length === 0) throw new Error("No candidates from Gemini");
  const text = data.candidates[0].content.parts[0].text;
  
  // For this function, the response is a single "style_dna" string field.
  // Instead of trying to parse complex JSON with control chars, extract the style_dna text directly.
  let jsonStr = text;
  if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();
  
  // Try to extract the style_dna value directly using regex to avoid JSON control char issues
  const dnaMatch = jsonStr.match(/"style_dna"\s*:\s*"([\s\S]*)"\s*\}?\s*$/);
  if (dnaMatch) {
    // Unescape the string content
    const rawDna = dnaMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    return { style_dna: rawDna };
  }
  
  // Fallback: sanitize and parse as JSON
  jsonStr = jsonStr
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    .replace(/,\s*([}\]])/g, '$1');
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Last resort: extract everything between the first { and last } and treat the whole body as style_dna
    const contentStart = text.indexOf('"style_dna"');
    if (contentStart !== -1) {
      // Just grab all the text after the JSON wrapper and use it as the DNA
      const cleanText = text
        .replace(/```json/g, '').replace(/```/g, '')
        .replace(/\{\s*"style_dna"\s*:\s*"/i, '')
        .replace(/"\s*\}\s*$/, '')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"');
      return { style_dna: cleanText };
    }
    throw new Error("Failed to parse JSON: " + e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { niche_id } = await req.json();
    if (!niche_id) return Response.json({ error: 'niche_id is required' }, { status: 400 });

    const niche = await base44.entities.ThumbnailNiches.get(niche_id);
    const templates = await base44.entities.ThumbnailTemplates.filter({ niche_id });

    if (templates.length === 0) {
      return Response.json({ error: 'No templates in this niche yet. Feed some thumbnails first.' }, { status: 400 });
    }

    // Build a summary of all templates for synthesis — sanitize to avoid control chars
    const sanitize = (str) => (str || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
    
    const templateSummaries = templates.map((t, i) => `
TEMPLATE ${i + 1} (${sanitize(t.template_type)}, quality: ${t.quality_score || 0}/10, tone: ${sanitize(t.emotional_tone)}):
- Composition: ${sanitize(t.composition_blueprint).substring(0, 500)}
- Color: ${sanitize(t.color_strategy).substring(0, 300)}
- Text: ${sanitize(t.text_strategy).substring(0, 300)}
- Character Actions: ${sanitize(t.character_action_notes).substring(0, 300)}
- Prompt Template: ${sanitize(t.recreate_prompt).substring(0, 400)}
`).join('\n---\n');

    const prompt = `You are the world's #1 YouTube thumbnail style analyst. You have analyzed ${templates.length} world-class thumbnails from the "${niche.name}" niche.

Your job is to SYNTHESIZE all of them into a single, comprehensive "STYLE DNA" document that captures the COMMON PATTERNS, RULES, and BEST PRACTICES across ALL these thumbnails.

This Style DNA will be used as a MANDATORY BLUEPRINT when generating new thumbnails for this niche. It must be specific enough that any thumbnail generated from it will FEEL like it belongs in this niche.

=== ALL ${templates.length} ANALYZED TEMPLATES ===
${templateSummaries}

=== YOUR MISSION ===
Synthesize ALL the above into ONE comprehensive Style DNA. Find the PATTERNS — what do the best thumbnails in this niche have in common?

RESPOND IN THIS EXACT JSON:
{
  "style_dna": "A 1000+ word comprehensive style guide covering ALL of the following sections:

## COMPOSITION PATTERNS
What layout types dominate this niche? (split-screen, centered hero, face-off, etc.) What's the most common visual hierarchy? How is the frame typically divided? What geometric patterns appear?

## CHARACTER & SUBJECT RULES  
How are subjects typically posed? What actions are they performing? How do they interact? What expressions dominate? What clothing/styling patterns appear? How are heroes vs antagonists differentiated? What body language is most effective?

## COLOR & CONTRAST DNA
What color palettes dominate? How is warm vs cold used? What's the typical contrast level? How is saturation used? What color grading patterns appear? What about rim lighting colors and directions?

## TEXT & TYPOGRAPHY RULES
How many words typically appear? What creates the best curiosity gaps in this niche? Where is text placed? What font weights/sizes work? How are outlines and shadows used? What text-to-background contrast approaches work?

## EMOTIONAL TRIGGERS
What emotions hit hardest in this niche? What psychological principles are most effective? What makes viewers in this niche click?

## DEPTH & ATMOSPHERE
How is depth of field typically used? What atmospheric effects appear (smoke, embers, bokeh, lens flare)? How heavy is the vignette?

## DO's AND DON'Ts
Specific rules: what ALWAYS works, what NEVER works in this niche.

## MASTER PROMPT TEMPLATE
A fill-in-the-blank AI image prompt that captures ALL the above patterns. Use [HERO SUBJECT], [ANTAGONIST/CONTRAST], [SETTING], [TEXT OVERLAY], [EMOTION] as placeholders."
}`;

    console.log(`Synthesizing DNA for niche "${niche.name}" from ${templates.length} templates...`);
    const result = await safeGeminiCall(prompt, 0.7, 16384);

    // Update the niche with synthesized DNA
    await base44.entities.ThumbnailNiches.update(niche_id, {
      synthesized_dna: result.style_dna,
      template_count: templates.length,
      last_synthesized: new Date().toISOString(),
    });

    return Response.json({ success: true, style_dna: result.style_dna });
  } catch (error) {
    console.error("synthesizeNicheDna error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});