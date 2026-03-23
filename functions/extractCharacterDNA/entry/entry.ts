import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed
// ══════════════════════════════════════════════════════════════════
// CHARACTER DNA EXTRACTOR
// ══════════════════════════════════════════════════════════════════
// Analyzes the final script to extract structured character descriptions
// and maps which characters appear in which scenes.
// 
// Pipeline: Script Complete → [THIS] → Scene Breakdown → Prompts → Image Gen
// 
// Output saved to Project.character_descriptions as JSON:
// [
//   {
//     "name": "Marcus",
//     "identity_core": "mid-30s Black male, close-cropped fade...",
//     "default_clothing": "charcoal grey peacoat...",
//     "emotional_arc": "starts confident, crumbles, rebuilds",
//     "scene_keywords": ["marcus", "he", "detective"],
//     "role": "protagonist"
//   }
// ]
// 
// This function runs ONCE after script finalization, BEFORE scene breakdown.
// The scene breakdown and prompt generator both consume this data.
// ══════════════════════════════════════════════════════════════════

async function callGemini(prompt, temperature = 0.5) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 8192, responseMimeType: "application/json" }
      })
    }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini error: ${err.error?.message || response.status}`); 
  }
  const data = await response.json();
  if (!data.candidates?.length) throw new Error("No candidates from Gemini");
  const rawText = data.candidates[0].content.parts[0].text;
  try { return JSON.parse(rawText); } catch (_) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse Gemini JSON");
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Skip for sleep projects
    if (project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story') {
      return Response.json({ success: true, skipped: true, reason: 'sleep_project' });
    }

    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final script found.' }, { status: 400 });
    }

    const niche = project.niche || 'general';
    const fullScript = script.full_script;

    console.log(`🧬 Extracting Character DNA for "${project.name}" (${niche})`);

    const prompt = `You are a casting director and character analyst. Study this script carefully and extract EVERY character that appears or is referenced.

**SCRIPT:**
${fullScript}

**NICHE:** ${niche}
**TITLE:** ${project.name}

**YOUR TASK:**
1. Identify every character — named, unnamed, or implied. Even "the viewer" or "a man" counts if they appear in a scene visually.
2. For each character, create a FROZEN visual identity that an artist could draw consistently across 50 different scenes.
3. Map which SECTIONS of the script each character appears in, by providing keywords and pronouns that reference them.
4. Determine their role: protagonist (main), secondary, or background.

**IDENTITY RULES:**
- Be EXTREMELY specific. "Brown hair" is useless. "Dark espresso-brown hair, slightly wavy, parted left, falling to jawline" — that's usable.
- GENDER: Analyze the story context to pick male or female. NEVER say "neutral" or "any". If the script uses "they" generically, pick the gender that best fits the niche and narrative context.
- AGE: Give a specific number, not a range. "35" not "30-40".
- SKIN TONE: Use specific descriptive shade, not just "light" or "dark". E.g. "warm olive", "deep mahogany brown", "fair with pink undertones".
- FACE: shape, eye color + shape, nose type, lip fullness, any distinguishing marks.
- HAIR: color, length, style, texture, parting.
- BUILD: specific body type and approximate height.
- DISTINGUISHING MARKS: scars, moles, tattoos, glasses, jewelry — at least 1-2 per character.

**CLOTHING:**
- Give a DEFAULT outfit that fits the character's world and status.
- This can change per scene, but give one that anchors them visually.

**SCENE KEYWORDS:**
- List ALL names, nicknames, pronouns, and descriptive references the script uses for this character.
- E.g. for a protagonist named Sarah: ["sarah", "she", "her", "the woman", "the mother", "our heroine"]
- This is used to automatically detect which scenes feature this character.

**RESPONSE FORMAT:**
{
  "characters": [
    {
      "name": "Character Name or Archetype",
      "role": "protagonist" | "secondary" | "background",
      "identity_core": "Casting-sheet: exact age, gender, skin tone shade, face shape, eye color+shape, nose, lips, hair (color/length/style/texture), build+height, 2-3 distinguishing marks",
      "default_clothing": "Detailed default outfit description",
      "emotional_arc": "How they change emotionally through the story",
      "scene_keywords": ["name", "pronoun1", "pronoun2", "descriptor1", "descriptor2"]
    }
  ],
  "has_characters": true,
  "character_count": 2,
  "notes": "Brief note about the story's character dynamics"
}

**CRITICAL:**
- If the script is a faceless narration about abstract concepts (e.g. "The stock market crashed"), there may be NO characters. Set has_characters: false and return an empty array.
- If characters are implied but never shown (e.g. "Imagine you're sitting at your desk"), create the implied character as the protagonist.
- For multi-character stories, ensure characters look DIFFERENT from each other — contrasting builds, hair colors, skin tones, clothing styles.
- Maximum 5 characters. Merge background characters into archetypes if there are many.`;

    const result = await callGemini(prompt, 0.4);

    const characters = result.characters || [];
    const hasCharacters = result.has_characters !== false && characters.length > 0;

    console.log(`🧬 Found ${characters.length} characters | has_characters: ${hasCharacters}`);
    for (const c of characters) {
      console.log(`   • ${c.name} (${c.role}): ${(c.identity_core || '').substring(0, 80)}... | keywords: [${(c.scene_keywords || []).join(', ')}]`);
    }

    // Save to Project
    await base44.asServiceRole.entities.Projects.update(project_id, {
      character_descriptions: JSON.stringify(characters)
    });

    return Response.json({
      success: true,
      has_characters: hasCharacters,
      character_count: characters.length,
      characters: characters.map(c => ({
        name: c.name,
        role: c.role,
        keywords: c.scene_keywords,
        identity_preview: (c.identity_core || '').substring(0, 100)
      })),
      notes: result.notes || ''
    });

  } catch (error) {
    console.error('❌ extractCharacterDNA error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});