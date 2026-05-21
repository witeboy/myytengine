import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// v3 — Gemini Primary, Claude Backup
// ══════════════════════════════════════════════════════════════════
// CHARACTER DNA EXTRACTOR
// ══════════════════════════════════════════════════════════════════
// Analyzes the final script to extract structured character descriptions
// and maps which characters appear in which scenes.
// 
// Pipeline: Script Complete → [THIS] → Scene Breakdown → Prompts → Image Gen
// 
// AI Strategy: Gemini 2.5 Pro (primary) → Claude Sonnet (fallback)
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

const SYSTEM_INSTRUCTION = "You are a casting director and data extraction system. You must return ONLY raw, valid JSON. Do not include markdown formatting like ```json and do not include any conversational text.";

// ═══ GEMINI 2.5 PRO — PRIMARY ═══
async function callGemini(prompt, temperature = 0.4) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: temperature,
        maxOutputTokens: 4096,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Gemini error: ${msg}`);
  }

  const data = await response.json();

  // Gemini response structure: candidates[0].content.parts[0].text
  const candidate = data?.candidates?.[0];
  if (!candidate?.content?.parts?.length) {
    throw new Error("No content returned from Gemini");
  }

  const rawText = candidate.content.parts[0].text;
  
  try { 
    return JSON.parse(rawText); 
  } catch (_) {
    // Fallback: extract JSON object from text
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse Gemini JSON response");
  }
}

// ═══ CLAUDE — BACKUP ═══
async function callClaude(prompt, temperature = 0.4) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      temperature: temperature,
      system: SYSTEM_INSTRUCTION,
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Claude error: ${err.error?.message || response.status}`); 
  }

  const data = await response.json();
  if (!data.content || !data.content.length) throw new Error("No content returned from Claude");
  
  const rawText = data.content[0].text;
  
  try { 
    return JSON.parse(rawText); 
  } catch (_) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse Claude JSON response");
  }
}

