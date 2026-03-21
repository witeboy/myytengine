import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// newThumbnailConcept — Structured Element Mapping Thumbnail Generator
// 
// FLOW:
// 1. Gemini STEP A: Classify each uploaded photo → CHARACTER / ENVIRONMENT / OBJECT
// 2. Gemini STEP B: Condense summary → 3 structured elements + 5 overlay texts
// 3. Save concepts with role_mapping so image generator knows exactly what each photo is

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

    const hasCharPhotos   = Array.isArray(char_photos) && char_photos.some(p => p?.b64 || p?.url);
    const hasUserTemplate = !!(template_id && template_b64);
    const photoCount = char_photos.filter(p => p?.b64 || p?.url).length;

    console.log('=== newThumbnailConcept (structured element mapping) ===');
    console.log('Title:', video_title);
    console.log('Photos:', photoCount, '| Template:', hasUserTemplate ? template_name : 'NONE');

    // ── Helper: call Gemini ──────────────────────────────────────
    async function callGemini(parts, maxTokens = 4000, temp = 0.7) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: temp, maxOutputTokens: maxTokens },
          }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini ${res.status}: ${err.substring(0, 300)}`);
      }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    }

    function parseJSON(raw) {
      let parsed = {};
      try { parsed = JSON.parse(raw); } catch (_) {}
      if (!parsed || Object.keys(parsed).length === 0) {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch (_) {} }
      }
      return parsed;
    }

    // ════════════════════════════════════════════════════════════════
    // STEP A: CLASSIFY PHOTOS → CHARACTER / ENVIRONMENT / OBJECT
    // ════════════════════════════════════════════════════════════════
    let photoRoles = []; // [{index, role, description}, ...]

    if (hasCharPhotos) {
      console.log('--- STEP A: Classifying photos ---');
      const classifyParts = [];

      // Send each photo
      const validPhotos = char_photos.filter(p => p?.b64 || p?.url);
      for (let i = 0; i < validPhotos.length; i++) {
        const p = validPhotos[i];
        if (p?.b64 && p?.mime) {
          classifyParts.push({ inline_data: { mime_type: p.mime, data: p.b64 } });
          classifyParts.push({ text: `PHOTO ${i + 1} — analyze this image carefully.` });
        } else if (p?.url) {
          // For URL-based photos, we can't send inline — describe by position
          classifyParts.push({ text: `PHOTO ${i + 1} — (remote image, cannot display inline). User described it as a scene/reference image.` });
        }
      }

      classifyParts.push({ text: `You are analyzing ${validPhotos.length} uploaded photo(s) for a YouTube thumbnail.

VIDEO TITLE: "${video_title}"
${summary ? `VIDEO SUMMARY (first 500 chars): "${summary.substring(0, 500)}"` : ''}

For EACH photo, classify it into exactly ONE role:
- CHARACTER: Shows a person's face/body — this person will APPEAR in the thumbnail
- ENVIRONMENT: Shows a location/setting/background — this will be used as a BLURRED BACKGROUND
- OBJECT: Shows a product/item/prop — this will be placed PROMINENTLY in the thumbnail

Return ONLY valid JSON. No markdown. No backticks.

{
  "photos": [
    {
      "index": 1,
      "role": "CHARACTER|ENVIRONMENT|OBJECT",
      "description": "detailed description of what's in this photo — for CHARACTER: describe face, skin tone, hair, age, gender, ethnicity, clothing, expression. For ENVIRONMENT: describe the setting, colors, mood. For OBJECT: describe the item, its color, shape, texture.",
      "key_features": "the 3-5 most distinctive visual features"
    }
  ]
}` });

      const classifyRaw = await callGemini(classifyParts, 2000, 0.3);
      const classified = parseJSON(classifyRaw);

      if (classified?.photos?.length > 0) {
        photoRoles = classified.photos;
        console.log('Photo classifications:');
        for (const pr of photoRoles) {
          console.log(`  Photo ${pr.index}: ${pr.role} — ${(pr.description || '').substring(0, 80)}`);
        }
      } else {
        console.warn('Photo classification failed, defaulting all to CHARACTER');
        photoRoles = validPhotos.map((_, i) => ({
          index: i + 1,
          role: 'CHARACTER',
          description: 'Unclassified photo — treat as character reference',
          key_features: 'unknown',
        }));
      }
    }

    // ════════════════════════════════════════════════════════════════
    // STEP B: CONDENSE SUMMARY + GENERATE 5 CONCEPTS
    // ════════════════════════════════════════════════════════════════
    console.log('--- STEP B: Generating structured concepts ---');

    // Load SEO titles for context
    let seoTitleContext = '';
    try {
      let savedTitles = [];
      if (Array.isArray(seo_titles) && seo_titles.length > 0) {
        savedTitles = seo_titles.filter(Boolean);
      } else if (project_id) {
        const metaList = await base44.asServiceRole.entities.UploadMetadata.filter({ project_id });
        if (metaList[0]) {
          savedTitles = [metaList[0].title_primary, metaList[0].title_variation_1, metaList[0].title_variation_2, metaList[0].title_variation_3, metaList[0].title_variation_4].filter(Boolean);
        }
      }
      if (savedTitles.length > 0) {
        seoTitleContext = `\n\nEXISTING SEO TITLES (overlay text must COMPLEMENT these — never repeat their words):
