import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// ANALYZE THUMBNAIL TEMPLATE — Template DNA Vault Extractor
// Maps any thumbnail image → reusable template DNA
// Extracts face/emotion specs, composition rules, CTR psychology
// Identifies which of 26 template types this belongs to
// Output: composition_blueprint + recreate_prompt + face_emotion_spec
// ══════════════════════════════════════════════════════════════════

async function callGeminiWithImage(prompt, imageUrl, temperature = 0.3, maxTokens = 16384) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`Failed to fetch image: ${imgResp.status}`);
  const imgBuf = await imgResp.arrayBuffer();
  const bytes = new Uint8Array(imgBuf);
  let base64 = '';
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    base64 += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  base64 = btoa(base64);
  const mimeType = imgResp.headers.get('content-type') || 'image/jpeg';

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      })
    }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || "Unknown"}`);
  }
  const data = await response.json();
  if (!data.candidates?.length) throw new Error("No candidates from Gemini");
  const text = data.candidates[0].content.parts[0].text;
  let jsonStr = text;
  if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();
  jsonStr = jsonStr
    .replace(/[\x00-\x1F\x7F]/g, (c) => c === '\n' || c === '\r' || c === '\t' ? c : ' ')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(["\w\d])\s*\n\s*"/g, '$1, "');
  try { return JSON.parse(jsonStr); } catch (_) {}
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) try { return JSON.parse(objMatch[0]); } catch (_) {}
  throw new Error("Failed to parse Gemini response as JSON: " + text.substring(0, 200));
}

const TEMPLATE_VAULT_REFERENCE = `
═══════════════════════════════════════════════════════════════
TEMPLATE DNA VAULT — 26 Templates × 7 Niches
Map the analyzed thumbnail to the closest matching template.
═══════════════════════════════════════════════════════════════

FINANCE / PERSONAL FINANCE (8 templates):
• shock_face — Mirror neurons. Face: EXTREME SHOCK eyes blown wide/jaw dropped/hands on cheeks. Text: 3-4 word shocking outcome. Dark bg + yellow text. CTR: 8-12%
• income_reveal — Aspiration+social proof. Face: PROUD CONFIDENCE chest out/calm knowing smile. Text: specific odd dollar amount + timeframe. CTR: 7-11%
• warning_alert — Loss aversion. Face: URGENT stare/furrowed brows/pointing finger. Text: STOP [THIS] / WARNING. Deep red dominant. CTR: 7-10%
• secret_hidden — Information gap. Face: CONSPIRATORIAL WHISPER finger to lips/sideways glance. Text: HIDDEN [TRUTH]. Near black+gold. CTR: 7-10%
• breaking_news — FOMO+urgency. No face needed. Text: BREAKING: [WHAT CHANGED]. News red banner. CTR: 7-11%
• before_after — Transformation. Split screen: LEFT dark/defeated | RIGHT bright/liberated. Text: STATE → STATE. CTR: 6-10%
• numbered_list — Listicle brain. No face or knowledgeable authority pose. Text: ODD NUMBER + what they want. CTR: 5-9%
• identity_challenge — Ego threat. Face: DIRECT ACCUSATORY eye contact/single raised eyebrow/pointing finger/half-smirk. Text: THIS HABIT = POOR. CTR: 6-8%

FINANCE EXTENDED (3 templates):
• finance_versus — Binary thinking + tribal loyalty. No face needed OR decisive authority arms-crossed pose. 50/50 split: [OPTION A] vs [OPTION B] with bold VS divider center. e.g. 'RENTING VS BUYING', 'STOCKS VS REAL ESTATE'. Each half has its own identity color. CTR: 6-9%
• lifestyle_proof — Social proof + aspiration via RESULT not process. Face: CASUAL ABUNDANT CONFIDENCE — one hand on luxury item, other in pocket, body language of someone for whom wealth is now ordinary. Luxury item 50-60% of frame. Income source in text. Dark bg + gold text. e.g. 'MY LAMBO PAID BY YOUTUBE'. CTR: 6-9%
• finance_audit — Vicarious learning + rubbernecking (Caleb Hammer style). Face: AUDITOR'S HORROR-DISBELIEF — eyes wide squinting, head tilted back, hand to temple/jaw, mouth in grimace of 'HOW did this happen'. Pained disbelief + dark humor. Gaze directed RIGHT at financial data. Split: auditor face left-third + financial data/numbers right-two-thirds. e.g. '$200K DEBT AT 23'. CTR: 6-9%

