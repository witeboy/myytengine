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
      throw new Error("Gemini returned no candidates.");
    }

    const text = data.candidates[0].content.parts[0].text;
    let jsonStr = text;
    if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
    else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();

    const parsed = JSON.parse(jsonStr);
    return { success: true, data: parsed, raw: text };
  } catch (error) {
    console.error("Gemini call failed:", error.message);
    return { success: false, error: error.message };
  }
}

function validateThumbnail(thumbnail) {
  const issues = [];
  if (!thumbnail.image_prompt || thumbnail.image_prompt.length < 100) {
    issues.push('Image prompt too short (minimum 100 chars)');
  }
  if (!thumbnail.image_prompt?.toLowerCase().includes('16:9')) {
    issues.push('Missing 16:9 aspect ratio specification');
  }
  if (!thumbnail.text_overlay || thumbnail.text_overlay.trim().length === 0) {
    issues.push('Missing text overlay');
  }
  if (thumbnail.text_overlay && thumbnail.text_overlay.split(' ').length > 5) {
    issues.push('Text overlay too long (max 5 words)');
  }
  if (!thumbnail.ctr_score || thumbnail.ctr_score < 1 || thumbnail.ctr_score > 10) {
    issues.push('Invalid CTR score');
  }
  return { valid: issues.length === 0, issues };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { project_id, video_title } = body;

    if (!project_id || !video_title) {
      return Response.json({ error: 'Missing required fields: project_id, video_title' }, { status: 400 });
    }

    // Load brand identity
    let thumbTone = 'cinematic documentary';
    let brandColors = '';
    let brandStyle = '';
    try {
      const brand_list = await base44.entities.BrandIdentities.list();
      const brand = brand_list.find(b => b.project_id === project_id);
      if (brand) {
        thumbTone = brand.thumbnail_tone || thumbTone;
        brandColors = brand.color_palette || '';
        brandStyle = brand.visual_style || '';
      }
    } catch (brandErr) {
      console.warn('Could not load brand identity:', brandErr.message);
    }

    // Load topic for context
    let topicContext = '';
    try {
      const project = await base44.entities.Projects.get(project_id);
      if (project?.selected_topic_id) {
        const topic = await base44.entities.Topics.get(project.selected_topic_id);
        topicContext = topic?.description || '';
      }
    } catch (topicErr) {
      console.warn('Could not load topic context:', topicErr.message);
    }

    console.log('================================================');
    console.log('GENERATING THUMBNAIL CONCEPTS');
    console.log(`Video: ${video_title}`);
    console.log(`Brand tone: ${thumbTone}`);
    console.log('================================================');

    const prompt = `You are the world's #1 YouTube thumbnail psychologist and visual designer. You've studied every viral thumbnail across every niche and know exactly what makes someone's thumb stop mid-scroll.

VIDEO TITLE: "${video_title}"
BRAND THUMBNAIL TONE: ${thumbTone}
${brandColors ? `BRAND COLORS: ${brandColors}` : ''}
${brandStyle ? `BRAND VISUAL STYLE: ${brandStyle}` : ''}
${topicContext ? `VIDEO CONTEXT: ${topicContext}` : ''}

CHANNEL TYPE: Faceless documentary/educational (no on-camera presenter)

================================================
THUMBNAIL PSYCHOLOGY MASTERY
================================================

The ONLY job of a thumbnail is to create an irresistible NEED to click.
It does this through ONE primary psychological trigger:

TRIGGER 1 - CURIOSITY GAP:
Something in the image creates an unanswered question.
Visual elements that are incomplete, contradictory, or surprising.
Example: A safe with its door blown open. A graph with a dramatic cliff edge. A face with shocked expression looking at something out of frame.

TRIGGER 2 - FEAR/WARNING:
The image implies danger, loss, or a mistake the viewer is making right now.
Visual cues: red color dominance, warning symbols, distressed expressions, dramatic lighting.
Example: A red X over a common action. A person holding their head in despair. Money falling into a drain.

TRIGGER 3 - FORBIDDEN KNOWLEDGE:
The image implies classified or suppressed information being revealed.
Visual cues: classified stamps, leaked documents, shadows and silhouettes, hidden things being uncovered.
Example: A document with CLASSIFIED stamped on it. A curtain being pulled back. A locked box opening.

TRIGGER 4 - SOCIAL PROOF / STATUS:
The image implies exclusive insider knowledge only smart people have.
Visual cues: contrast between "before" and "after", winners vs losers, elite vs masses.
Example: Two cars side by side (cheap vs expensive). Two graphs (one up, one down).

TRIGGER 5 - EMOTIONAL CONTRAST:
The image creates visceral emotional dissonance.
Visual cues: extreme contrast between elements (hope vs despair, wealth vs poverty, simple vs complex).
Example: A happy family home with a foreclosure sign. A chart going up with a sad face overlay.

================================================
DESIGN RULES (ABSOLUTE LAWS)
================================================

COMPOSITION:
- ALWAYS 16:9 landscape format (1280x720 pixels) - NON-NEGOTIABLE
- Rule of thirds: place primary subject at intersection points
- Leave breathing room: never crowd the frame
- Depth layers: foreground subject, midground detail, background atmosphere
- Eye-line direction: subjects should look TOWARD the center of action

COLOR:
- Use COLOR NAMES only (never hex codes or percentages)
- Maximum 3 dominant colors for clarity and impact
- Contrast ratio must be high enough to read at thumbnail size (approx 180x100 pixels)
- Warm colors (red, orange, yellow) advance - use for subjects and text
- Cool colors (blue, teal, purple) recede - use for backgrounds
- Complementary color pairs for maximum impact: red/teal, orange/blue, yellow/purple

TEXT OVERLAYS:
- MAXIMUM 4 words (3 is ideal)
- Must be readable at 180x100 pixel thumbnail size
- Text as design element: describe the container too (red badge, torn paper effect, glowing neon)
- Font weight: BOLD/EXTRA BOLD only for thumbnails
- Text position: upper third or lower third (never dead center)
- Color: white or bright yellow for maximum contrast

FACELESS CHANNEL ADAPTATIONS:
Since there is no presenter face, use these high-CTR alternatives:
- Dramatic objects with implied human stakes (empty wallet, burning document, locked door)
- Data visualizations with shocking results (chart with dramatic cliff, gauge in red zone)
- Environmental storytelling (the scene tells the story without a person)
- Symbol + emotion composition (warning sign + distressed hands)
- Split comparisons (two worlds side by side)
- Close-up textures with implied narrative (crumpled money, broken glass, torn contract)

PROMPT ENGINEERING RULES:
- NEVER use percentages, hex codes, or pixel measurements in descriptions
- Use SPATIAL LANGUAGE: "anchored at left third", "filling upper half", "spanning full width"
- Use PHOTOGRAPHY LANGUAGE: "extreme close-up", "shallow depth of field", "rim lighting"
- Use ARCHETYPE descriptions: "weathered hands gripping crumpled cash" not "person's hands"
- Describe text+container as ONE unit: "bold white text inside a crimson warning badge"
- Say "graphic design composition" to trigger flat 2D text layers
- Specify atmosphere: "ominous", "dramatic", "urgent", "mysterious", "shocking"

================================================
CTR PERFORMANCE TIERS
================================================

TIER 1 (8-10 CTR score) - Stops EVERY scroll:
- Immediately creates an emotion
- Has clear focal point visible at thumbnail size
- Creates an unanswered question in under 2 seconds
- Looks completely different from competing videos

TIER 2 (6-7 CTR score) - Stops MOST scrolls:
- Creates emotion but requires 2-3 seconds to process
- Clear composition but less immediate impact
- Good but predictable

TIER 3 (4-5 CTR score) - Stops SOME scrolls:
- Requires reading text to understand the hook
- Composition is clear but not immediately arresting

ONLY generate Tier 1 concepts. If a concept would score below 8, discard it and generate a better one.

================================================
THUMBNAIL CONCEPT TYPES (use variety across 10 concepts)
================================================

TYPE A - THE REVELATION: Something hidden being exposed (document, secret, hidden compartment)
TYPE B - THE WARNING: Danger signal, red alert, cautionary image
TYPE C - THE COMPARISON: Side-by-side contrast (winner/loser, smart/foolish, before/after)
TYPE D - THE EMOTION CLOSE-UP: Extreme close-up of hands, objects, or textures with emotional weight
TYPE E - THE DATA SHOCK: Chart, graph, or number with shocking implication
TYPE F - THE FORBIDDEN: Classified/banned/censored visual treatment
TYPE G - THE TRANSFORMATION: Before-and-after visual narrative
TYPE H - THE SYMBOL: Powerful symbolic object that represents the topic's core tension
TYPE I - THE ENVIRONMENT: A setting that tells the whole story (abandoned office, luxury vs poverty)
TYPE J - THE ABSTRACT METAPHOR: Surreal or conceptual visual that forces curiosity

================================================
EXAMPLES OF 10/10 vs 5/10 THUMBNAILS
================================================

TOPIC: "How Banks Make Money From Your Account"

5/10 CONCEPTS (DO NOT DESIGN LIKE THESE):
- "Bank building photo with the video title as text"
- "Stock photo of money with a question mark"
- "Generic piggy bank image with text overlay"

10/10 CONCEPTS (DESIGN LIKE THESE):
- "Extreme close-up of hands tightly gripping a wallet while dollar bills drain out through cracks between fingers, dramatic side lighting creating deep shadows, crimson red background fading to black, bold white text 'THEY KNEW' in upper third inside a red warning stamp, ominous atmosphere"
- "Split composition: left side shows gleaming marble bank lobby in cool blue tones, right side shows cluttered modest kitchen table with bills and calculator in warm anxious amber tones, bold yellow arrow pointing LEFT toward bank, text 'YOUR MONEY' in gritty stencil font at bottom"
- "Overhead flat-lay of a paper bank statement with specific line items visible but blurred, one line circled in red marker reading 'WHAT IS THIS CHARGE', dramatic single spotlight, magnifying glass hovering over the circled item, dark wooden desk, urgent documentary atmosphere"

================================================
OUTPUT FORMAT (EXACT JSON)
================================================

{
  "ctr_strategy": "Overall psychological approach for this video's thumbnails",
  "thumbnails": [
    {
      "rank": 1,
      "concept_type": "revelation/warning/comparison/emotion_closeup/data_shock/forbidden/transformation/symbol/environment/abstract",
      "psychological_trigger": "curiosity_gap/fear/forbidden_knowledge/social_proof/emotional_contrast",
      "concept_description": "Natural language description of the concept and WHY it will stop scrolls",
      "focal_point": "The single most important visual element the eye goes to first",
      "visual_metaphor": "What this image symbolically represents about the video topic",
      "color_scheme": "3 colors maximum, named colors only, with their roles (dominant/accent/text)",
      "text_overlay": "Maximum 4 words",
      "text_style": "Description of how text looks (font weight, container, position, color)",
      "style_reference": "cinematic/minimal/documentary/dramatic/corporate/gritty",
      "ctr_score": 9,
      "why_it_stops_scrolling": "Specific psychological reason — what question or emotion hits in under 2 seconds",
      "faceless_adaptation": "How this works without a presenter face",
      "ab_test_alternative": "Which other concept from the list to A/B test against",
      "image_prompt": "16:9 aspect ratio, 1280x720 resolution, widescreen landscape format, graphic design composition. [COMPLETE 200+ word natural language prompt with: exact spatial layout, foreground/midground/background description, lighting type and direction, color palette with named colors, text as unified design elements with containers, atmosphere and mood, render quality descriptors, photography-style direction]. NO percentages. NO hex codes. NO pixel measurements. Explicitly state 16:9 widescreen format."
    }
  ]
}

REQUIREMENTS:
- Generate ALL 10 concepts using different concept types
- Every image_prompt must be 200+ words
- Every concept must score 8+ on CTR (Tier 1 only)
- Rank by overall CTR and algorithmic performance potential
- Explicitly design for faceless channel (no presenter face)
- Every prompt must state 16:9 format explicitly

Generate 10 premium viral thumbnail concepts now.`;

    const result = await safeGeminiCall(prompt, 0.9);

    if (!result.success) {
      console.error('Gemini failed:', result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    if (!result.data.thumbnails || !Array.isArray(result.data.thumbnails)) {
      return Response.json({ error: 'Invalid response format from Gemini' }, { status: 500 });
    }

    // Delete existing thumbnails
    try {
      const existing = await base44.entities.ThumbnailConcepts.filter({ project_id });
      for (const e of existing) {
        await base44.entities.ThumbnailConcepts.delete(e.id);
      }
    } catch (deleteErr) {
      console.warn('Failed to delete existing thumbnails:', deleteErr.message);
    }

    const thumbnails = [];
    const skipped = [];
    let qualityWarnings = 0;

    for (const t of result.data.thumbnails) {
      const validation = validateThumbnail(t);
      if (!validation.valid) {
        qualityWarnings++;
        console.warn(`Thumbnail ${t.rank} issues: ${validation.issues.join(', ')}`);
      }

      // Auto-patch missing 16:9 specification
      let imagePrompt = t.image_prompt || '';
      if (!imagePrompt.toLowerCase().includes('16:9')) {
        imagePrompt = `16:9 aspect ratio, 1280x720 resolution, widescreen landscape format, graphic design composition. ${imagePrompt}`;
      }

      try {
        const record = await base44.entities.ThumbnailConcepts.create({
          project_id: project_id,
          rank: t.rank || thumbnails.length + 1,
          concept_type: t.concept_type || 'revelation',
          psychological_trigger: t.psychological_trigger || 'curiosity_gap',
          concept_description: t.concept_description || '',
          focal_point: t.focal_point || '',
          visual_metaphor: t.visual_metaphor || '',
          color_scheme: t.color_scheme || '',
          text_overlay: t.text_overlay || '',
          text_style: t.text_style || '',
          style_reference: t.style_reference || 'cinematic',
          ctr_score: t.ctr_score || 7,
          why_it_stops_scrolling: t.why_it_stops_scrolling || '',
          faceless_adaptation: t.faceless_adaptation || '',
          ab_test_alternative: t.ab_test_alternative || '',
          image_prompt: imagePrompt,
          quality_valid: validation.valid,
          is_selected: false
        });

        thumbnails.push(record);
        console.log(`Saved thumbnail ${t.rank}: [${t.concept_type}] "${t.text_overlay}" CTR: ${t.ctr_score}/10`);
      } catch (saveErr) {
        console.error(`Failed to save thumbnail ${t.rank}:`, saveErr.message);
        skipped.push({ rank: t.rank, error: saveErr.message });
      }
    }

    try {
      await base44.entities.Projects.update(project_id, { current_step: 12 });
    } catch (updateErr) {
      console.warn('Failed to update project step:', updateErr.message);
    }

    console.log('================================================');
    console.log(`Thumbnails saved: ${thumbnails.length}`);
    console.log(`Thumbnails skipped: ${skipped.length}`);
    console.log(`Quality warnings: ${qualityWarnings}`);
    console.log(`CTR strategy: ${result.data.ctr_strategy}`);
    console.log('================================================');

    return Response.json({
      success: true,
      thumbnails,
      meta: {
        ctr_strategy: result.data.ctr_strategy,
        total_generated: result.data.thumbnails.length,
        total_saved: thumbnails.length,
        total_skipped: skipped.length,
        quality_warnings: qualityWarnings,
        skipped_details: skipped
      }
    });

  } catch (error) {
    console.error('generateThumbnailConcepts error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});