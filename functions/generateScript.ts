import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function safeGeminiCall(prompt, temperature = 0.8) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: 8192 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || "Unknown"}`);
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("Gemini returned no candidates. Possibly content filtered.");
    }

    const text = data.candidates[0].content.parts[0].text;

    let jsonStr = text;
    if (text.includes("```json")) {
      jsonStr = text.split("```json")[1].split("```")[0].trim();
    } else if (text.includes("```")) {
      jsonStr = text.split("```")[1].split("```")[0].trim();
    }

    const parsed = JSON.parse(jsonStr);

    return { success: true, data: parsed, raw: text };
  } catch (error) {
    console.error("Gemini call failed:", error.message);
    return { success: false, error: error.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id, topic_id, topic_title, topic_description, selected_hook } = body;

    const prompt = `
You are an elite YouTube documentary scriptwriter, retention strategist, and narrative psychologist.

Your task is to write a high-retention, cinematic YouTube script about "${topic_title}".
Target duration: approximately 150 words per minute voiceover pacing.

Context:
${topic_description}

Cold open hook to integrate naturally:
"${selected_hook}"

────────────────────────
AUTO NICHE DETECTION SYSTEM
────────────────────────

First, silently analyze "${topic_title}" and "${topic_description}" and determine the dominant niche:

Possible niches include (but are not limited to):
• Finance / Business / Economics
• Technology / AI / Product Review
• Crime / Investigation
• History / Biography
• Geopolitics / War / Law
• Science / Engineering
• Storytelling / Human Drama
• Philosophy / Psychology
• Cultural Commentary

Then automatically adjust tone, pacing, and structure accordingly:

IF Finance/Business:
- Break down incentives, power structures, risk, and economic consequences.
- Translate mechanisms clearly.
- Highlight hidden leverage, money flows, and long-term ripple effects.

IF Technology:
- Translate features into real-world impact.
- Contrast promise vs reality.
- Include adoption implications and future disruption angles.

IF Crime:
- Maintain timeline clarity.
- Layer psychological profiling.
- Escalate moral tension and unanswered questions.

IF History/Biography:
- Emphasize character motivations.
- Show stakes of decisions.
- Connect past to present relevance.

IF Geopolitics/Law:
- Explain power dynamics.
- Clarify strategic incentives.
- Highlight unintended consequences.

IF Storytelling/Human Drama:
- Deep emotional immersion.
- Sensory detail.
- Internal conflict emphasis.

────────────────────────
STRUCTURE REQUIREMENTS
────────────────────────

Use a 3-Act Netflix-style documentary structure.

ACT 1 — GRAVITY HOOK & WORLD SETUP
- Open with tension immediately (no “In this video…”).
- Use the selected hook naturally.
- Create curiosity before explanation.
- Establish stakes and central conflict.

ACT 2 — ESCALATION & HIDDEN LAYERS
- Go beyond “what happened.”
- Explore why it mattered.
- Insert micro-hooks every 60–90 seconds such as:
  “But that wasn’t the real story.”
  “What happened next changed everything.”
  “Almost no one noticed this.”
  “And this is where it gets uncomfortable.”
- Increase either tension, emotional depth, or insight with every section.
- Never plateau.

ACT 3 — TURNING POINT & AFTERMATH
- Introduce a critical decision, betrayal, revelation, collapse, or shift.
- Slow pacing slightly for emotional weight.
- Examine consequences and long-term impact.
- End with a profound, lingering realization — not a summary.

OUTRO
- Subtle, intelligent call to action.
- Reinforce the emotional or intellectual takeaway.

────────────────────────
RETENTION RULES
────────────────────────

- No filler.
- No repetition for word count.
- No robotic phrasing.
- Vary sentence length.
- Tight paragraphs.
- Every paragraph must add new insight, tension, or depth.
- Maintain escalating narrative momentum.
- Make viewers feel something.

────────────────────────
VISUAL FORMAT REQUIREMENTS
────────────────────────

Each paragraph must follow this exact pattern:

Narration text.

[SCENE: Highly specific cinematic 16:9 Sora direction including camera movement, lighting style, mood, color grading, depth of field, environmental detail, and emotional tone.]

Every paragraph = new visual scene.
Assume widescreen 16:9 cinematic composition.

────────────────────────
OUTPUT FORMAT
────────────────────────

RESPOND IN THIS EXACT JSON FORMAT:

{
  "title": "Video Working Title",
  "cold_open": "The opening 7-second hook narration with [SCENE: direction]",
  "act_1": "Full Act 1 narration with [SCENE: directions] for each paragraph",
  "act_2": "Full Act 2 narration with [SCENE: directions] for each paragraph",
  "act_3": "Full Act 3 narration with [SCENE: directions] for each paragraph",
  "outro": "Closing narration with call to action",
  "full_script": "The complete script combining all acts in order",
  "word_count": 0,
  "estimated_duration_sec": 0
}

IMPORTANT:
- Calculate accurate word_count.
- Calculate estimated_duration_sec at ~150 words per minute.
- Ensure the script length aligns with documentary pacing.
- Zero fluff. Every line must earn its place.
`;

    const result = await safeGeminiCall(prompt, 0.8);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const script = await base44.entities.Scripts.create({
      project_id: project_id,
      topic_id: topic_id,
      version: "draft",
      title: result.data.title,
      full_script: result.data.full_script,
      cold_open: result.data.cold_open,
      word_count: result.data.word_count,
      estimated_duration_sec: result.data.estimated_duration_sec,
      act_1: result.data.act_1,
      act_2: result.data.act_2,
      act_3: result.data.act_3,
      outro: result.data.outro
    });

    await base44.entities.Projects.update(project_id, {
      script_id: script.id,
      current_step: 4,
      status: "scripting"
    });

    return Response.json({ success: true, script: script });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});