${savedTitles.map((t, i) => `- Title ${i + 1}: "${t}"`).join('\n')}`;
      }
    } catch (e) {
      console.warn('Could not load SEO titles:', e.message);
    }

    // Build photo role context for the main prompt
    let photoRoleContext = '';
    if (photoRoles.length > 0) {
      const characters = photoRoles.filter(p => p.role === 'CHARACTER');
      const environments = photoRoles.filter(p => p.role === 'ENVIRONMENT');
      const objects = photoRoles.filter(p => p.role === 'OBJECT');

      photoRoleContext = `\n\nUPLOADED PHOTO ROLES (already classified):`;
      if (characters.length > 0) {
        photoRoleContext += `\nCHARACTER PHOTOS (${characters.length}):`;
        characters.forEach(c => { photoRoleContext += `\n  - Photo ${c.index}: ${c.description}`; });
      }
      if (environments.length > 0) {
        photoRoleContext += `\nENVIRONMENT PHOTOS (${environments.length}):`;
        environments.forEach(e => { photoRoleContext += `\n  - Photo ${e.index}: ${e.description}`; });
      }
      if (objects.length > 0) {
        photoRoleContext += `\nOBJECT PHOTOS (${objects.length}):`;
        objects.forEach(o => { photoRoleContext += `\n  - Photo ${o.index}: ${o.description}`; });
      }
    }

    const conceptParts = [];

    // Include template image so Gemini can study its layout
    if (hasUserTemplate) {
      conceptParts.push({ inline_data: { mime_type: template_mime || 'image/jpeg', data: template_b64 } });
      conceptParts.push({ text: `LAYOUT TEMPLATE — "${template_name}". Study its composition, text zones, character positions, background style, and color scheme. All concepts must recreate this layout.` });
    }

    // Include character/object photos so Gemini can describe them in prompts
    if (hasCharPhotos) {
      const validPhotos = char_photos.filter(p => p?.b64 && p?.mime);
      for (let i = 0; i < validPhotos.length; i++) {
        const p = validPhotos[i];
        const role = photoRoles[i]?.role || 'CHARACTER';
        conceptParts.push({ inline_data: { mime_type: p.mime, data: p.b64 } });
        conceptParts.push({ text: `PHOTO ${i + 1} — Role: ${role}. ${photoRoles[i]?.description || ''}` });
      }
    }

    conceptParts.push({ text: `You are the world's #1 YouTube thumbnail strategist.

VIDEO TITLE: "${video_title}"
SUMMARY: "${summary}"${seoTitleContext}${photoRoleContext}

════════════════════════════════
YOUR TASK — TWO OUTPUTS
════════════════════════════════

OUTPUT 1: STRUCTURED STORY ELEMENTS (condense the summary into exactly 3 categories, max 300 words total)

A) CHARACTER(S): Who is the main person(s)? Full physical description — age, gender, ethnicity, hair color/style, skin tone, body build, what they're wearing. What facial expression should they have in the thumbnail?
   ${photoRoles.filter(p => p.role === 'CHARACTER').length > 0 ? `USE THE DESCRIPTIONS FROM THE CHARACTER PHOTOS ABOVE — the thumbnail MUST show these EXACT people.` : 'Describe the person from the summary.'}

B) ENVIRONMENT: Where does the key moment happen? Describe the setting in vivid detail — this will become a BLURRED BACKGROUND in the thumbnail. Colors, lighting, atmosphere, time of day.
   ${photoRoles.filter(p => p.role === 'ENVIRONMENT').length > 0 ? `USE THE ENVIRONMENT PHOTO DESCRIPTION ABOVE as the primary reference.` : 'Derive from the summary.'}

C) OBJECT(S): What is the key physical product/item/prop? Describe it precisely — color, shape, size, texture, condition. This will be placed PROMINENTLY in the foreground.
   ${photoRoles.filter(p => p.role === 'OBJECT').length > 0 ? `USE THE OBJECT PHOTO DESCRIPTION ABOVE as the primary reference.` : 'Derive from the summary.'}

OUTPUT 2: 5 OVERLAY TEXT CONCEPTS

OVERLAY TEXT RULES:
- ZERO OVERLAP with title words: ${video_title.toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(w=>w.length>2).join(', ')}
- Word count: Concept 1=3 words, 2=4 words, 3=5 words, 4=3 words, 5=4 words
- ALL CAPS. Font: Impact or Bebas Neue.
- Each triggers one of: FEAR · GREED · SHOCK · CURIOSITY
- Banned: "SHOCKING", "AMAZING", "INCREDIBLE", "YOU WON'T BELIEVE"

