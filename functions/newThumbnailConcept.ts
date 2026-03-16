import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// newThumbnailConcept — Lean & intelligent
// Takes: video_title + summary + char_photos
// Does:  Detects mood → generates 5 high-CTR overlay texts via Gemini
// Returns: 5 concept records ready for image generation

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

    contentParts.push({ text: `You are the world's #1 YouTube thumbnail psychologist and CTR strategist.

VIDEO TITLE: "${video_title}"
${summary ? `SUMMARY: "${summary}"` : ''}

YOUR JOB:
Analyse the title and summary. Then generate exactly 5 thumbnail concepts, each with a devastatingly effective overlay text that will trigger millions of clicks.

════════════════════════════
STEP 1 — DETECT THE MOOD
════════════════════════════
From the title/summary, identify the single best niche:
crime | drama | nollywood | comedy | finance | inspirational | educational

════════════════════════════
STEP 2 — OVERLAY TEXT LAWS (ALL 5 MUST OBEY THESE)
════════════════════════════

LAW 1 — ZERO OVERLAP (HARD RULE):
The overlay text MUST NOT repeat any word from the title.
Title words are banned: ${video_title.toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(w=>w.length>2).join(', ')}
Purpose: the text COMPANION the title — it adds tension, not repetition.

LAW 2 — MAX 3 WORDS, ALL CAPS:
Thumbnails are seen at 168x94px on mobile. 4+ words = unreadable blur.
Perfect: 2-3 punchy words. Never a full sentence.
Font: Impact or Bebas Neue only.

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
Each concept needs a detailed image_prompt (200+ words) that:
- Starts with: "1920x1080 YouTube thumbnail, photorealistic, cinematic DSLR quality"
- Describes the scene, character emotion/pose, lighting (rim lights, key light)
- Describes background colors, mood, depth of field
- ${hasCharPhotos ? 'Describes the character(s) from the uploaded photos exactly — same face, skin tone, hair, features. Say "person matching reference photo exactly"' : 'Creates characters that match the video tone'}
- ${hasUserTemplate ? `Recreates the layout from the uploaded template: "${template_name}" — same composition, positions, zones` : 'Uses a cinematic split or hero layout'}
- Ends with: "NO text, letters, numbers, or watermarks anywhere in the image"

════════════════════════════
OUTPUT FORMAT — JSON ONLY
════════════════════════════
Return ONLY a valid JSON object. No markdown. No explanation. No backticks.

{
  "detected_mood": "ONE of: crime, drama, nollywood, comedy, finance, inspirational, educational",
  "mood_reasoning": "one sentence why",
  "concepts": [
    {
      "rank": 1,
      "text_overlay": "MAX 3 WORDS ALL CAPS — no title words",
      "emotion_triggered": "FEAR|GREED|SHOCK|CURIOSITY",
      "why_this_works": "one sentence psychological explanation",
      "text_position": "upper-left|bottom-center",
      "text_color": "white|yellow|red",
      "ctr_score": 9,
      "image_prompt": "1920x1080 YouTube thumbnail, photorealistic... (200+ words, NO text in image)"
    }
  ]
}` });

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

    const detectedMood = parsed.detected_mood || 'drama';
    const concepts = parsed.concepts.slice(0, 5);
    console.log(`Mood: ${detectedMood} | Concepts: ${concepts.length}`);

    // ── SAVE CONCEPT RECORDS ─────────────────────────────────────
    const sessionId = `thumb_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
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
          concept_description:    c.why_this_works ?? '',
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