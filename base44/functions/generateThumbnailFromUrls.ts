import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// generateThumbnailFromUrls — Self-contained pipeline
// Downloads photos from URLs → Gemini generates overlay text → nano-banana-2 renders thumbnail
// All inline, no function-to-function calls

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { video_title, summary = '', photo_urls = [] } = body;

    if (!video_title?.trim()) return Response.json({ error: 'video_title required' }, { status: 400 });
    if (photo_urls.length < 2) return Response.json({ error: 'Need at least 2 photo_urls' }, { status: 400 });

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!GEMINI_API_KEY || !KIE_API_KEY) return Response.json({ error: 'Missing API keys' }, { status: 500 });

    console.log('=== generateThumbnailFromUrls (inline) ===');

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Download photos → base64
    // ═══════════════════════════════════════════════════════════════
    const charPhotos = [];
    for (const [i, url] of photo_urls.entries()) {
      try {
        const res = await fetch(url);
        if (!res.ok) { console.warn(`Photo ${i+1}: HTTP ${res.status}`); continue; }
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let b64 = '';
        const CHUNK = 32768;
        for (let j = 0; j < bytes.length; j += CHUNK) {
          b64 += String.fromCharCode(...bytes.subarray(j, Math.min(j + CHUNK, bytes.length)));
        }
        b64 = btoa(b64);
        charPhotos.push({ b64, mime: res.headers.get('content-type') || 'image/png', name: `photo_${i+1}` });
        console.log(`✅ Photo ${i+1}: ${(bytes.length/1024).toFixed(0)}KB`);
      } catch (e) { console.warn(`Photo ${i+1} error: ${e.message}`); }
    }
    if (charPhotos.length < 2) return Response.json({ error: `Only ${charPhotos.length} photos downloaded` }, { status: 400 });

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Gemini generates 5 overlay text concepts
    // ═══════════════════════════════════════════════════════════════
    const bannedWords = video_title.toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(w=>w.length>2).join(', ');

    const contentParts = [];
    for (const [i, p] of charPhotos.entries()) {
      contentParts.push({ inline_data: { mime_type: p.mime, data: p.b64 } });
      contentParts.push({ text: `CHARACTER ${i+1} — study this person's face, skin tone, hair, features.` });
    }

    contentParts.push({ text: `You are the world's #1 YouTube thumbnail psychologist.

VIDEO TITLE: "${video_title}"
SUMMARY: "${summary}"

Generate exactly 5 thumbnail overlay text concepts.

RULES:
- ZERO OVERLAP: text must NOT contain any of these banned words: ${bannedWords}
- MAX 3 WORDS, ALL CAPS
- Trigger one of: FEAR, GREED, SHOCK, CURIOSITY
- No generic words like "SHOCKING", "AMAZING", "INCREDIBLE"
- If title is negative → amplify stakes. If positive → create tension.

Each concept needs a detailed image_prompt (200+ words):
- Start: "1920x1080 YouTube thumbnail, photorealistic, cinematic DSLR quality"
- Describe: Nollywood Split Reaction layout — hard 50/50 vertical split, vivid yellow left (#FFD700), deep navy right (#1a2a6c)
- LEFT: Character 1 (the woman from photo 1) with shocked open-mouth O-shape, warm yellow rim light
- RIGHT: Character 2 (the man from photo 2) with stern confrontational stare, cool blue rim light
- Center: bold red arrow pointing right + white question mark
- Bottom 20%: solid black bar left empty for text overlay
- End: "NO text, letters, numbers anywhere in the image"
- Describe each person's EXACT appearance from photos

Return ONLY valid JSON:
{
  "detected_mood": "drama",
  "concepts": [
    {
      "rank": 1,
      "text_overlay": "MAX 3 WORDS",
      "emotion_triggered": "FEAR|SHOCK|CURIOSITY|GREED",
      "why_this_works": "one sentence",
      "text_color": "white|yellow|red",
      "text_position": "bottom-center",
      "ctr_score": 9,
      "image_prompt": "1920x1080 YouTube thumbnail..."
    }
  ]
}` });

    console.log('Calling Gemini...');
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: contentParts }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 6000 },
        }),
      }
    );

    if (!geminiRes.ok) throw new Error(`Gemini ${geminiRes.status}: ${(await geminiRes.text()).substring(0,300)}`);
    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let parsed = {};
    try { parsed = JSON.parse(rawText); } catch (_) {}
    if (!parsed?.concepts?.length) {
      const m = rawText.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch (_) {}
    }
    if (!parsed?.concepts?.length) throw new Error('Gemini returned no concepts');

    const topConcept = parsed.concepts.sort((a,b) => (b.ctr_score||0) - (a.ctr_score||0))[0];
    console.log(`Top concept: "${topConcept.text_overlay}" CTR:${topConcept.ctr_score}`);

    // Save the concept
    let imagePrompt = topConcept.image_prompt || '';
    if (topConcept.text_overlay) {
      imagePrompt += `\n\nTEXT OVERLAY — RENDER IN IMAGE:\nText: "${topConcept.text_overlay.toUpperCase()}"\nFont: Impact, ultra-bold\nColor: ${topConcept.text_color || 'white'} with 6px black stroke outline and drop shadow\nSize: 15-20% of frame height\nPosition: ${topConcept.text_position || 'bottom-center'}\nMust be SHARP and READABLE.`;
    }

    const record = await base44.entities.ThumbnailConcepts.create({
      project_id: `thumb_url_${Date.now()}`,
      rank: topConcept.rank || 1,
      concept_description: topConcept.why_this_works || '',
      visual_metaphor: parsed.detected_mood || 'drama',
      text_overlay: topConcept.text_overlay || '',
      text_style: `${topConcept.text_color || 'white'} | Impact | ${topConcept.text_position || 'bottom-center'}`,
      ctr_score: topConcept.ctr_score || 8,
      image_prompt: imagePrompt,
      mood: parsed.detected_mood || 'drama',
      image_url: null,
      is_selected: false,
      status: 'pending',
    });
    console.log('Saved concept:', record.id);

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Upload photos to KIE
    // ═══════════════════════════════════════════════════════════════
    async function uploadToKIE(b64Data, mime, label) {
      const rawB64 = b64Data.includes(',') ? b64Data.split(',')[1] : b64Data;
      const clean = rawB64.replace(/[\s\r\n]/g, '');
      const bin = atob(clean);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const isPng = bytes[0]===0x89 && bytes[1]===0x50;
      const ext = isPng ? 'png' : 'jpg';
      const blob = new Blob([bytes], { type: isPng ? 'image/png' : 'image/jpeg' });
      const fd = new FormData();
      fd.append('file', blob, `${label}_${Date.now()}.${ext}`);
      fd.append('uploadPath', 'thumbnails');
      const res = await fetch('https://kieai.redpandaai.co/api/file-stream-upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
        body: fd,
      });
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch (_) {}
      return data?.data?.fileUrl || data?.data?.downloadUrl || data?.data?.url || null;
    }

    const imageUrls = [];
    for (const [i, p] of charPhotos.entries()) {
      const url = await uploadToKIE(p.b64, p.mime, `char_${i+1}`);
      if (url) { imageUrls.push(url); console.log(`✅ Uploaded char_${i+1} → KIE`); }
      else console.warn(`❌ Failed to upload char_${i+1}`);
    }
    console.log(`Uploaded ${imageUrls.length} photos to KIE`);

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Build face-preservation prompt + submit to nano-banana-2
    // ═══════════════════════════════════════════════════════════════
    const photoLabels = charPhotos.map((_, i) => `Image ${i+1}`);
    const facePrompt = `You are a professional YouTube thumbnail compositor. You have ${charPhotos.length} CHARACTER REFERENCE PHOTOS (${photoLabels.join(', ')}).

Generate the following YouTube thumbnail scene. The people MUST be the exact people from the reference photos:

${imagePrompt}

FACE PRESERVATION RULES (CRITICAL):
1. BONE STRUCTURE: Exact skull shape, jawline, chin, forehead from references
2. SKIN: Exact skin tone, texture, complexion — no lightening or darkening
3. NOSE: Same bridge width, nostril shape, tip shape
4. EYES: Same eye shape, color, eyelid crease, eyebrow thickness
5. LIPS: Same thickness, shape, color
6. HAIR: Exact color, texture, length, style — woman has brown wavy hair, man has grey/white hair with goatee
7. BODY: Match build and proportions
8. AGE: Same apparent age — do not age up or down

The people must be IMMEDIATELY recognizable as the same people from the reference photos.

Output: YouTube thumbnail 16:9, 1920×1080, photorealistic, cinematic quality.`;

    console.log(`Prompt: ${facePrompt.length} chars | Submitting to nano-banana-2...`);

    const createRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KIE_API_KEY}` },
      body: JSON.stringify({
        model: 'nano-banana-2',
        input: {
          prompt: facePrompt,
          image_input: imageUrls.length > 0 ? imageUrls : [],
          aspect_ratio: '16:9',
          resolution: '2K',
          output_format: 'png',
        },
      }),
    });

    const createText = await createRes.text();
    console.log(`nano-banana-2 → ${createRes.status}: ${createText.substring(0, 300)}`);
    let createData; try { createData = JSON.parse(createText); } catch (_) {}
    const taskId = createData?.data?.taskId;
    if (!taskId) throw new Error(`Task creation failed: ${createText.substring(0, 200)}`);
    console.log(`✅ Task: ${taskId}`);

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Poll for result
    // ═══════════════════════════════════════════════════════════════
    let finalUrl = null;
    for (let attempt = 1; attempt <= 40; attempt++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const pollRes = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
          headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
        });
        const pollText = await pollRes.text();
        let pollData; try { pollData = JSON.parse(pollText); } catch (_) {}
        const state = pollData?.data?.state || '';
        console.log(`Poll ${attempt}/40: ${state}`);

        if (state === 'success') {
          const rj = pollData?.data?.resultJson;
          if (rj) {
            try {
              const p = typeof rj === 'string' ? JSON.parse(rj) : rj;
              finalUrl = p?.resultUrls?.[0] || p?.urls?.[0] || p?.images?.[0] || p?.url;
            } catch (_) {
              if (typeof rj === 'string' && rj.startsWith('http')) finalUrl = rj;
            }
          }
          if (!finalUrl) finalUrl = pollData?.data?.imageUrl || pollData?.data?.image_url || pollData?.data?.url;
          break;
        }
        if (state === 'fail') throw new Error(pollData?.data?.failMsg || 'Generation failed');
      } catch (e) {
        if (e.message === 'Generation failed' || e.message.includes('fail')) throw e;
        console.warn(`Poll error: ${e.message}`);
      }
    }

    if (!finalUrl) throw new Error('Timed out waiting for image generation');
    console.log('✅ Generated:', finalUrl);

    // Save to concept record
    await base44.entities.ThumbnailConcepts.update(record.id, { image_url: finalUrl, status: 'complete', is_selected: true });

    return Response.json({
      success: true,
      image_url: finalUrl,
      concept: {
        id: record.id,
        text_overlay: topConcept.text_overlay,
        ctr_score: topConcept.ctr_score,
        emotion: topConcept.emotion_triggered,
      },
      all_concepts: parsed.concepts.map(c => ({ rank: c.rank, text: c.text_overlay, ctr: c.ctr_score })),
      detected_mood: parsed.detected_mood,
    });

  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});