import OpenAI from 'npm:openai@4.52.0';

// ══════════════════════════════════════════════════════════════════
// PROMPT CLEANER — OpenAI post-processor for structured prompts
// Takes a messy image prompt and returns a clean, structured one
// that image generators can interpret without hallucination.
// ══════════════════════════════════════════════════════════════════

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

const SYSTEM_PROMPT = `You are a principal prompt engineer specialized in cinematic image and video generation.

Your task is to CLEAN and STRUCTURE the following messy prompt WITHOUT changing, paraphrasing, or adding new creative ideas.

DO NOT rewrite creatively.
DO NOT expand or embellish.
ONLY organize, clarify relationships, remove ambiguity, and enforce visual hierarchy so an AI model can interpret it correctly without hallucination.

-------------------------------------

REQUIREMENTS:

1. Preserve ALL original elements exactly as given
2. Explicitly define:
   - subject priority (what is the main focus vs secondary)
   - spatial relationships (who/what is where)
   - camera perspective (angle, framing, POV)
   - action timing (exact moment being captured)
3. Resolve ambiguity in:
   - who is holding objects
   - where objects appear
   - what is foreground, midground, background
4. Enforce strong composition rules:
   - one clear primary subject
   - no conflicting perspectives
   - no duplicate or floating elements

-------------------------------------

TEXT HANDLING (CRITICAL):

If the prompt includes ANY text, UI, or screen elements:

- Treat text as a digital UI overlay, NOT part of the environment
- Place all text inside a defined container (no floating text)
- Use minimal, short, clean text only
- Enforce legibility:
  all text must be perfectly spelled, sharp, readable, high contrast
- Specify position (e.g., top banner, inside phone screen)
- Prevent hallucination with:
  no garbled text, no distorted letters, no stylized typography

-------------------------------------

STYLE ENFORCEMENT:

If a style is mentioned (e.g., 3D whiteboard cartoon):
- Lock it strictly
- Add constraints to prevent realism bleed:
  no photorealism, no complex textures, no cinematic blur unless specified

-------------------------------------

OUTPUT FORMAT:

Return ONLY a single clean structured prompt as ONE continuous text block for direct use.
Structure it in this internal order but as flowing prose (NOT labeled sections):

[MAIN SUBJECT] → [ENVIRONMENT / SETTING] → [OBJECTS & DETAILS] → [CHARACTERS & POSITIONS] → [ACTIONS / MOMENT] → [CAMERA / COMPOSITION] → [LIGHTING] → [STYLE / MOOD] → [TEXT / UI if applicable] → [TECHNICAL SPECS] → [CONSTRAINTS / NEGATIVES]

-------------------------------------

IMPORTANT:

- Do NOT explain anything
- Do NOT add commentary
- Do NOT output anything except the final cleaned prompt
- Keep it in ONE clean text block for direct copy-paste
- Do NOT add section labels like [MAIN SUBJECT] — just flow naturally`;

/**
 * Clean a single image prompt via OpenAI.
 * Exported for use by other functions.
 */
export async function cleanPrompt(messyPrompt, visualStyle) {
  const styleConstraint = visualStyle
    ? `\n\nThe visual style is strictly ${visualStyle.replace(/_/g, ' ')}. Lock this style and prevent any realism bleed or style mixing.`
    : '';

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Clean and structure this prompt:${styleConstraint}\n\n${messyPrompt}` }
    ]
  });

  return (response.choices[0]?.message?.content || '').trim();
}

/**
 * Clean multiple prompts in parallel batches.
 * Returns a Map of scene_number → cleaned prompt.
 */
export async function cleanPromptsBatch(scenes, visualStyle, concurrency = 5) {
  const results = new Map();
  
  // Process in parallel chunks
  for (let i = 0; i < scenes.length; i += concurrency) {
    const chunk = scenes.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (s) => {
        try {
          const cleaned = await cleanPrompt(s.image_prompt, visualStyle);
          // Only use cleaned if it's substantial (not an error or empty)
          if (cleaned && cleaned.length > 50) {
            return { scene_number: s.scene_number, cleaned };
          }
          console.warn(`⚠️ Scene ${s.scene_number}: OpenAI cleaner returned thin result, keeping original`);
          return { scene_number: s.scene_number, cleaned: s.image_prompt };
        } catch (err) {
          console.warn(`⚠️ Scene ${s.scene_number}: OpenAI cleaner failed (${err.message}), keeping original`);
          return { scene_number: s.scene_number, cleaned: s.image_prompt };
        }
      })
    );
    for (const r of chunkResults) {
      results.set(r.scene_number, r.cleaned);
    }
  }
  
  return results;
}

// ══════════════════════════════════════════════════════════════════
// HTTP HANDLER — also usable as standalone endpoint
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const { prompt, prompts, visual_style } = await req.json();

    // Single prompt mode
    if (prompt) {
      const cleaned = await cleanPrompt(prompt, visual_style);
      return Response.json({ cleaned_prompt: cleaned });
    }

    // Batch mode: [{scene_number, image_prompt}, ...]
    if (prompts && Array.isArray(prompts)) {
      const results = await cleanPromptsBatch(prompts, visual_style);
      const output = prompts.map(p => ({
        scene_number: p.scene_number,
        cleaned_prompt: results.get(p.scene_number) || p.image_prompt
      }));
      return Response.json({ cleaned_prompts: output });
    }

    return Response.json({ error: 'Provide "prompt" or "prompts" array' }, { status: 400 });
  } catch (error) {
    console.error("cleanScenePrompt error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});