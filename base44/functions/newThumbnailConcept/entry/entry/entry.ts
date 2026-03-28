import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// newThumbnailConcept — Lean & intelligent thumbnail concept generator
// v2 — redeployed

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      video_title,
      summary = '',
      char_photos = [],
      project_id,
      seo_titles,
      template_id,
      template_name,
      template_psychology,
      template_text_strategy,
      template_ctr,
      template_b64,
      template_mime,
    } = body;

    if (!video_title?.trim()) {
      return Response.json({ error: 'video_title is required' }, { status: 400 });
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY'); 
    if (!GEMINI_API_KEY) {
      return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const hasCharPhotos   = Array.isArray(char_photos) && char_photos.some(p => p?.b64);
    const hasUserTemplate = !!(template_id && template_b64);

    console.log('=== newThumbnailConcept (lean) ===');
    console.log('Title:', video_title);
    console.log('Has char photos:', hasCharPhotos);
    console.log('Has user template:', hasUserTemplate);

    // ── LOAD SEO TITLES for pairing context ──────────────────────
    // If SEO titles were already generated, overlay texts should COMPLEMENT them
    let seoTitleContext = '';
    try {
      let savedTitles = [];

      // Priority 1: Frontend passed selected SEO titles directly
      if (Array.isArray(seo_titles) && seo_titles.length > 0) {
        savedTitles = seo_titles.filter(Boolean);
        console.log(`Using ${savedTitles.length} SEO titles passed from frontend`);
      }
      // Priority 2: Look up UploadMetadata by project_id
      else if (project_id) {
        const metaList = await base44.asServiceRole.entities.UploadMetadata.filter({ project_id });
        if (metaList[0]) {
          savedTitles = [metaList[0].title_primary, metaList[0].title_variation_1, metaList[0].title_variation_2, metaList[0].title_variation_3, metaList[0].title_variation_4].filter(Boolean);
          console.log(`Found ${savedTitles.length} SEO titles from project metadata`);
        }
      }

      if (savedTitles.length > 0) {
        seoTitleContext = `\n\nEXISTING SEO TITLES (overlay text must COMPLEMENT these — add visual tension, never repeat their words):
${savedTitles.map((t, i) => `- Title ${i + 1}: "${t}"`).join('\n')}
The overlay text + SEO title together should create an irresistible curiosity package.`;
      }
    } catch (e) {
      console.warn('Could not load SEO titles for context:', e.message);
    }

    // ── BUILD GEMINI PROMPT ──────────────────────────────────────
    // We send the title + summary to Gemini and ask for:
    // 1. Detected mood/niche
    // 2. 5 overlay texts that are psychologically engineered for max CTR
    // 3. One image_prompt per concept (used by image generation later)

    const contentParts = [];

    // Include character photos so Gemini can describe them accurately
    // in the image prompts (so the render function knows what these people look like)
    if (hasCharPhotos) {
      for (let i = 0; i < char_photos.length; i++) {
        const p = char_photos[i];
        if (p?.b64 && p?.mime) {
          contentParts.push({ inline_data: { mime_type: p.mime, data: p.b64 } });
          contentParts.push({ text: `CHARACTER ${i + 1} — study this person's face, skin tone, hair, and features carefully. All image prompts must describe them accurately.` });
        }
      }
    }

    // Include template if provided
    if (hasUserTemplate) {
      contentParts.push({ inline_data: { mime_type: template_mime || 'image/jpeg', data: template_b64 } });
      contentParts.push({ text: `LAYOUT TEMPLATE — study the composition, character positions, background, lighting, and text zones. All image prompts must recreate this layout exactly.` });
    }

    contentParts.push({ text: `You are the world's #1 YouTube thumbnail psychologist and CTR strategist — combining the visual genius of MrBeast, the clarity of Alex Hormozi, and the emotional manipulation of true crime documentaries.

VIDEO TITLE: "${video_title}"
${summary ? `SUMMARY: "${summary}"` : ''}${seoTitleContext}

YOUR JOB:
1. Extract the KEY OBJECTS and SUBJECTS from the script/title/summary
2. Determine the best thumbnail STRATEGY (split-screen, before/after, hero shot, etc.)
3. Generate exactly 5 thumbnail concepts with objects intelligently placed

════════════════════════════
STEP 0 — EXTRACT STORY OBJECTS (CRITICAL)
════════════════════════════
Analyze the title and summary to identify the CENTRAL VISUAL OBJECTS that viewers must see to instantly understand the video:

OBJECT EXTRACTION RULES — DYNAMIC (NO HARDCODED CATEGORIES):
Do NOT rely on predefined categories. Instead, follow this 3-step process:

STEP A — READ the title and summary word-by-word. Identify:
  1. PRIMARY SUBJECT: The single most important thing the video is about (a product, person, event, place, concept, activity, etc.)
  2. SECONDARY OBJECTS: Any supporting items, tools, locations, or props mentioned
  3. EMOTIONAL STATE: The key emotion or transformation described
  
  Examples of what to extract (these are examples, NOT a fixed list):
  - "19-year-old sells custom t-shirts from dorm room" → PRIMARY: custom t-shirts / merch. SECONDARY: dorm room, heat press, packaging. PERSON: 19-year-old female entrepreneur
  - "Man catches wife cheating with neighbor" → PRIMARY: the confrontation moment. SECONDARY: phone/evidence, doorway, bedroom. PERSON: angry husband, guilty wife
  - "How I mass produced 10,000 candles" → PRIMARY: candles. SECONDARY: wax pouring equipment, workshop, packaging line

STEP B — If CHARACTER PHOTOS were uploaded, study them:
  - What objects are visible in the photos? (clothing, tools, products, setting/background)
  - Use these REAL objects from the photos as props in the thumbnail — they ground the image in reality
  - The person's actual environment, outfit, and items are MORE valuable than imagined ones

STEP C — If a TEMPLATE image was uploaded, study it:
  - DETECT every major object in the template (vehicles, products, buildings, symbols, props, backgrounds)
  - MAP each template object to its story-relevant replacement from Steps A and B
  - Example: Template has dump trucks → story is about t-shirts → replace trucks with stacks of colorful custom t-shirts
  - Example: Template has a luxury car → story is about cooking → replace car with a sizzling dish or restaurant
  - KEEP the same size, position, framing, and visual weight — only change WHAT the object is

ANTI-HALLUCINATION RULE (CRITICAL):
- ONLY use objects that are mentioned in the title, summary, or visible in uploaded photos
- NEVER invent generic "success" symbols (supercars, mansions, yachts, gold chains, private jets) unless the summary LITERALLY mentions them
- If the story is about a specific product or business, THAT product/business must be the dominant visual — not a proxy or metaphor
- The thumbnail must be INSTANTLY recognizable as being about the exact topic described in the summary
- When in doubt, use the LITERAL objects from the summary, not abstract interpretations

These extracted objects MUST appear prominently in EVERY image prompt.

════════════════════════════
STEP 1 — DETECT MOOD + CHOOSE STRATEGY
════════════════════════════
From the title/summary, DEDUCE the single best emotional mood. Do NOT pick from a fixed list — derive it organically from the content.
Examples: crime, drama, comedy, finance, inspirational, educational, horror, romantic, entrepreneurial, mystery, sports, gaming, cooking, beauty, travel, parenting, etc.
Use whatever single word best captures the emotional tone. Be specific.

Then choose the BEST thumbnail strategy:
- SPLIT SCREEN (before/after, then/now, good/bad, rich/poor): Use when there's a contrast or comparison. One side dark/sorrowful, other side bright/successful. Like MrBeast "$1 vs $1,000,000" format.
- HERO SHOT: Single powerful character with extracted objects around them. Use for story-driven content.
- REACTION/SHOCK: Character with exaggerated expression + the object that caused the reaction. Use for reveal/discovery content.
- PROGRESSION: Show transformation from point A to point B with arrow or timeline. Use for journey/growth stories.
- VERSUS: Two subjects facing each other with VS or lightning bolt between them. Use for competition content.
- MYSTERY/REVEAL: Partially hidden object with red circle or spotlight. Use for curiosity-gap content.

════════════════════════════
STEP 2 — OVERLAY TEXT LAWS (ALL 5 MUST OBEY THESE)
════════════════════════════

LAW 1 — ZERO OVERLAP (HARD RULE):
The overlay text MUST NOT repeat any word from the title OR the SEO titles listed above.
Title words are banned: ${video_title.toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(w=>w.length>2).join(', ')}

LAW 2 — WORD COUNT VARIETY (CRITICAL):
Generate a MIX of overlay text lengths across the 5 concepts:
- Concept 1: exactly 3 words
- Concept 2: exactly 4 words
- Concept 3: exactly 5 words
- Concept 4: exactly 3 words
- Concept 5: exactly 4 words
ALL CAPS. Font: Impact or Bebas Neue only.
Thumbnails are seen at 168x94px on mobile — keep words short and punchy even at 4-5 words.

LAW 3 — TRIGGER ONE HIGH-AROUSAL EMOTION:
Every text must trigger exactly one of: FEAR · GREED · SHOCK · CURIOSITY
Banned generic words: "SHOCKING", "AMAZING", "INCREDIBLE", "YOU WON'T BELIEVE", "MUST WATCH"

LAW 4 — SENTIMENT PIVOT:
- If title sounds POSITIVE → hook must create TENSION or WARNING
- If title sounds NEGATIVE → hook must AMPLIFY the stakes
- If title is VAGUE → hook must add a SPECIFIC number, name, or consequence

════════════════════════════
STEP 3 — IMAGE PROMPT RULES
════════════════════════════
Each concept needs a detailed image_prompt (300+ words) that:
- Starts with: "1920x1080 YouTube thumbnail, photorealistic, cinematic DSLR quality"
- MUST feature the PRIMARY SUBJECT and SECONDARY OBJECTS you extracted in Step 0 as the dominant visual elements
- The PRIMARY SUBJECT from the summary must be physically visible and prominent — not symbolized or abstracted
- NEVER substitute the actual story subject with unrelated objects — if it's about t-shirts, show t-shirts; if it's about cooking, show food
- For SPLIT SCREEN concepts: describe LEFT side and RIGHT side separately with contrasting mood/lighting and the story objects on both sides
- For BEFORE/AFTER: left side = struggling/before state; right side = successful/after state — both sides must show the actual subject
- Describes character emotion/pose, lighting (rim lights, key light), and environment
- ${hasCharPhotos ? `CRITICAL: The image_prompt MUST explicitly state that the person in the thumbnail is the EXACT person from the uploaded reference photo(s). Write something like: "The person in this image must be the EXACT same person from the reference photo — same face, same skin tone, same hair color/style/texture, same facial structure, same ethnicity, same gender, same age. Do NOT generate a different or generic person." Also describe visible features you can see in the photos (hair color, skin tone, build, clothing) so the image generator has textual anchors. Also INCORPORATE any real objects visible in the character photos (their clothing, tools, products, workspace) into the scene as props.` : 'Creates characters that match what the summary describes — if it mentions a specific person (age, gender, ethnicity, setting), the character MUST match that description exactly'}
- ${hasUserTemplate ? `Recreates the layout from the uploaded template: "${template_name}" — same composition, character positions, background zones, lighting style.
  CRITICAL TEMPLATE OBJECT SWAP: First IDENTIFY every distinct object in the template (vehicles, products, buildings, animals, symbols, props). Then REPLACE each one with the corresponding story-relevant object from your extraction. The replacement must occupy the same space and visual weight as the original. If the template shows 3 trucks, replace with 3 piles of the actual product. Match quantity, scale, and placement.` : 'Uses the chosen strategy layout (split-screen, hero, etc.)'}
- Ends with: "NO text, letters, numbers, or watermarks anywhere in the image"

════════════════════════════
OUTPUT FORMAT — JSON ONLY
════════════════════════════
Return ONLY a valid JSON object. No markdown. No explanation. No backticks.

{
  "detected_mood": "the single best emotional tone — deduce it from the title/summary, do not pick from a fixed list. Use lowercase single word like: crime, drama, comedy, finance, inspirational, educational, horror, romantic, mystery, entrepreneurial, sports, gaming, etc.",
  "mood_reasoning": "one sentence why",
  "primary_subject": "the ONE main thing this video is about — be ultra-specific (e.g. 'custom printed t-shirts' not 'business')",
  "extracted_objects": ["list", "of", "every", "specific", "physical", "object", "mentioned", "in", "summary"],
  "objects_from_photos": ["list of objects you can see in the uploaded character photos, if any"],
  "objects_in_template": ["list of objects you can see in the uploaded template image, if any"],
  "object_swap_map": {"template_object_1": "story_replacement_1", "template_object_2": "story_replacement_2"},
  "thumbnail_strategy": "split_screen | hero_shot | reaction | progression | versus | mystery",
  "strategy_reasoning": "why this strategy works for this content",
  "concepts": [
    {
      "rank": 1,
      "text_overlay": "3-5 WORDS ALL CAPS (follow word count assignment above) — no title words",
      "emotion_triggered": "FEAR|GREED|SHOCK|CURIOSITY",
      "why_this_works": "one sentence psychological explanation",
      "objects_used": ["which extracted objects appear in this thumbnail"],
      "layout_type": "split_screen|hero|reaction|progression|versus|mystery",
      "text_position": "upper-left|bottom-center",
      "text_color": "white|yellow|red",
      "objects_used": ["which extracted objects appear in this thumbnail"],
      "layout_type": "split_screen|hero|reaction|progression|versus|mystery",
      "ctr_score": 9,
      "image_prompt": "1920x1080 YouTube thumbnail, photorealistic... (300+ words, the PRIMARY SUBJECT and extracted objects must be the DOMINANT visual elements, describe template object swaps explicitly, NO text in image)"
    }
  ]
}

FINAL VALIDATION BEFORE OUTPUT:
- Re-read the summary one more time
- For EACH image_prompt, verify: does the PRIMARY PRODUCT/SUBJECT from the summary appear as a dominant visual element?
- If any image_prompt contains objects NOT mentioned in the summary (random vehicles, buildings, animals, etc.), REMOVE them and replace with the actual story subject
- The viewer should be able to look at the thumbnail and immediately know what the video is about` });

    // ── CALL GEMINI ──────────────────────────────────────────────
    const geminiModel = 'gemini-2.0-flash';
    console.log('Calling Gemini:', geminiModel, '| parts:', contentParts.length);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: contentParts }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 6000 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      throw new Error(`Gemini ${geminiRes.status}: ${err.substring(0, 300)}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    // Parse Gemini response
    let parsed = {};
    try { parsed = JSON.parse(rawText); } catch (_) {}
    if (!parsed?.concepts?.length) {
      const m = rawText.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch (_) {} }
    }
    if (!parsed?.concepts?.length) {
      throw new Error('Gemini did not return valid concepts JSON');
    }

    // Normalize mood — Gemini sometimes returns pipe-separated or comma-separated values
    const rawDetectedMood = (parsed.detected_mood || 'drama').toLowerCase().replace(/[,|]/g, '|');
    const detectedMood = rawDetectedMood.split('|')[0].trim() || 'drama';
    const concepts = parsed.concepts.slice(0, 5);
    const primarySubject = parsed.primary_subject || '';
    const extractedObjects = parsed.extracted_objects || [];
    const objectsFromPhotos = parsed.objects_from_photos || [];
    const objectsInTemplate = parsed.objects_in_template || [];
    const objectSwapMap = parsed.object_swap_map || {};
    const thumbnailStrategy = parsed.thumbnail_strategy || 'hero_shot';
    console.log(`Mood: ${detectedMood} | Strategy: ${thumbnailStrategy}`);
    console.log(`Primary subject: ${primarySubject}`);
    console.log(`Objects from story: ${extractedObjects.join(', ')}`);
    console.log(`Objects from photos: ${objectsFromPhotos.join(', ')}`);
    console.log(`Objects in template: ${objectsInTemplate.join(', ')}`);
    console.log(`Object swap map: ${JSON.stringify(objectSwapMap)}`);
    console.log(`Concepts: ${concepts.length}`);

    // ── SAVE CONCEPT RECORDS ─────────────────────────────────────
    const sessionId = project_id || `thumb_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const saved = [];
    const failed = [];

    // Compress char photos for storage
    const charPhotosForStorage = [];
    if (hasCharPhotos) {
      for (const p of char_photos.filter(p => p?.b64)) {
        const maxB64 = 200000;
        charPhotosForStorage.push({
          b64: p.b64.length > maxB64 ? p.b64.substring(0, maxB64) : p.b64,
          mime: p.mime || 'image/jpeg',
          truncated: p.b64.length > maxB64,
        });
      }
    }

    for (const [i, c] of concepts.entries()) {
      try {
        // Bake overlay text into the image prompt so the render function
        // has everything it needs in one place
        let imagePrompt = c.image_prompt || '';
        if (!imagePrompt.startsWith('1920x1080')) {
          imagePrompt = `1920x1080 YouTube thumbnail, photorealistic, cinematic DSLR quality. ${imagePrompt}`;
        }

        if (c.text_overlay) {
          imagePrompt += `

TEXT OVERLAY — RENDER IN IMAGE:
Text: "${c.text_overlay.toUpperCase()}"
Font: Impact or Bebas Neue, ultra-bold, condensed
Color: ${c.text_color || 'white'} with 6px black stroke outline and drop shadow
Size: 15-20% of frame height — readable at mobile thumbnail size
Position: ${c.text_position || 'upper-left'}
Must be SHARP, CRISP, and PERFECTLY READABLE.
Do NOT add any other text.`;
        }

        const record = await base44.entities.ThumbnailConcepts.create({
          project_id:             sessionId,
          rank:                   c.rank ?? (i + 1),
          concept_type:           c.emotion_triggered ?? 'shock',
          psychological_trigger:  c.emotion_triggered ?? 'Shock',
          concept_description:    `${c.why_this_works || ''} | Strategy: ${c.layout_type || thumbnailStrategy} | Primary: ${primarySubject} | Objects: ${(c.objects_used || extractedObjects).join(', ')} | Swaps: ${JSON.stringify(objectSwapMap)}`,
          visual_metaphor:        detectedMood,
          color_scheme:           c.text_color ?? 'white | black outline',
          text_overlay:           c.text_overlay ?? '',
          text_style:             `${c.text_color || 'white'} | thick 6px black outline | ${c.text_position || 'upper-left'} | Impact`,
          ctr_score:              c.ctr_score ?? 8,
          why_it_stops_scrolling: c.why_this_works ?? '',
          image_prompt:           imagePrompt,
          negative_prompt:        'text, letters, numbers, watermark, blurry, distorted faces, cartoon, anime',
          mood:                   detectedMood,
          title:                  video_title,
          status:                 'pending',
          quality_valid:          true,
          is_selected:            false,
          image_url:              null,
          char_photos_json:       charPhotosForStorage.length > 0 ? JSON.stringify(charPhotosForStorage) : null,
          template_ref_json:      hasUserTemplate
                                    ? JSON.stringify({ b64: template_b64, mime: template_mime || 'image/jpeg', name: template_name })
                                    : null,
        });

        console.log(`Saved #${c.rank ?? i+1}: "${c.text_overlay}" | Emotion: ${c.emotion_triggered} | CTR: ${c.ctr_score}`);
        saved.push(record.id);
      } catch (saveErr) {
        console.error(`Failed to save concept #${i+1}:`, saveErr.message);
        failed.push({ rank: i + 1, error: saveErr.message });
      }
    }

    if (!saved.length) {
      return Response.json({ error: `All concepts failed to save. Error: ${failed[0]?.error}` }, { status: 500 });
    }

    console.log(`=== Done: ${saved.length} saved, ${failed.length} failed ===`);

    return Response.json({
      success: true,
      concept_ids: saved,
      project_id: sessionId,
      concepts_saved: saved.length,
      detected_mood: detectedMood,
      template_selection: {
        primary_template:   hasUserTemplate ? template_name : detectedMood,
        used_user_template: hasUserTemplate,
        used_char_photos:   hasCharPhotos,
        char_photo_count:   char_photos.filter(p => p?.b64).length,
        all_templates:      hasUserTemplate
                              ? [{ name: template_name, ctr: template_ctr }]
                              : [{ name: detectedMood, ctr: '8-12%' }],
      },
      meta: { total_saved: saved.length, total_failed: failed.length, gemini_model: geminiModel },
    });

  } catch (error) {
    console.error('newThumbnailConcept error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
