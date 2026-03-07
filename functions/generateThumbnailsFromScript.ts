import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// THUMBNAIL CONCEPTS v6 — BEHANCE-QUALITY SYSTEM
// ══════════════════════════════════════════════════════════════════
// KEY CHANGES FROM v5:
// 1. TEXT-FREE image generation (AI renders composition only)
// 2. Emotion → Color Psychology mapping
// 3. UI Element vocabulary (metric cards, badges, arrows)
// 4. Composition-first approach (like pro designers)
// 5. Text added programmatically by separate function
// ══════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────
// GEMINI HELPER (streamlined)
// ──────────────────────────────────────────────────────────────────

function parseJSON(text) {
  try { return JSON.parse(text); } catch (_) {}
  
  let cleaned = text;
  if (text.includes("```")) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) cleaned = match[1];
  }
  
  try { return JSON.parse(cleaned.trim()); } catch (_) {}
  
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) return JSON.parse(objMatch[0]);
  
  throw new Error("Failed to parse JSON");
}

async function safeGeminiCall(prompt, temperature = 0.85) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 6000, responseMimeType: "application/json" }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini ${response.status}: ${err.error?.message || "Unknown"}`);
  }

  const data = await response.json();
  if (!data.candidates?.length) throw new Error("No candidates from Gemini");

  return { success: true, data: parseJSON(data.candidates[0].content.parts[0].text) };
}

// ══════════════════════════════════════════════════════════════════
// COLOR PSYCHOLOGY SYSTEM
// Maps detected emotions to exact color palettes
// ══════════════════════════════════════════════════════════════════

const EMOTION_COLOR_SYSTEMS = {
  shock: {
    id: "shock",
    background: "deep purple (#1a0a2e) to black gradient with subtle vignette",
    accent: "electric yellow (#FFD700)",
    text_color: "#FFD700",
    text_outline: "#000000",
    lighting: "cool blue rim light on subject, warm key light on face",
    mood: "dramatic revelation"
  },
  warning: {
    id: "warning",
    background: "dark crimson (#2a0a0a) vignette fading to black edges",
    accent: "stark white with subtle red glow",
    text_color: "#FFFFFF",
    text_outline: "#CC0000",
    lighting: "harsh overhead spotlight, red ambient fill",
    mood: "urgent danger"
  },
  success: {
    id: "success",
    background: "dark teal (#0a1a1a) to emerald (#064e3b) gradient",
    accent: "gold (#FFD700) and mint green (#00FF88)",
    text_color: "#00FF88",
    text_outline: "#000000",
    lighting: "warm golden key light, green accent rim",
    mood: "triumphant achievement"
  },
  money: {
    id: "money",
    background: "near black (#0a0a0a) with subtle gold particle overlay",
    accent: "neon green (#00C853) for numbers, gold (#FFD700) for emphasis",
    text_color: "#00C853",
    text_outline: "#000000",
    lighting: "dramatic side lighting, money-green color cast",
    mood: "wealth revelation"
  },
  comparison: {
    id: "comparison",
    background: "split — left: desaturated cool blue-gray (#1a1a2e), right: warm amber-gold (#2e1a0a)",
    accent: "white divider line with glow",
    text_color: "#FFFFFF",
    text_outline: "#000000",
    lighting: "left: cold blue, right: warm golden",
    mood: "transformation journey"
  },
  curiosity: {
    id: "curiosity",
    background: "deep blue (#0a0a2e) to purple (#1a0a2e) gradient",
    accent: "cyan glow (#00FFFF) and white",
    text_color: "#00FFFF",
    text_outline: "#000000",
    lighting: "mysterious single spotlight, soft ambient",
    mood: "hidden knowledge"
  },
  fear: {
    id: "fear",
    background: "pure black with dark red vignette edges",
    accent: "blood red (#CC0000) and white",
    text_color: "#FFFFFF",
    text_outline: "#CC0000",
    lighting: "harsh underlighting, horror movie aesthetic",
    mood: "impending doom"
  },
  inspiration: {
    id: "inspiration",
    background: "warm orange (#1a0a00) to golden amber gradient with light rays",
    accent: "bright white and warm yellow (#FFAA00)",
    text_color: "#FFFFFF",
    text_outline: "#000000",
    lighting: "dramatic god rays, warm sunrise lighting",
    mood: "aspirational hope"
  }
};

// ══════════════════════════════════════════════════════════════════
// COMPOSITION TYPES — Professional thumbnail layouts
// ══════════════════════════════════════════════════════════════════

const COMPOSITION_TYPES = {
  A: {
    id: "A",
    name: "REACTION + FLOATING METRICS",
    description: "Subject (waist-up) on left third with extreme expression. 2-3 floating glass-morphism metric cards on right showing numbers/stats. Background gradient matches emotion.",
    best_for: ["finance", "income", "growth", "data"],
    ui_elements: ["metric_card", "badge", "arrow_indicator"],
    subject_position: "left-third",
    text_zone: "upper-right or integrated into metric cards"
  },
  B: {
    id: "B",
    name: "BEFORE/AFTER SPLIT",
    description: "Exact 50/50 vertical split. LEFT: desaturated, red-tinted 'bad' state. RIGHT: vibrant, green-tinted 'good' state. Sharp glowing divider line. Matching visual elements on each side showing transformation.",
    best_for: ["transformation", "comparison", "growth", "weight_loss"],
    ui_elements: ["split_divider", "state_label", "arrow_indicator"],
    subject_position: "centered in each half",
    text_zone: "top of each half or center divider"
  },
  C: {
    id: "C",
    name: "SINGLE MASSIVE ELEMENT",
    description: "One symbolic object fills 60% of frame with dramatic lighting from behind/below. Object tells entire story (money stack, broken chain, rocket, key). Dark vignette pushes focus to center.",
    best_for: ["concept", "revelation", "symbolic", "abstract"],
    ui_elements: ["glow_effect", "particle_overlay"],
    subject_position: "dead center, dominating",
    text_zone: "upper-left corner, not competing with object"
  },
  D: {
    id: "D",
    name: "DATA EXPLOSION",
    description: "Central subject holding or pointing at floating 3D data visualizations. Charts, percentage badges, dollar amounts rendered as premium UI elements. Green = up, Red = down, Yellow = attention.",
    best_for: ["analytics", "stats", "financial_data", "results"],
    ui_elements: ["chart_3d", "percentage_badge", "trend_arrow", "data_card"],
    subject_position: "left or center, interacting with data",
    text_zone: "integrated into data elements"
  },
  E: {
    id: "E",
    name: "THE REVEAL FRAME",
    description: "Hand pulling back curtain, opening door, lifting veil, or revealing hidden element. Mystery lighting with single spotlight. Forbidden knowledge energy. Partially visible secret.",
    best_for: ["secrets", "hidden", "exclusive", "discovery"],
    ui_elements: ["curtain", "spotlight", "mystery_glow"],
    subject_position: "hands/action in center, reveal on right",
    text_zone: "upper-left, teasing the reveal"
  },
  F: {
    id: "F",
    name: "CONFRONTATIONAL FACE",
    description: "Extreme close-up face filling 70% of frame. Intense direct eye contact. Expression matches emotion perfectly (shock, warning, disbelief). Background simple gradient. No distractions.",
    best_for: ["reaction", "shock", "warning", "personal"],
    ui_elements: ["minimal — face IS the element"],
    subject_position: "centered, filling frame",
    text_zone: "upper-left or upper-right corner only"
  },
  G: {
    id: "G",
    name: "LIFESTYLE PROOF",
    description: "Luxury item (car, watch, house, cash stack) occupies 50-60% of frame. Person casually positioned near item with confident body language. Dark rich background. Aspirational but tasteful.",
    best_for: ["income", "success", "lifestyle", "proof"],
    ui_elements: ["luxury_item", "income_badge", "subtle_glow"],
    subject_position: "beside or touching luxury item",
    text_zone: "upper area, income/result statement"
  },
  H: {
    id: "H",
    name: "AUDIT REACTION SPLIT",
    description: "50% auditor's pained reaction face (left) + 50% financial data/numbers (right). Auditor shows horror-disbelief at the data. Clinical white or dark background for data side. Red = debt, Green = income.",
    best_for: ["audit", "budget", "financial_reaction", "analysis"],
    ui_elements: ["data_table", "red_numbers", "reaction_face"],
    subject_position: "left third, looking right at data",
    text_zone: "top center spanning both halves"
  }
};

// ══════════════════════════════════════════════════════════════════
// UI ELEMENTS — Premium floating graphics vocabulary
// ══════════════════════════════════════════════════════════════════

const UI_ELEMENT_PROMPTS = {
  metric_card: "floating 3D UI card with rounded corners, glass morphism frosted effect, subtle shadow, contains icon and large number",
  badge: "circular premium badge with metallic gold rim, glass center, achievement aesthetic",
  arrow_up: "bold 3D green upward arrow with glow effect and motion blur",
  arrow_down: "bold 3D red downward arrow with urgency glow",
  split_divider: "sharp vertical or diagonal divider line, white or yellow with outer glow, separating two worlds",
  chart_3d: "floating 3D bar chart or line graph with glowing data points",
  percentage_badge: "large circular badge showing percentage with progress ring",
  trend_arrow: "curved trend line with arrow head showing direction",
  data_card: "floating rectangular card with financial data, dark glass morphism",
  glow_effect: "soft volumetric glow emanating from focal point",
  particle_overlay: "subtle floating particles, dust, or light specs for depth",
  spotlight: "dramatic single spotlight cone with visible light rays",
  curtain: "rich velvet curtain being pulled back to reveal something"
};

// ══════════════════════════════════════════════════════════════════
// VISUAL STYLE PRESETS
// ══════════════════════════════════════════════════════════════════

const VISUAL_STYLE_PROMPTS = {
  skeleton_protagonist: "The transparent glass skeleton character with ivory bones and expressive brown/amber eyeballs. Skeleton interacting with scene. Full body or waist-up, always with expressive amber eyeballs. Photorealistic environments contrasting with skeleton.",
  cinematic_realistic: "Photorealistic Hollywood-grade cinematography. Dramatic three-point lighting with strong rim light separation. Volumetric atmosphere, lens flare touches. Real human skin with visible pores and texture. Moody color grading.",
  anime: "Studio Ghibli meets modern anime aesthetic. Vibrant colors, large expressive eyes, clean bold linework. Vivid saturated color palette.",
  cinematic_anime: "Makoto Shinkai quality anime cinematography. Dramatic god rays, ultra-detailed painted backgrounds. Widescreen epic compositions.",
  cartoon_2d: "Bold clean black outlines, vibrant flat color fills. Big expressive cartoon faces, dynamic poses. Playful simplified backgrounds.",
  '3d_whiteboard_cartoon': "Clean bold outlines with flat cheerful color fills. YouTube explainer video aesthetic. Friendly proportions, clean isometric style.",
  low_poly_3d_cartoon: "Visible flat-shaded low-polygon style. Exaggerated proportions with oversized heads. Bright saturated matte colors, clay-toy quality.",
  comic_book: "Bold black ink outlines, halftone dot shading, vibrant saturated comic book colors. Marvel/DC quality dynamic action poses.",
  oil_painting: "Thick impasto brushstrokes, rich oil pigment texture. Rembrandt-style chiaroscuro dramatic lighting. Museum masterpiece quality.",
  photorealistic_4k: "DSLR photograph quality, razor sharp details. Editorial National Geographic feel. Natural color palette, real-world authenticity."
};

// ══════════════════════════════════════════════════════════════════
// TEMPLATE DNA — Simplified for v6 (focused on psychology + expression)
// ══════════════════════════════════════════════════════════════════

const TEMPLATE_DNA = {
  shock_face: {
    id: "shock_face",
    name: "The Shock Face",
    emotion: "shock",
    composition: "F",
    face_expression: "EXTREME SHOCK: eyes blown wide open to absolute maximum, eyebrows raised at highest arch, jaw dropped open in perfect O shape, both hands raised to cheeks or covering mouth, forehead creased with total disbelief. The face must be readable and impactful at 120px thumbnail size.",
    psychology: "Mirror neurons — viewer FEELS the shock before processing any text"
  },
  income_reveal: {
    id: "income_reveal",
    name: "The Income Reveal",
    emotion: "money",
    composition: "G",
    face_expression: "PROUD CONFIDENCE: chest out, chin slightly raised, calm knowing smile with closed lips. Genuine pride and satisfaction, not arrogance. Relaxed posture of someone comfortable with success.",
    psychology: "Aspiration + Social Proof — showing the result creates instant credibility"
  },
  warning_alert: {
    id: "warning_alert",
    name: "The Warning Alert",
    emotion: "warning",
    composition: "F",
    face_expression: "URGENT WARNING: intense direct stare into camera, eyebrows furrowed with concern, jaw set firmly, one hand raised in stop gesture or pointing at viewer. The look of someone delivering critical news.",
    psychology: "Loss aversion — fear of losing beats desire to gain"
  },
  before_after: {
    id: "before_after",
    name: "The Before/After Split",
    emotion: "comparison",
    composition: "B",
    face_expression: "LEFT SIDE: defeated, stressed, slumped posture, worried expression. RIGHT SIDE: confident, liberated, genuine relief smile, open posture. Clear transformation visible.",
    psychology: "Transformation desire — viewers see themselves in the journey"
  },
  data_explosion: {
    id: "data_explosion",
    name: "The Data Explosion",
    emotion: "success",
    composition: "D",
    face_expression: "PRESENTER ENERGY: confident half-smile, one eyebrow slightly raised, gesturing toward data, authoritative but approachable. The expert revealing insights.",
    psychology: "Authority + specificity — real numbers create trust"
  },
  secret_reveal: {
    id: "secret_reveal",
    name: "The Secret Reveal",
    emotion: "curiosity",
    composition: "E",
    face_expression: "CONSPIRATORIAL: finger to lips or hand near mouth, sideways glance, knowing half-smile, leaning forward. The look of sharing forbidden knowledge.",
    psychology: "Information gap + exclusivity — secrets demand attention"
  },
  finance_audit: {
    id: "finance_audit",
    name: "The Finance Audit",
    emotion: "shock",
    composition: "H",
    face_expression: "AUDITOR'S HORROR-DISBELIEF: eyes wide and slightly squinting as if looking at something painful, head tilted back or to side, one hand raised to temple or jaw, mouth open in grimace. Pained disbelief mixed with dark humor at what they're seeing.",
    psychology: "Vicarious learning + rubbernecking — watching someone else's disaster feels safe"
  },
  lifestyle_proof: {
    id: "lifestyle_proof",
    name: "The Lifestyle Proof",
    emotion: "money",
    composition: "G",
    face_expression: "CASUAL ABUNDANT CONFIDENCE: one hand casually touching luxury item, other hand relaxed. Body language of someone so comfortable with wealth it's ordinary. NOT flexing, just normal life.",
    psychology: "Social proof + aspiration — the luxury item is evidence the strategy worked"
  }
};

// ══════════════════════════════════════════════════════════════════
// EMOTION DETECTION FROM SCRIPT
// ══════════════════════════════════════════════════════════════════

function detectEmotionFromContent(title, script, niche) {
  const text = `${title} ${script} ${niche}`.toLowerCase();
  
  const emotionSignals = {
    shock: ["shocked", "can't believe", "blew my mind", "insane", "unreal", "jaw dropped", "what the", "holy"],
    warning: ["warning", "stop", "danger", "avoid", "mistake", "wrong", "don't", "never", "trap", "scam", "careful"],
    success: ["success", "achieved", "finally", "made it", "growth", "results", "winning", "crushing it"],
    money: ["money", "income", "salary", "revenue", "profit", "earnings", "passive", "wealth", "rich", "dollar", "$", "k/month"],
    comparison: ["vs", "versus", "before", "after", "transformation", "journey", "went from", "changed"],
    curiosity: ["secret", "hidden", "nobody knows", "they don't want", "truth about", "real reason", "actually"],
    fear: ["scary", "terrifying", "nightmare", "horror", "worst", "devastating", "crisis", "collapse"],
    inspiration: ["dream", "inspire", "possible", "believe", "hope", "amazing", "incredible", "journey"]
  };

  const scores = {};
  for (const [emotion, signals] of Object.entries(emotionSignals)) {
    scores[emotion] = signals.filter(s => text.includes(s)).length;
  }

  // Niche-based defaults
  const nicheDefaults = {
    finance: "money",
    personal_finance: "money",
    budgeting: "warning",
    crypto: "warning",
    true_crime: "fear",
    relationships: "comparison",
    travel: "inspiration",
    ai: "curiosity",
    tech: "curiosity"
  };

  const nicheKey = Object.keys(nicheDefaults).find(n => niche.toLowerCase().includes(n));
  if (nicheKey) scores[nicheDefaults[nicheKey]] = (scores[nicheDefaults[nicheKey]] || 0) + 3;

  const topEmotion = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return topEmotion?.[1] > 0 ? topEmotion[0] : "curiosity";
}

// ══════════════════════════════════════════════════════════════════
// TEMPLATE SELECTION
// ══════════════════════════════════════════════════════════════════

function selectTemplates(title, script, niche, selectedTemplateIds = null) {
  // If user selected specific templates, use those
  if (selectedTemplateIds && selectedTemplateIds.length === 3) {
    return selectedTemplateIds.map(id => TEMPLATE_DNA[id] || TEMPLATE_DNA.shock_face);
  }

  const text = `${title} ${script} ${niche}`.toLowerCase();
  
  const ranked = Object.values(TEMPLATE_DNA).map(t => {
    let score = 0;
    
    // Emotion match
    const detectedEmotion = detectEmotionFromContent(title, script, niche);
    if (t.emotion === detectedEmotion) score += 50;
    
    // Niche signals
    if (niche.toLowerCase().includes("finance") && ["income_reveal", "finance_audit", "data_explosion"].includes(t.id)) score += 30;
    if (niche.toLowerCase().includes("transformation") && t.id === "before_after") score += 40;
    if (text.includes("warning") || text.includes("stop") || text.includes("avoid")) {
      if (t.id === "warning_alert") score += 40;
    }
    if (text.includes("secret") || text.includes("hidden") || text.includes("truth")) {
      if (t.id === "secret_reveal") score += 40;
    }
    
    return { ...t, _score: score };
  }).sort((a, b) => b._score - a._score);

  return ranked.slice(0, 3);
}

// ══════════════════════════════════════════════════════════════════
// BUILD THE MEGA PROMPT
// ══════════════════════════════════════════════════════════════════

function buildThumbnailPrompt(videoTitle, scriptContent, projectNiche, visualStyle, templates, detectedEmotion, isShorts) {
  const emotionColors = EMOTION_COLOR_SYSTEMS[detectedEmotion] || EMOTION_COLOR_SYSTEMS.curiosity;
  const visualStylePrompt = VISUAL_STYLE_PROMPTS[visualStyle] || VISUAL_STYLE_PROMPTS.cinematic_realistic;
  const dimensionSpec = isShorts ? "1080x1920 Full HD 9:16 vertical" : "1920x1080 Full HD 16:9 landscape";

  return `You are a world-class YouTube thumbnail designer with 10+ billion combined views. You design thumbnails that achieve 8-12% CTR.