STORYTELLING (2):
• cliffhanger — Zeigarnik open loop. Face: TENSE ANTICIPATION eyes wide looking OFF-FRAME/jaw tensed/mid-gesture/NOT at camera. Text: incomplete revelation + ellipsis. Warm amber grade. CTR: 7-11%
• true_account — Reality anchoring. No face needed. "TRUE STORY" banner. Desaturated documentary aesthetic. CTR: 6-9%

TRUE CRIME (2):
• cold_case_file — Justice obsession. No face or haunted expression. Evidence board aesthetic. Blood red accent. CTR: 8-12%
• suspect_reveal — Accusation trigger. Face: HALF-SHADOWED exactly 50% in deep shadow/one eye visible with penetrating gaze. Pure black+single harsh light. CTR: 7-10%

LOVE & RELATIONSHIPS (2):
• heartbreak_headline — Emotional contagion. Face: RAW EMOTIONAL PAIN red-rimmed eyes/trembling lip/collapsed shoulders/zero performance. Cold desaturated palette. CTR: 7-10%
• relationship_red_flag — Self-protection. Face: PROTECTIVE WARNING raised eyebrow+caring urgency/stop gesture. Red dominant + red flag element. CTR: 6-9%

TRAVEL & VACATION (2):
• destination_wow — Escapism pull. No face or awestruck joy. Ultra-vivid saturated landscape+golden hour+small human for scale. CTR: 6-10%
• hidden_gem — Exclusivity+FOMO. No face or discoverer excitement. Pristine unspoiled natural beauty. CTR: 7-9%

IT & AI (3):
• ai_takeover — Existential fear. Face: ALARMED URGENCY wide eyes/raised stop-hand at camera/forward lean. Neon blue on near-black+circuit aesthetic. CTR: 7-11%
• cheat_code_reveal — Shortcut psychology. Face: CONSPIRATORIAL leaning forward/one eyebrow raised/half-smile of giving forbidden access. Dark purple+electric cyan. CTR: 6-10%
• tech_comparison — Tribal loyalty. VS split design with each tool's visual on sides. Battle aesthetic. CTR: 6-9%

MOVIES & RECAP (3):
• plot_twist_tease — Spoiler magnetism. Face: MIND-BLOWN MAXIMUM both hands on head/eyes at ABSOLUTE maximum width/mouth in O shape/leaning back from impact/NOT posed. Cinematic teal-orange grade. CTR: 8-12%
• deep_lore_dive — Superfan identity. No face needed or magnifying-glass-gesture detective. Dark atmosphere+spotlight+annotation arrows. CTR: 6-9%
• reaction_recap — Shared experience. Face: COMPLETELY AUTHENTIC UNFILTERED real tears/genuine crinkle-eye laugh/hand covering mouth in gasp/ZERO performance. Natural vs cinematic split. CTR: 7-10%

UNIVERSAL (1):
• shorts_hook_frame — Pattern interrupt. EXTREME emotion 200% amplified filling 80%+ of 9:16 vertical frame. Single bold bg color. 1-2 lines max. Text fills top 30%. CTR: 3-second scroll-stop.

TEMPLATE IDENTIFICATION RULES:
1. The face/emotion spec is the MOST IMPORTANT identifier — match the expression type
2. The color system is the second identifier — dark+yellow = shock_face, red dominant = warning_alert, split = before_after
3. The text formula is the third identifier — incomplete+ellipsis = cliffhanger, BREAKING = breaking_news
4. A thumbnail can be "hybrid" — note both matched templates
═══════════════════════════════════════════════════════════════`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, source_url, niche_tags, library_category, niche_id } = await req.json();
    if (!image_url) return Response.json({ error: 'image_url is required' }, { status: 400 });

    console.log(`Analyzing thumbnail template: ${image_url.substring(0, 80)}...`);

    const analysis = await callGeminiWithImage(`You are the world's #1 YouTube thumbnail strategist with expertise in viral psychology, facial expression analysis, and CTR engineering. You have studied every top channel in every niche.

Your job is to analyze this world-class thumbnail and extract REUSABLE TEMPLATE DNA — the exact rules that can generate equally powerful thumbnails for ANY topic.

${TEMPLATE_VAULT_REFERENCE}

═══════════════════════════════════════════════════════════════
ANALYSIS DIMENSIONS — cover ALL of these
═══════════════════════════════════════════════════════════════

1. TEMPLATE VAULT MATCH:
   - Which template from the vault does this most closely match?
   - What is the hybrid match if applicable (primary + secondary template)?
   - What specific elements confirm this template identification?