For each concept, write an image_prompt (200+ words) that:
- Starts with "1920x1080 YouTube thumbnail, photorealistic, cinematic DSLR quality"
- Places the CHARACTER in the foreground with the specified expression
- Uses the ENVIRONMENT as a gaussian-blurred background
- Places the OBJECT(S) prominently — held by character, on a surface nearby, or as a visual prop
- ${hasUserTemplate ? `Recreates the EXACT layout from template "${template_name}" — same composition, same text zone positions, same character framing, same background style` : 'Uses the best strategy layout for this content'}
- Ends with "NO text, letters, numbers, or watermarks in the image"
- CRITICAL: The image_prompt should NOT try to render text — the overlay text is added separately

════════════════════════════════
OUTPUT FORMAT — JSON ONLY (no markdown, no backticks)
════════════════════════════════
{
  "story_elements": {
    "characters": "full description of main character(s) — physical features, clothing, expression",
    "environment": "full description of setting/background",
    "objects": "full description of key product/item/prop"
  },
  "detected_mood": "single lowercase word — derived organically",
  "mood_reasoning": "one sentence",
  "thumbnail_strategy": "split_screen|hero_shot|reaction|progression|versus|mystery",
  "concepts": [
    {
      "rank": 1,
      "text_overlay": "3-5 WORDS ALL CAPS",
      "emotion_triggered": "FEAR|GREED|SHOCK|CURIOSITY",
      "why_this_works": "one sentence",
      "text_position": "upper-left|upper-right|bottom-center|center-right",
      "text_color": "white|yellow|red",
      "ctr_score": 9,
      "image_prompt": "1920x1080 YouTube thumbnail... (200+ words, structured: CHARACTER in foreground, ENVIRONMENT blurred behind, OBJECT prominent, NO text in image)"
    }
  ]
}` });

    const conceptRaw = await callGemini(conceptParts, 6000, 0.85);
    const parsed = parseJSON(conceptRaw);

    if (!parsed?.concepts?.length) {
      throw new Error('Gemini did not return valid concepts JSON');
    }

    const detectedMood = (parsed.detected_mood || 'drama').toLowerCase().split('|')[0].trim() || 'drama';
    const concepts = parsed.concepts.slice(0, 5);
    const storyElements = parsed.story_elements || {};
    const thumbnailStrategy = parsed.thumbnail_strategy || 'hero_shot';

    console.log(`Mood: ${detectedMood} | Strategy: ${thumbnailStrategy}`);
    console.log(`Story elements — Characters: ${(storyElements.characters || '').substring(0, 80)}...`);
    console.log(`Story elements — Environment: ${(storyElements.environment || '').substring(0, 80)}...`);
    console.log(`Story elements — Objects: ${(storyElements.objects || '').substring(0, 80)}...`);

    // ── SAVE CONCEPTS ────────────────────────────────────────────
    const sessionId = project_id || `thumb_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const saved = [];
    const failed = [];

    // Build the role_mapping JSON that generateNewThumbnailImage will use
    const roleMapping = {
      photo_roles: photoRoles,
      story_elements: storyElements,
    };

    // Compress char photos for fallback storage
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
        let imagePrompt = c.image_prompt || '';
        if (!imagePrompt.startsWith('1920x1080')) {
          imagePrompt = `1920x1080 YouTube thumbnail, photorealistic, cinematic DSLR quality. ${imagePrompt}`;
        }

        // Bake text overlay instructions into prompt
        if (c.text_overlay) {
          imagePrompt += `\n\nTEXT OVERLAY — RENDER IN IMAGE:\nText: "${c.text_overlay.toUpperCase()}"\nFont: Impact or Bebas Neue, ultra-bold, condensed\nColor: ${c.text_color || 'white'} with 6px black stroke outline and drop shadow\nSize: 15-20% of frame height\nPosition: ${c.text_position || 'upper-left'}\nMust be SHARP, CRISP, and PERFECTLY READABLE.\nDo NOT add any other text.`;
        }

        const record = await base44.entities.ThumbnailConcepts.create({
          project_id:             sessionId,
          rank:                   c.rank ?? (i + 1),
          concept_type:           c.emotion_triggered ?? 'shock',
          psychological_trigger:  c.emotion_triggered ?? 'Shock',
          concept_description:    JSON.stringify(roleMapping),
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

        console.log(`Saved #${c.rank ?? i+1}: "${c.text_overlay}" | ${c.emotion_triggered} | CTR: ${c.ctr_score}`);
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
      story_elements: storyElements,
      photo_roles: photoRoles,
      template_selection: {
        primary_template:   hasUserTemplate ? template_name : detectedMood,
        used_user_template: hasUserTemplate,
        used_char_photos:   hasCharPhotos,
        char_photo_count:   photoCount,
        all_templates:      hasUserTemplate
                              ? [{ name: template_name, ctr: template_ctr }]
                              : [{ name: detectedMood, ctr: '8-12%' }],
      },
      meta: { total_saved: saved.length, total_failed: failed.length },
    });

  } catch (error) {
    console.error('newThumbnailConcept error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});