═══════════════════════════════════════════════════════════════
VIDEO DETAILS
═══════════════════════════════════════════════════════════════
TITLE: "${videoTitle}"
NICHE: ${projectNiche}
DETECTED EMOTION: ${detectedEmotion.toUpperCase()}
VISUAL STYLE: ${visualStyle}
FORMAT: ${dimensionSpec}

SCRIPT EXCERPT:
${scriptContent.substring(0, 2000)}

═══════════════════════════════════════════════════════════════
COLOR PSYCHOLOGY SYSTEM (MANDATORY FOR THIS VIDEO)
═══════════════════════════════════════════════════════════════
Based on detected emotion "${detectedEmotion}", use this EXACT color system:

BACKGROUND: ${emotionColors.background}
ACCENT COLOR: ${emotionColors.accent}
LIGHTING: ${emotionColors.lighting}
MOOD: ${emotionColors.mood}

Text will be added programmatically later with:
- Text Color: ${emotionColors.text_color}
- Outline: ${emotionColors.text_outline}

═══════════════════════════════════════════════════════════════
VISUAL STYLE SPECIFICATION
═══════════════════════════════════════════════════════════════
${visualStylePrompt}

═══════════════════════════════════════════════════════════════
TEMPLATE DNA — USE THESE FOR THE 3 CONCEPTS
═══════════════════════════════════════════════════════════════
${templates.map((t, i) => `
CONCEPT ${i + 1} — ${t.name}
  Composition Type: ${t.composition} (${COMPOSITION_TYPES[t.composition]?.name || "Custom"})
  Psychology: ${t.psychology}
  Face/Expression: ${t.face_expression}
  Layout: ${COMPOSITION_TYPES[t.composition]?.description || "Standard layout"}
`).join('\n')}

