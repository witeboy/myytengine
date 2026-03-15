import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// newThumbnailConcept - Standalone thumbnail generation
// Receives character photos + reference template, sends both to Gemini Vision
// so the generated concepts use the REAL uploaded people + selected layout

const TEMPLATE_DNA = {
  shock_face:   { name:"The Shock Face",        ctr:"8-12%", power:5, psychology:"Mirror neurons - viewer FEELS shock before reading text", face_emotion:"EXTREME SHOCK: eyes blown wide, jaw dropped O-shape, both hands on cheeks.", text_formula:"MAX 4 WORDS ALL CAPS. e.g. '$130K STILL BROKE'", color:"DARK bg + ELECTRIC YELLOW text + RED accent" },
  income_reveal:{ name:"The Income Reveal",     ctr:"7-11%", power:5, psychology:"Aspiration + Social Proof", face_emotion:"PROUD CONFIDENCE: chest out, chin raised, calm knowing smile.", text_formula:"SPECIFIC ODD DOLLAR AMOUNT + TIME. e.g. '$47,382 IN 6 MONTHS'", color:"DARK bg + NEON GREEN amount + GOLD accent" },
  warning_alert:{ name:"The Warning",           ctr:"7-10%", power:4, psychology:"Loss aversion", face_emotion:"URGENT WARNING: intense stare, furrowed brows, pointing finger.", text_formula:"STOP [THIS]. MAX 4 WORDS.", color:"DEEP RED + WHITE text + thick black outline" },
  before_after: { name:"The Before/After",      ctr:"6-10%", power:4, psychology:"Transformation desire", face_emotion:"LEFT: defeated/stressed | RIGHT: confident/liberated.", text_formula:"STATE_A to STATE_B. e.g. 'BROKE TO $200K'", color:"LEFT: dark cold blue | RIGHT: warm bright gold" },
  cliffhanger:  { name:"The Cliffhanger",       ctr:"7-11%", power:5, psychology:"Zeigarnik effect - open loop demands closure", face_emotion:"TENSE ANTICIPATION: eyes slightly wide looking off-frame, frozen before everything changes.", text_formula:"INCOMPLETE REVELATION with ellipsis. e.g. 'SHE LEFT EVERYTHING...'", color:"WARM AMBER to DEEP ORANGE + dark vignette" },
  cold_case:    { name:"The Cold Case",         ctr:"8-12%", power:5, psychology:"Justice obsession + morbid curiosity", face_emotion:"HAUNTED: troubled expression, dark circles, looking away.", text_formula:"THE [CRIME] THAT [UNSOLVED OUTCOME]", color:"NEAR BLACK + BLOOD RED accent + YELLOW highlight" },
  heartbreak:   { name:"The Heartbreak",        ctr:"7-10%", power:5, psychology:"Emotional contagion - pain is universally shared", face_emotion:"RAW PAIN: eyes red-rimmed, lip trembling, shoulders collapsed.", text_formula:"UNRESOLVED PAINFUL MOMENT. e.g. 'HE LEFT WITHOUT A WORD'", color:"DESATURATED dark blues + single warm light on face" },
  ai_takeover:  { name:"The AI Takeover",       ctr:"7-11%", power:5, psychology:"Existential fear + curiosity", face_emotion:"ALARMED URGENCY: wide eyes, raised stop hand, forward lean.", text_formula:"AI THREAT + PERSONAL IMPACT. e.g. 'AI REPLACED 10,000 JOBS'", color:"ELECTRIC NEON BLUE on NEAR BLACK + PURPLE circuit" },
  plot_twist:   { name:"The Plot Twist",        ctr:"8-12%", power:5, psychology:"Spoiler magnetism", face_emotion:"MIND-BLOWN: both hands on head, eyes MAX width, mouth O-shape.", text_formula:"UNREVEALED MYSTERY. e.g. 'THE TWIST YOU MISSED'", color:"CINEMATIC TEAL AND ORANGE + GOLD text" },
  versus:       { name:"The Versus",            ctr:"6-9%",  power:4, psychology:"Binary thinking - wired to pick a side", face_emotion:"DECISIVE AUTHORITY: arms crossed, confident half-smile.", text_formula:"[OPTION A] VS [OPTION B]. MAX 5 WORDS.", color:"SPLIT: LEFT deep blue + RIGHT warm amber. VS center WHITE." },
};