// ═══ UNIFIED CALLER: Gemini first → Claude fallback ═══
async function callAI(prompt, temperature = 0.4) {
  // Try Gemini first
  try {
    console.log("🤖 Attempting Gemini 2.5 Pro...");
    const result = await callGemini(prompt, temperature);
    console.log("✅ Gemini 2.5 Pro succeeded");
    return { result, model: "gemini-2.5-pro" };
  } catch (geminiError) {
    console.warn(`⚠️ Gemini failed: ${geminiError.message}`);
  }

  // Fallback to Claude
  try {
    console.log("🔄 Falling back to Claude Sonnet...");
    const result = await callClaude(prompt, temperature);
    console.log("✅ Claude Sonnet fallback succeeded");
    return { result, model: "claude-sonnet-4-5" };
  } catch (claudeError) {
    console.error(`❌ Claude also failed: ${claudeError.message}`);
    throw new Error(`Both AI providers failed. Gemini: ${claudeError.message}`);
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

    // Skip for sleep and explainer projects
    // Explainer uses pre-defined Einstein arc — not script-extracted characters
    if (
      project.project_mode === 'sleep_meditation' ||
      project.project_mode === 'sleep_story' ||
      project.project_mode === 'explainer'
    ) {
      // For explainer: pre-populate Einstein character DNA based on arc
      if (project.project_mode === 'explainer') {
        const arcType = project.explainer_arc || 'professor';
        const einsteinDNA = {
          science: {
            name: 'Einstein',
            role: 'protagonist',
            identity_core: '70-year-old male, wild untamed white hair sticking out in all directions, prominent bushy white mustache, warm intelligent brown eyes with deep laugh lines, oval face with high cheekbones, slightly ruddy warm skin tone, wiry lean build, 5ft9, wearing rumpled white lab coat over casual shirt, safety goggles pushed up on forehead, animated expressive face showing constant delight at discovery',
            default_clothing: 'Rumpled white lab coat, safety goggles pushed up on forehead, casual plaid shirt underneath, comfortable worn trousers, sensible shoes',
            emotional_arc: 'Starts with explosive excitement at introducing the topic, builds to focused intensity during core concepts, reaches peak joy at elegant solutions and aha moments, closes with warm satisfaction',
            scene_keywords: ['einstein', 'professor', 'scientist', 'he', 'his', 'our host', 'the professor'],
          },
          professor: {
            name: 'Einstein',
            role: 'protagonist',
            identity_core: '70-year-old male, wild white hair neatly side-parted for once but still voluminous, prominent bushy white mustache, warm intelligent brown eyes with deep laugh lines, oval face with high cheekbones, slightly ruddy warm skin tone, wiry lean build, 5ft9, wearing tweed jacket with distinctive elbow patches, mismatched socks visible above brogues, holding chalk',
            default_clothing: 'Brown tweed jacket with leather elbow patches, slightly wrinkled dress shirt, mismatched wool socks, worn brown brogues, piece of chalk always in hand',
            emotional_arc: 'Opens with theatrical warmth and welcoming energy, becomes passionately focused during concept explanation, uses dramatic pauses for emphasis, closes with proud satisfaction at the viewer having learned something real',
            scene_keywords: ['einstein', 'professor', 'lecturer', 'he', 'his', 'our professor', 'the lecturer'],
          },
          accountant: {
            name: 'Einstein',
            role: 'protagonist',
            identity_core: '70-year-old male, wild white hair slicked back with partial success, prominent bushy white mustache, sharp focused brown eyes behind reading glasses perched on nose, oval face with high cheekbones, slightly ruddy warm skin tone, wiry lean build, 5ft9, wearing sharp charcoal corporate suit with sleeves rolled up, retro calculator watch visible on wrist, animated intense expression when circling numbers',
            default_clothing: 'Sharp charcoal double-breasted suit, crisp white dress shirt, conservative tie loosened at collar, sleeves rolled up to forearms, retro calculator watch, reading glasses on nose',
            emotional_arc: 'Opens with laser-focused energy about the financial opportunity, builds intensity as numbers are revealed, reaches peak excitement at elegant mathematical solutions, closes with gleeful satisfaction at the profit potential',
            scene_keywords: ['einstein', 'the professor', 'financial expert', 'he', 'his', 'our analyst'],
          },
          tech: {
            name: 'Einstein',
            role: 'protagonist',
            identity_core: '70-year-old male reimagined as tech visionary, wild white hair with one streak of neon blue, prominent bushy white mustache, sharp bright brown eyes behind thin-framed smart glasses, oval face with high cheekbones, slightly ruddy warm skin tone, wiry lean build, 5ft9, wearing physics-joke graphic tee, over-ear RGB headset around neck, glowing smartphone in hand, effortlessly cool modern energy',
            default_clothing: 'Physics equation graphic tee, dark slim jeans, clean white sneakers, over-ear RGB headset worn around neck, thin-framed smart glasses, glowing smartphone always in hand or nearby',
            emotional_arc: 'Opens cool and fast-talking, builds genuine excitement as technology complexity is revealed, reaches peak enthusiasm at elegant technical solutions, closes with knowing satisfaction and a touch of futurism',
            scene_keywords: ['einstein', 'the developer', 'the tech guy', 'he', 'his', 'our expert', 'the geek'],
          },
        };

        const characterData = [einsteinDNA[arcType] || einsteinDNA.professor];
        await base44.asServiceRole.entities.Projects.update(project_id, {
          character_descriptions: JSON.stringify(characterData),
        });
        console.log(`🧬 Einstein character DNA pre-populated for arc: ${arcType}`);
        return Response.json({
          success: true,
          skipped: false,
          reason: 'explainer_einstein_prepopulated',
          arc_type: arcType,
          character_count: 1,
        });
      }

      return Response.json({ success: true, skipped: true, reason: 'sleep_project' });
    }

    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final script found.' }, { status: 400 });
    }

    const niche = project.niche || 'general';
    const fullScript = script.full_script;

    // ═══ READ DIVERSITY SEED — protagonist identity constraints ═══
    let seed = null;
    if (project.script_strategy_override) {
      try {
        const strat = typeof project.script_strategy_override === 'string'
          ? JSON.parse(project.script_strategy_override)
          : project.script_strategy_override;
        seed = strat?._script_seed || null;
      } catch (_) {}
    }

    const seedConstraint = seed ? `

**🎲 MANDATORY PROTAGONIST CONSTRAINTS (from project seed):**
- The protagonist's first name MUST be **${seed.firstName}** (${seed.namingCulture?.replace(/_/g, ' ')} cultural background)
- Archetype context: ${seed.archetype}
- Use this name and cultural context to inform the protagonist's appearance, family details, and situational framing.
- Skin tone, features, and cultural markers should authentically reflect the ${seed.namingCulture?.replace(/_/g, ' ')} heritage.
- This is NOT optional. The downstream pipeline depends on this name being consistent.
` : '';

    console.log(`🧬 Extracting Character DNA for "${project.name}" (${niche})${seed ? ` | seed: ${seed.firstName} [${seed.namingCulture}]` : ''}`);

    const prompt = `Study this script carefully and extract EVERY character that appears or is referenced.
${seedConstraint}

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

    const { result, model } = await callAI(prompt, 0.4);

    const characters = result.characters || [];
    const hasCharacters = result.has_characters !== false && characters.length > 0;

    console.log(`🧬 Found ${characters.length} characters | has_characters: ${hasCharacters} | model: ${model}`);
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
      model_used: model,
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