2. FACE/EMOTION FORENSICS (THE MOST CRITICAL ELEMENT):
   - Is there a face? Is it the primary CTR driver?
   - EXACT muscle-level expression description:
     • Which muscles are engaged (corrugator, zygomaticus, orbicularis oculi, etc.)
     • Eye configuration: width (blown wide/slightly wide/normal/squinting), gaze direction, pupil dilation, eyelid position
     • Eyebrow configuration: arch height (maximum/high/medium), inner corner position (raised/lowered/furrowed), outer corner
     • Mouth: jaw drop level (maximum/moderate/slight/closed), lip configuration, teeth visibility, lip corners direction
     • Body language: shoulder position, lean direction, hand position, head angle
   - Rate the expression's scroll-stop power 1-10 at 120px thumbnail size
   - What template spec would recreate this exact expression?
   - Is this expression AUTHENTIC (genuine) or STAGED (performed)? Authentic expressions get 2-3x higher CTR.
   - Map to our template vault: which template's face/emotion spec does this match?

3. COMPOSITION BLUEPRINT (REUSABLE RULES):
   - Layout structure: what fills each zone of the frame?
   - Visual hierarchy: what's biggest/sharpest/most prominent?
   - Rule-of-thirds positioning: which intersections hold key elements?
   - Visual vectors: what lines guide the eye through the frame?
   - Dead zone: is bottom-right clear? (critical for YouTube badge)
   - Negative space: where is it and what purpose does it serve?
   - Depth layers: foreground/midground/background separation technique
   - Subject separation: rim light? edge glow? drop shadow? how does subject pop?

4. TEXT STRATEGY:
   - Is the text a CURIOSITY GAP (question/incomplete) or STATEMENT (answer)?
   - Exact font: weight (heavy/black/ultra), condensed/extended, serif/sans
   - Text position: upper-left/upper-center/center — never bottom-right?
   - Readability at 120px mobile size: outline thickness, shadow, contrast
   - How many words? Is it within the 4-word optimal range?
   - What psychological trigger does this text serve?