═══════════════════════════════════════════════════════════════
COMPOSITION TYPES REFERENCE
═══════════════════════════════════════════════════════════════
${Object.entries(COMPOSITION_TYPES).map(([id, c]) => `
${id}: ${c.name}
   ${c.description}
   UI Elements: ${c.ui_elements.join(", ")}
   Text Zone: ${c.text_zone}
`).join('\n')}

═══════════════════════════════════════════════════════════════
UI ELEMENTS VOCABULARY (use in prompts)
═══════════════════════════════════════════════════════════════
${Object.entries(UI_ELEMENT_PROMPTS).map(([id, desc]) => `• ${id}: ${desc}`).join('\n')}

═══════════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════════

1. **TEXT-FREE IMAGES**: Do NOT include any text, words, letters, or numbers IN the image prompt.
   Text will be added programmatically later. Instead, describe "clean negative space in upper-left for text overlay".

2. **EMOTION COLORS**: Use the exact color system specified above. These are calibrated for CTR.

3. **FACE EXPRESSIONS**: Execute the face expression specs EXACTLY. The expression is 80% of the CTR.

4. **UI ELEMENTS**: Use the floating glass-morphism UI elements (metric cards, badges) as SHAPES only.
   Do not ask for text on them — they're visual placeholders.

5. **COMPOSITION**: Follow the composition type layout precisely. Subject position matters.

