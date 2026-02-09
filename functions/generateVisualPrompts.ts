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
    const { project_id, script_id } = body;

    const script = await base44.entities.Scripts.get(script_id);

    const brand_list = await base44.entities.BrandIdentities.list();
    const brand_identities = brand_list.filter(b => b.project_id === project_id);
    const brand_style = brand_identities.length > 0 ? brand_identities[0].visual_rules : "cinematic documentary style";

    const prompt = `I have this script. For each paragraph, generate corresponding Sora 2.0 visual prompts describing:

→ Scene setup (environment, time, tone)
→ Camera angle, lighting, and composition
→ Character actions and micro-expressions
→ Style consistency (${brand_style})

Make sure visuals match the emotional rhythm of the narration.

SCRIPT:

${script.full_script}

RESPOND IN THIS EXACT JSON FORMAT:

{
  "scenes": [
    {
      "scene_number": 1,
      "narration_text": "The narration for this scene",
      "sora_prompt": "Full Sora 2.0 prompt for visual generation",
      "scene_environment": "Where this takes place",
      "time_of_day": "morning/afternoon/night",
      "camera_angle": "wide/close-up/aerial/tracking",
      "lighting": "dramatic/soft/harsh/natural",
      "composition_notes": "Framing details",
      "character_actions": "Actions and expressions",
      "style_tag": "cinematic/documentary/stylized_realism",
      "emotional_tone": "The mood",
      "duration_seconds": 8
    }
  ]
}`;

    const result = await safeGeminiCall(prompt, 0.7);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const visuals = [];

    for (const scene of result.data.scenes) {
      const record = await base44.entities.VisualPrompts.create({
        project_id: project_id,
        script_id: script_id,
        scene_number: scene.scene_number,
        narration_text: scene.narration_text,
        sora_prompt: scene.sora_prompt,
        scene_environment: scene.scene_environment,
        time_of_day: scene.time_of_day,
        camera_angle: scene.camera_angle,
        lighting: scene.lighting,
        composition_notes: scene.composition_notes,
        character_actions: scene.character_actions,
        style_tag: scene.style_tag,
        emotional_tone: scene.emotional_tone,
        duration_seconds: scene.duration_seconds
      });

      visuals.push(record);
    }

    await base44.entities.Projects.update(project_id, { current_step: 9 });

    return Response.json({ success: true, visuals: visuals });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});