5. COLOR & CONTRAST SYSTEM:
   - Dominant color, accent color, secondary colors
   - Is this a HIGH-CONTRAST pairing (yellow+black, white+navy, orange+blue)?
   - Warm vs cold split: which elements are warm, which are cold?
   - Vignette: which edges, how strong?
   - Color temperature of the overall image
   - Saturation zones (what's hyper-saturated vs desaturated)

6. CHARACTER ACTION PATTERN:
   - Are characters ACTIVE (doing something, interacting) or PASSIVE (just standing)?
   - Gestural storytelling: what do hands/body language communicate?
   - Character interaction: eye contact, confrontation, protection, connection?
   - Micro-details that sell the story (tears, clenched fists, open palms, etc.)

7. SCROLL-STOP FORENSICS:
   - What does the viewer's eye hit FIRST in 0.3 seconds?
   - What is the psychological hook (mirror neurons / information gap / loss aversion / FOMO / identity threat)?
   - Why is it IMPOSSIBLE to scroll past this?
   - What is the "tension element" — the thing that creates unresolved curiosity?

8. SHORTS DETECTION:
   - Is this 9:16 vertical (Shorts) or 16:9 horizontal (standard)?
   - If Shorts: describe the first-frame scroll-stop mechanics, text zone (top 30%), subject zone (bottom 70%)

9. QUALITY SCORE:
   - Rate viral potential 1-10
   - What single change would most increase the CTR?

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════
RESPOND IN THIS EXACT JSON:
{
  "template_matched_primary": "template ID from vault (e.g. shock_face)",
  "template_matched_secondary": "second closest template ID if hybrid",
  "template_confidence": "1-10",
  "template_reasoning": "Why this matches — list the specific elements that confirm the template",
  
  "face_emotion_spec": "The EXACT template-ready face/emotion specification extracted from this thumbnail. Written as an instruction that would recreate this expression: 'EMOTION TYPE: [muscles engaged], [eye configuration], [brow position], [mouth state], [body language]'. This is reusable DNA for generating similar faces.",
  "face_scroll_stop_power": "1-10 — how well does this face stop the scroll at 120px?",
  "expression_authenticity": "authentic/staged/forced — authentic expressions get 3x higher CTR",
  "face_required": true,
  
  "emotional_tone": "primary emotion this triggers in the viewer in 0.3 seconds",
  "psychological_trigger": "mirror_neurons / information_gap / loss_aversion / social_proof / fomo / identity_threat / emotional_contagion / exclusivity / etc",
  "ctr_hook_type": "what type of hook this is",
  
  "forensic_description": "500+ word exhaustive analysis — EVERY visual element, WHY each element works for CTR, what makes this thumbnail world-class",
  
  "composition_blueprint": "250+ word REUSABLE composition rules written as instructions. Layout structure, zone assignments, visual vectors, hierarchy, depth layers. Written so these rules can be applied to ANY topic in ANY niche. e.g. 'Left 40% of frame: [SUBJECT] in chest-up crop at left-third rule-of-thirds intersection, facing right toward negative space. Rim light on left profile edge creates separation from background...'",
  
  "face_emotion_template": "250+ word REUSABLE face/emotion spec written as a template instruction. Describe the expression with such precision that an AI image generator can recreate it exactly. Include: which specific muscles, eye width configuration, eyebrow height and angle, jaw drop level, lip position, shoulder tension, head angle, gaze direction. This is the face/emotion DNA.",
  
  "color_strategy": "200+ word reusable color rules — what goes warm/cold, where contrast is highest, vignette rules, saturation zones, the specific high-contrast pairing used, why it works",
  
  "text_strategy": "200+ word reusable text rules — curiosity gap technique, placement rules, font weight/size/outline/shadow approach, word count optimal, what type of words create clicks, how to connect text to the topic",
  
  "character_action_notes": "200+ word rules for character posing — what makes characters ACTIVE not passive, body language details, gestures that tell the story, interaction dynamics, micro-details that sell the emotion",
  
  "is_shorts_format": false,
  "shorts_hook_analysis": "If Shorts: how does the first frame work as a scroll-stop. If standard: N/A",
  
  "recreate_prompt": "A GENERIC 400+ word AI image prompt TEMPLATE for Ideogram V3. Uses [HERO SUBJECT], [ANTAGONIST], [SETTING], [TEXT OVERLAY], [EMOTION], [NICHE OBJECT] placeholders. MUST start with '16:9 aspect ratio, 1920x1080, widescreen landscape YouTube thumbnail, graphic design composition.' Includes ALL composition/lighting/color/depth/emotion/text rules from this template. Text in DOUBLE QUOTATION MARKS. Ends with: 'Critical text overlay: [TEXT OVERLAY in quotes]'. Every face description uses the exact muscle-level template from face_emotion_template.",
  
  "quality_score": 9,
  "ctr_strengths": "What makes this impossible to scroll past — be specific about each element's contribution",
  "ctr_weaknesses": "What could be improved — be honest even if it's world-class",
  "single_best_improvement": "The ONE change that would most increase CTR"
}`, image_url, 0.3, 16384);

    console.log(`Template matched: ${analysis.template_matched_primary} (${analysis.template_confidence}/10)`);
    console.log(`Face emotion power: ${analysis.face_scroll_stop_power}/10`);
    console.log(`Psychological trigger: ${analysis.psychological_trigger}`);

    // Save as template
    const template = await base44.entities.ThumbnailTemplates.create({
      niche_id: niche_id || '',
      source_url: source_url || '',
      thumbnail_image_url: image_url,
      niche_tags: niche_tags || '',
      template_type: analysis.template_matched_primary || 'other',
      emotional_tone: analysis.emotional_tone || '',
      forensic_description: analysis.forensic_description || '',
      composition_blueprint: analysis.composition_blueprint || '',
      color_strategy: analysis.color_strategy || '',
      text_strategy: analysis.text_strategy || '',
      character_action_notes: analysis.character_action_notes || '',
      recreate_prompt: analysis.recreate_prompt || '',
      quality_score: analysis.quality_score || 7,
      is_favorite: false,
      // New template DNA fields
      face_emotion_spec: analysis.face_emotion_spec || '',
      face_emotion_template: analysis.face_emotion_template || '',
      template_matched_primary: analysis.template_matched_primary || '',
      template_matched_secondary: analysis.template_matched_secondary || '',
      template_confidence: analysis.template_confidence || 5,
      psychological_trigger: analysis.psychological_trigger || '',
      face_scroll_stop_power: analysis.face_scroll_stop_power || 5,
      expression_authenticity: analysis.expression_authenticity || 'unknown',
      is_shorts_format: analysis.is_shorts_format || false,
    });

    return Response.json({
      success: true,
      template,
      template_dna: {
        primary_template: analysis.template_matched_primary,
        secondary_template: analysis.template_matched_secondary,
        confidence: analysis.template_confidence,
        face_emotion_spec: analysis.face_emotion_spec,
        face_scroll_stop_power: analysis.face_scroll_stop_power,
        psychological_trigger: analysis.psychological_trigger,
        expression_authenticity: analysis.expression_authenticity
      }
    });

  } catch (error) {
    console.error("analyzeThumbnailTemplate error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});