6. **DEAD ZONE**: Bottom-right corner must be empty (YouTube timestamp badge covers it).

7. **PHOTOREALISM LAW**: If using realistic humans, prompt MUST include:
   "photorealistic photograph, DSLR camera shot, real human skin with visible pores, NOT illustration, NOT cartoon, NOT 3D render"

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

{
  "analysis": {
    "core_subject": "5-word summary of video",
    "detected_emotion": "${detectedEmotion}",
    "key_visual_moment": "most powerful scene from script",
    "title_keywords": ["word1", "word2", "word3"]
  },
  "thumbnails": [
    {
      "rank": 1,
      "template_id": "${templates[0]?.id || 'shock_face'}",
      "composition_type": "${templates[0]?.composition || 'F'}",
      "concept_description": "What this shows and why it achieves 10%+ CTR",
      
      "text_overlay": {
        "primary_text": "MAX 4 WORDS ALL CAPS — the scroll-stopping hook",
        "secondary_text": "optional smaller subtext or empty string",
        "position": "upper-left | upper-center | upper-right",
        "suggested_color": "${emotionColors.text_color}",
        "suggested_outline": "${emotionColors.text_outline}"
      },
      
      "emotion_system": {
        "emotion": "${detectedEmotion}",
        "background_colors": "${emotionColors.background}",
        "accent_color": "${emotionColors.accent}",
        "lighting_setup": "${emotionColors.lighting}"
      },
      
      "subject": {
        "description": "detailed subject description",
        "face_expression": "exact expression executed from template",
        "position": "rule-of-thirds position",
        "style": "${visualStyle}"
      },
      
      "ui_elements": ["element1", "element2"],
      
      "image_prompt": "${dimensionSpec} YouTube thumbnail, graphic design composition. [COMPLETE 300+ WORD PROMPT HERE]. NO TEXT, NO WORDS, NO LETTERS IN IMAGE. Clean negative space in upper-left for text overlay. Ultra high resolution, crisp sharp details.",
      
      "negative_prompt": "text, words, letters, numbers, watermark, blurry, low quality, pixelated, cluttered, busy background, text anywhere, writing, typography, labels, captions",
      
      "ctr_score": 9,
      "why_it_works": "specific psychological mechanism"
    }
  ]
}