function selectTemplates(title, summary) {
  const text = (title + ' ' + summary).toLowerCase();
  const nicheMap = {
    finance: ['money','income','budget','debt','invest','broke','wealth','savings','rich','passive'],
    crime:   ['murder','crime','killer','suspect','case','disappeared','unsolved','missing'],
    drama:   ['story','happened','betrayed','cheated','secret','discovered'],
    love:    ['love','relationship','broke up','cheated','marriage','heartbreak','toxic','dating','ex'],
    ai:      ['ai','chatgpt','automation','replaced','artificial intelligence','robot','tool'],
    movies:  ['movie','film','show','series','ending','twist','explained','theory','review'],
  };
  const scores = {};
  for (const [n, kws] of Object.entries(nicheMap)) {
    scores[n] = kws.filter(k => text.includes(k)).length;
  }
  const top = Object.entries(scores).sort((a,b) => b[1]-a[1])[0]?.[0] || 'drama';
  const nicheMap2 = {
    finance: ['shock_face','income_reveal','before_after','warning_alert','versus'],
    crime:   ['cold_case','cliffhanger','plot_twist','heartbreak','warning_alert'],
    drama:   ['cliffhanger','heartbreak','before_after','shock_face','plot_twist'],
    love:    ['heartbreak','cliffhanger','before_after','shock_face','warning_alert'],
    ai:      ['ai_takeover','shock_face','warning_alert','plot_twist','before_after'],
    movies:  ['plot_twist','cliffhanger','shock_face','heartbreak','before_after'],
  };
  const ordered = nicheMap2[top] || Object.keys(TEMPLATE_DNA);
  return ordered.slice(0,3).map(id => ({ id, ...TEMPLATE_DNA[id] }));
}

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

    const autoTemplates = selectTemplates(video_title, summary);
    const primary = autoTemplates[0];

    console.log('=== newThumbnailConcept ===');
    console.log('Title:', video_title);
    console.log('Char photos:', char_photos.length, '| Has valid b64:', hasCharPhotos);
    console.log('User template:', template_name || 'none');

    // Build Gemini Vision content parts
    const contentParts = [];

    // Part 1: Reference template image
    if (hasUserTemplate) {
      contentParts.push({
        inline_data: { mime_type: template_mime || 'image/jpeg', data: template_b64 }
      });
      contentParts.push({
        text: `REFERENCE TEMPLATE (image above): "${template_name}"
CTR Target: ${template_ctr || 'high'}
Psychology: ${template_psychology || ''}
Text Strategy: ${template_text_strategy || ''}

Study this reference image carefully:
- Character positions and scale within the frame
- Background style, colors, and treatment
- Text placement zone and size
- Lighting style, rim light colors
- Overall color palette and mood
- Any graphic elements (arrows, badges, dividers)

Concepts 1, 2, and 3 in your output MUST recreate this EXACT composition. Use the same layout but with the uploaded character photos and video title text.`
      });
    }

    // Part 2: Character photos
    if (hasCharPhotos) {
      for (let i = 0; i < char_photos.length; i++) {
        const p = char_photos[i];
        if (p?.b64 && p?.mime) {
          contentParts.push({
            inline_data: { mime_type: p.mime, data: p.b64 }
          });
          contentParts.push({
            text: `CHARACTER ${i + 1} (photo above): This is the REAL person who appears in this video. ALL 10 thumbnail concepts MUST feature this exact person with their precise facial features, skin tone, hair color and style. Match their appearance exactly. Do NOT substitute or invent a different person.`
          });
        }
      }
    }

    // Part 3: Main generation prompt
    const charRule = hasCharPhotos
      ? `The ${char_photos.filter(p=>p?.b64).length} character photo(s) above show the real people in this video. Every concept MUST feature these exact people - same face, skin tone, hair, and features. Never substitute different people.`
      : `No character photos provided. Create appropriate characters matching the content tone and niche.`;

    const templateRule = hasUserTemplate
      ? `Reference template "${template_name}" shown above. Concepts 1-3 must recreate that exact layout with user's characters and title.`
      : `Auto-selected templates:\n${autoTemplates.map((t,i) => `${i+1}. ${t.name}: ${t.face_emotion} | ${t.text_formula} | Colors: ${t.color}`).join('\n')}`;

    // ── Hooksmith: extract title words for Zero-Overlap enforcement ──
    const titleWords = video_title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);

    // ── Hooksmith: detect title sentiment polarity ──────────────
    const positiveSignals = ['best','easy','how to','guide','tips','success','win','grow','profit','gain','make','start','build','secret','hack','trick','free','simple'];
    const negativeSignals = ['quit','lost','failed','broke','mistake','wrong','stop','avoid','danger','warning','never','worst','scam','lie','truth','exposed'];
    const vagueSignals    = ['my','i','routine','day','life','story','week','month','year','journey','experience'];

    const titleLower = video_title.toLowerCase();
    let titleSentiment = 'neutral';
    if (positiveSignals.some(w => titleLower.includes(w))) titleSentiment = 'positive';
    else if (negativeSignals.some(w => titleLower.includes(w))) titleSentiment = 'negative';
    else if (vagueSignals.some(w => titleLower.includes(w))) titleSentiment = 'vague';

    // ── Hooksmith: determine Sentiment Pivot instruction ─────────
    const sentimentPivot =
      titleSentiment === 'positive'
        ? 'Title is POSITIVE — thumbnail text must create TENSION by being a warning or negative counter-signal. e.g. if title says "Best way to X", hook says "STOP DOING X" or "BIGGEST MISTAKE".'
      : titleSentiment === 'negative'
        ? 'Title is NEGATIVE — thumbnail text must AMPLIFY the stakes. Make it feel even more urgent, shocking, or consequential.'
      : titleSentiment === 'vague'
        ? 'Title is VAGUE — thumbnail text must add SPECIFIC DATA or a concrete anchor to make it feel real. e.g. a number, time, amount, or name.'
        : 'Title is NEUTRAL — thumbnail text should trigger one of: Fear, Greed, Shock, or Curiosity.';

    contentParts.push({ text: `You are the world's #1 YouTube thumbnail strategist. Generate exactly 10 thumbnail concepts for this video.

VIDEO TITLE: "${video_title}"
${summary ? `SUMMARY: "${summary}"` : ''}

CHARACTER RULE: ${charRule}

TEMPLATE/LAYOUT RULE: ${templateRule}

════════════════════════════════════
THE HOOKSMITH — 3 LAWS OF VIRAL TEXT
════════════════════════════════════

LAW 1 — ZERO OVERLAP RULE (NON-NEGOTIABLE):
The thumbnail text overlay MUST NOT repeat or paraphrase the video title.
It is a COMPANION phrase, not a summary.
BANNED words (taken directly from this title): ${titleWords.join(', ')}
If any output text_overlay contains these words, it FAILS. Regenerate until none appear.
Good examples:
  Title: "I Quit My High Paying Job"  → Hook: "BIG MISTAKE?"
  Title: "Review of the New iPhone 17" → Hook: "DON'T BUY IT"
  Title: "How to Run a Marathon"       → Hook: "WEEK 4 IS HELL"

LAW 2 — MOBILE-FIRST DENSITY (NON-NEGOTIABLE):
Thumbnails render at ~168x94px on mobile. More than 4 words = unreadable gray blur.
HARD LIMIT: text_overlay must be MAX 4 WORDS. ALL CAPS only.
Font must be Bebas Neue or Impact — high x-height, readable at tiny size.
Preferred: 2-3 words for maximum impact. Never a full sentence.

LAW 3 — SENTIMENT PIVOT (NON-NEGOTIABLE):
${sentimentPivot}
The hook must trigger a HIGH-AROUSAL emotion: Fear, Greed, Shock, or Curiosity.
BANNED generic phrases: "YOU WON'T BELIEVE", "SHOCKING", "MUST WATCH", "INCREDIBLE", "AMAZING"

════════════════════════════════════
TEXT POSITION RULE:
- Upper-left or bottom-center ONLY
- NEVER bottom-right (YouTube timestamp covers it)
- Thick 6px black outline + heavy drop shadow
════════════════════════════════════

IMAGE PROMPT RULES:
- Start every image_prompt with: "1920x1080 Full HD 16:9 YouTube thumbnail, photorealistic DSLR photograph, professional studio lighting"
- 300+ words per prompt
- Describe exact character pose, expression, clothing, position in frame
- Describe lighting: key light direction, rim light colors (cyan/magenta/gold), intensity
- Describe background: blurred, colors, elements, depth
- If character photos provided: write "person matching the reference photo exactly - same face, skin tone, hair"
- If template selected: write "layout matching the ${template_name || 'reference'} composition - same character positions"
- CRITICAL: NO text/letters/numbers in the image - leave clean empty space where text overlay will appear

Return ONLY a valid JSON array of exactly 10 objects. No markdown, no explanation:
[{
  "rank": 1,
  "concept_type": "string",
  "concept_description": "string",
  "psychological_trigger": "Fear|Greed|Shock|Curiosity",
  "text_overlay": "MAX 4 WORDS — must not contain title words",
  "hook_law_check": "explain why this hook obeys all 3 laws",
  "focal_point": "string",
  "visual_metaphor": "string",
  "color_scheme": "Primary | Accent | Background",
  "text_style": "white | thick 6px black outline | upper-left | Bebas Neue",
  "style_reference": "cinematic",
  "ctr_score": 9,
  "why_it_stops_scrolling": "string",
  "faceless_adaptation": "string",
  "image_prompt": "300+ word detailed prompt starting with 1920x1080...",
  "negative_prompt": "text, letters, numbers, watermark, blurry, low quality, distorted faces"
}]` });

    // gemini-2.0-flash supports both text and vision (images)
    const geminiModel = 'gemini-2.0-flash';
    console.log('Gemini model:', geminiModel, '| content parts:', contentParts.length);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: contentParts }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 8192 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      throw new Error(`Gemini ${geminiRes.status}: ${err.substring(0, 300)}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    let concepts = [];
    try { concepts = JSON.parse(rawText); } catch (_) {}
    if (!Array.isArray(concepts) || !concepts.length) {
      const m = rawText.match(/\[[\s\S]*\]/);
      if (m) { try { concepts = JSON.parse(m[0]); } catch (_) {} }
    }
    if (!Array.isArray(concepts) || !concepts.length) {
      throw new Error('Failed to parse Gemini response as JSON array');
    }

    console.log('Gemini returned', concepts.length, 'concepts');

    const sessionId = `thumb_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const saved = [];
    const failed = [];

    for (const [i, c] of concepts.slice(0, 10).entries()) {
      try {
        let imagePrompt = c.image_prompt || '';

        if (!imagePrompt.includes('1920x1080')) {
          imagePrompt = `1920x1080 Full HD 16:9 YouTube thumbnail, photorealistic DSLR photograph, professional studio lighting. ${imagePrompt}`;
        }
        if (hasCharPhotos) {
          imagePrompt += ` The character(s) must exactly match the reference photo(s) - same face, skin tone, hair color and style, facial bone structure. Do not invent or substitute different people.`;
        }
        if (hasUserTemplate) {
          imagePrompt += ` Recreate the exact spatial composition of the "${template_name}" reference layout - same character positions, same background zones, same color energy and lighting style.`;
        }

        // ── BAKE OVERLAY TEXT INTO PROMPT ─────────────────────────
        // Extract text style/position from concept or template
        const overlayText    = c.text_overlay || '';
        const rawTextStyle   = c.text_style || '';
        const textPosition   = rawTextStyle.toLowerCase().includes('upper-left')  ? 'upper-left'
                             : rawTextStyle.toLowerCase().includes('bottom-center') ? 'bottom-center'
                             : rawTextStyle.toLowerCase().includes('center')      ? 'center'
                             : hasUserTemplate ? 'as shown in the template reference image'
                             : 'upper-left';

        // Parse font from text_style field
        const fontMatch = rawTextStyle.match(/bebas neue|impact|montserrat|roboto|arial black/i);
        const font      = fontMatch ? fontMatch[0].toUpperCase() : 'BEBAS NEUE';

        // Parse color from text_style field
        const colorMatch = rawTextStyle.match(/white|yellow|red|gold|black|orange/i);
        const textColor  = colorMatch ? colorMatch[0].toLowerCase() : 'white';

        // Parse text strategy from template if available
        const textStrategyHint = template_text_strategy
          ? `Follow this text strategy: ${template_text_strategy}`
          : '';

        if (overlayText) {
          imagePrompt += `

TEXT OVERLAY — RENDER THIS TEXT IN THE IMAGE:
Text: "${overlayText.toUpperCase()}"
Font: ${font} (bold, heavy weight, high x-height)
Color: ${textColor} with thick 6px black outline/stroke and heavy drop shadow (black, 4px offset)
Size: Very large — text should be readable even at 168x94px mobile thumbnail size (approx 15-20% of frame height per line)
Position: ${textPosition}
${textPosition === 'upper-left' ? 'Align text to upper-left corner, 40px padding from edges, stacked vertically if multiple words' : ''}
${textPosition === 'bottom-center' ? 'Full-width black bar at bottom 20% of frame, text centered in white on black bar' : ''}
${textPosition === 'center' ? 'Text centered horizontally and vertically in the clean zone' : ''}
${hasUserTemplate ? `Match the EXACT text position, size, and style shown in the "${template_name}" template reference image above` : ''}
${textStrategyHint}
Letter spacing: tight/condensed
Line breaks: split into max 2 lines if more than 2 words
Text must be crisp, sharp, fully legible — this is the most important element of the thumbnail`;
        }

        // Serialize char photos for storage (keep b64 + mime, drop heavy duplicates)
        const charPhotosForStorage = hasCharPhotos
          ? char_photos
              .filter(p => p?.b64)
              .map(p => ({ b64: p.b64, mime: p.mime || 'image/jpeg' }))
          : [];

        const record = await base44.entities.ThumbnailConcepts.create({
          project_id:             sessionId,
          rank:                   c.rank ?? (i + 1),
          concept_type:           c.concept_type ?? 'revelation',
          psychological_trigger:  c.psychological_trigger ?? '',
          concept_description:    c.concept_description ?? '',
          focal_point:            c.focal_point ?? '',
          visual_metaphor:        c.visual_metaphor ?? '',
          color_scheme:           c.color_scheme ?? '',
          text_overlay:           c.text_overlay ?? '',
          text_style:             c.text_style ?? 'white | thick 6px black outline | upper-left | Impact',
          style_reference:        c.style_reference ?? 'cinematic',
          ctr_score:              c.ctr_score ?? 7,
          why_it_stops_scrolling: c.why_it_stops_scrolling ?? '',
          faceless_adaptation:    c.faceless_adaptation ?? '',
          image_prompt:           imagePrompt,
          negative_prompt:        c.negative_prompt ?? 'text, letters, numbers, watermark, blurry, distorted faces, generic stock people',
          mood:                   c.mood ?? '',
          quality_valid:          true,
          is_selected:            false,
          image_url:              null,
          title:                  video_title,
          status:                 'pending',
          // Store char photos so render function can pass them to image generation
          char_photos_json:       charPhotosForStorage.length > 0
                                    ? JSON.stringify(charPhotosForStorage)
                                    : null,
          // Store template reference so render function can pass it as layout reference
          template_ref_json:      hasUserTemplate
                                    ? JSON.stringify({ b64: template_b64, mime: template_mime || 'image/jpeg', name: template_name })
                                    : null,
          // Store template reference so render function can pass it as layout reference
          template_ref_json:      hasUserTemplate
                                    ? JSON.stringify({ b64: template_b64, mime: template_mime || 'image/jpeg', name: template_name })
                                    : null,
        });

        console.log(`Saved #${c.rank ?? i+1}: "${c.text_overlay}" CTR:${c.ctr_score}`);
        saved.push(record.id);
      } catch (saveErr) {
        console.error(`Failed #${i+1}:`, saveErr.message);
        failed.push({ rank: i + 1, error: saveErr.message });
      }
    }

    if (!saved.length) {
      return Response.json({ error: `All concepts failed to save. First error: ${failed[0]?.error}` }, { status: 500 });
    }

    console.log(`Done: ${saved.length} saved, ${failed.length} failed`);

    return Response.json({
      success: true,
      concept_ids: saved,
      project_id: sessionId,
      concepts_saved: saved.length,
      template_selection: {
        primary_template:   hasUserTemplate ? template_name : primary.name,
        used_user_template: hasUserTemplate,
        used_char_photos:   hasCharPhotos,
        char_photo_count:   char_photos.length,
        all_templates: hasUserTemplate
          ? [{ name: template_name, ctr: template_ctr }]
          : autoTemplates.map(t => ({ name: t.name, ctr: t.ctr })),
      },
      meta: { total_saved: saved.length, total_failed: failed.length, gemini_model: geminiModel },
    });

  } catch (error) {
    console.error('newThumbnailConcept error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});