Generate EXACTLY 3 thumbnails using the 3 templates specified above.
Each image_prompt must be 300+ words and describe the COMPLETE scene with NO TEXT.
Focus on: composition, subject with exact expression, background with exact colors, lighting, UI element shapes, mood.

REMEMBER: Text is added AFTER image generation. Your job is the visual composition only.`;
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { project_id, video_title, selected_templates, reference_style, niche_dna, selected_title } = body;
    
    if (!project_id || !video_title) {
      return Response.json({ error: 'Missing required: project_id, video_title' }, { status: 400 });
    }

    // ──────────────────────────────────────────────────────────────
    // LOAD PROJECT DATA
    // ──────────────────────────────────────────────────────────────
    const [projectResult, scriptResult, topicResult] = await Promise.allSettled([
      base44.entities.Projects.filter({ id: project_id }),
      base44.entities.Scripts.filter({ project_id }),
      base44.entities.Topics.filter({ project_id })
    ]);

    let visualStyle = 'cinematic_realistic';
    let projectNiche = '';
    
    if (projectResult.status === 'fulfilled' && projectResult.value[0]) {
      visualStyle = projectResult.value[0].visual_style || 'cinematic_realistic';
      projectNiche = projectResult.value[0].niche || '';
    }

    let scriptContent = '';
    if (scriptResult.status === 'fulfilled' && scriptResult.value.length > 0) {
      const script = scriptResult.value.find(s => s.version === 'final_aggregated') || scriptResult.value[0];
      scriptContent = script.full_script || 
        [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro].filter(Boolean).join('\n\n');
    }

    // ──────────────────────────────────────────────────────────────
    // DETECT EMOTION + SELECT TEMPLATES
    // ──────────────────────────────────────────────────────────────
    const effectiveTitle = selected_title || video_title;
    const isShorts = effectiveTitle.toLowerCase().includes('#short') || scriptContent.length < 600;
    
    const detectedEmotion = detectEmotionFromContent(effectiveTitle, scriptContent, projectNiche);
    const templates = selectTemplates(effectiveTitle, scriptContent, projectNiche, selected_templates);

    console.log('══════════════════════════════════════════════════════');
    console.log('THUMBNAIL CONCEPTS v6 — BEHANCE-QUALITY SYSTEM');
    console.log(`Title: ${effectiveTitle}`);
    console.log(`Emotion: ${detectedEmotion} | Style: ${visualStyle}`);
    console.log(`Templates: ${templates.map(t => t.name).join(' | ')}`);
    console.log('══════════════════════════════════════════════════════');

    // ──────────────────────────────────────────────────────────────
    // GENERATE CONCEPTS VIA GEMINI
    // ──────────────────────────────────────────────────────────────
    const prompt = buildThumbnailPrompt(
      effectiveTitle,
      scriptContent,
      projectNiche,
      visualStyle,
      templates,
      detectedEmotion,
      isShorts
    );

    const result = await safeGeminiCall(prompt, 0.85);
    
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    if (!result.data?.thumbnails || !Array.isArray(result.data.thumbnails)) {
      return Response.json({ error: 'Invalid response format from AI' }, { status: 500 });
    }

    // ──────────────────────────────────────────────────────────────
    // DELETE EXISTING CONCEPTS
    // ──────────────────────────────────────────────────────────────
    try {
      const existing = await base44.entities.ThumbnailConcepts.filter({ project_id });
      await Promise.all(existing.map(e => base44.entities.ThumbnailConcepts.delete(e.id)));
    } catch (_) {}

    // ──────────────────────────────────────────────────────────────
    // SAVE CONCEPTS
    // ──────────────────────────────────────────────────────────────
    const savedConcepts = [];
    const emotionColors = EMOTION_COLOR_SYSTEMS[detectedEmotion] || EMOTION_COLOR_SYSTEMS.curiosity;

    for (const [i, thumb] of result.data.thumbnails.entries()) {
      try {
        // Ensure prompt has correct dimensions and is text-free
        let imagePrompt = thumb.image_prompt || '';
        const dimensionSpec = isShorts ? "1080x1920 Full HD 9:16 vertical" : "1920x1080 Full HD 16:9 landscape";
        
        if (!imagePrompt.includes('1920x1080') && !imagePrompt.includes('1080x1920')) {
          imagePrompt = `${dimensionSpec} YouTube thumbnail, graphic design composition. ${imagePrompt}`;
        }

        // Ensure text-free
        if (!imagePrompt.toLowerCase().includes('no text')) {
          imagePrompt += ' NO TEXT, NO WORDS, NO LETTERS IN IMAGE. Clean negative space in upper-left for text overlay.';
        }

        // Add quality markers
        if (!imagePrompt.includes('ultra high resolution')) {
          imagePrompt += ' Ultra high resolution, crisp sharp details, professional quality.';
        }

        // Photorealism enforcement
        const hasHumanCues = /\b(person|man|woman|face|expression|portrait|character)\b/i.test(imagePrompt);
        if (hasHumanCues && !['anime', 'cartoon_2d', 'comic_book'].includes(visualStyle)) {
          if (!imagePrompt.includes('photorealistic')) {
            imagePrompt = imagePrompt.replace('graphic design composition.', 
              'graphic design composition. Photorealistic photograph, DSLR camera shot, real human skin with visible pores, NOT illustration, NOT cartoon, NOT 3D render.');
          }
        }

        const record = await base44.entities.ThumbnailConcepts.create({
          project_id,
          rank: thumb.rank || i + 1,
          concept_type: thumb.template_id || templates[i]?.id || 'custom',
          psychological_trigger: templates[i]?.psychology || 'curiosity',
          concept_description: thumb.concept_description || '',
          
          // Text overlay data (for programmatic overlay)
          text_overlay: thumb.text_overlay?.primary_text || '',
          text_style: JSON.stringify({
            primary_text: thumb.text_overlay?.primary_text || '',
            secondary_text: thumb.text_overlay?.secondary_text || '',
            position: thumb.text_overlay?.position || 'upper-left',
            color: thumb.text_overlay?.suggested_color || emotionColors.text_color,
            outline_color: thumb.text_overlay?.suggested_outline || emotionColors.text_outline,
            font: 'Impact'
          }),
          
          // Composition data
          focal_point: thumb.composition_type || 'F',
          color_scheme: JSON.stringify(thumb.emotion_system || emotionColors),
          
          // Subject data
          visual_metaphor: thumb.subject?.description || '',
          
          // Image generation
          image_prompt: imagePrompt,
          negative_prompt: thumb.negative_prompt || 'text, words, letters, numbers, watermark, blurry, low quality',
          
          // Scores
          ctr_score: thumb.ctr_score || 8,
          why_it_stops_scrolling: thumb.why_it_works || '',
          
          // UI elements
          faceless_adaptation: JSON.stringify(thumb.ui_elements || []),
          
          // Metadata
          style_reference: visualStyle,
          quality_valid: true,
          is_selected: false
        });

        savedConcepts.push({
          id: record.id,
          rank: record.rank,
          template: thumb.template_id,
          text_overlay: thumb.text_overlay
        });

        console.log(`✓ Concept ${thumb.rank}: [${thumb.template_id}] "${thumb.text_overlay?.primary_text || 'no text'}"`);

      } catch (saveErr) {
        console.error(`✗ Failed to save concept ${i + 1}:`, saveErr.message);
      }
    }

    // Update project step
    try {
      await base44.entities.Projects.update(project_id, { current_step: 12 });
    } catch (_) {}

    console.log('══════════════════════════════════════════════════════');
    console.log(`Saved: ${savedConcepts.length} concepts`);
    console.log(`Emotion: ${detectedEmotion} | Colors: ${emotionColors.accent}`);
    console.log('Images will be generated separately, then text overlaid');
    console.log('══════════════════════════════════════════════════════');

    return Response.json({
      success: true,
      concepts_saved: savedConcepts.length,
      concept_ids: savedConcepts.map(c => c.id),
      analysis: result.data.analysis || {},
      emotion_detected: detectedEmotion,
      color_system: emotionColors,
      templates_used: templates.map(t => ({ id: t.id, name: t.name })),
      concepts: savedConcepts,
      meta: {
        is_shorts: isShorts,
        visual_style: visualStyle,
        niche: projectNiche
      }
    });

  } catch (error) {
    console.error('generateThumbnailsFromScript v6 error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});