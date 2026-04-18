// Viral Thumbnail Director
// ──────────────────────────────────────────────────────────────
// Transforms: reference frame (from video) + story + hook text
//   → AI analyzes emotion, archetype, viral mode, layout
//   → Generates a NEW cinematic YouTube thumbnail background
//   → Uses reference image to preserve character identity
//
// Returns: { pending, task_id, task_type, director_analysis }
// Frontend polls via pollThumbnailTask to get final image_url.
// ──────────────────────────────────────────────────────────────

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const AI33_KEY = Deno.env.get('AI33_API_KEY');
const KIE_KEY = Deno.env.get('KIE_API_KEY');
const AI33_BASE = 'https://api.ai33.pro';
const KIE_BASE = 'https://api.kie.ai/api/v1/jobs';

const MODES = ['mrbeast_viral', 'hormozi_business', 'documentary_mystery', 'finance_viral', 'dating_viral'];
const EMOTIONS = ['shock', 'greed', 'fear', 'curiosity', 'transformation', 'status', 'drama', 'mystery', 'urgency', 'desire'];

// ── Gemini director call ───────────────────────────────────────
function extractJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (_) { return null; }
}

async function directorAnalyze({ title, story, hookText, niche, mode }) {
  const prompt = `You are a world-class YouTube Thumbnail Growth Director trained on the highest CTR thumbnails (MrBeast, Hormozi, Ryan Trahan, MagnatesMedia, Ali Abdaal).

Your job: analyze the video context and design a thumbnail scientifically engineered to maximize clicks.

VIDEO:
- Title: ${title || '(none)'}
- Story: ${(story || '').slice(0, 2000)}
- Niche: ${niche || 'general'}
- Overlay Hook Text (will be burned on top — do NOT include it in the image prompt): "${hookText || '(none)'}"
- Forced Mode: ${mode || 'AUTO (you pick best)'}

THINKING PROCESS (do this internally, then output JSON):
1. Pick the SINGLE strongest click emotion: ${EMOTIONS.join(', ')}
2. Pick the viral mode: ${MODES.join(', ')}
3. What 1-3 things MUST be visible in 0.5 sec? (face, money, danger, result, before/after, weird object, luxury, graph spike, tears, hidden truth)
4. What's the curiosity gap? (Why is this happening? What's inside? What happened next?)
5. What element gets EXAGGERATED? (eyes, mouth, money stack, fire, glow, size, numbers)
6. Composition formula:
   - A (MrBeast): big expressive face LEFT, crazy object RIGHT, bright bg, huge emotion
   - B (Hormozi): bold visual LEFT, confident person RIGHT, high contrast, business/status
   - C (Documentary): dark mysterious bg, one object center, cinematic lighting
7. Color psychology (CTR science): yellow=urgency, red=danger, green=money, blue=trust, purple=premium, black=mystery

OUTPUT — return ONLY valid JSON (no markdown):
{
  "mode": "mrbeast_viral",
  "emotion_trigger": "shock",
  "layout_formula": "A",
  "main_focus": "what dominates the frame",
  "curiosity_gap": "why viewer must click",
  "exaggerated_element": "eyes / money / etc",
  "color_palette": "dominant colors with hex",
  "why_clicks": "1-sentence CTR reasoning",
  "image_prompt": "DETAILED cinematic image prompt for AI image gen. Describe composition, character (referencing provided person), objects, lighting, background, color palette, mood. NO TEXT/WORDS/LETTERS in the image — the hook text is burned on top separately. Hyper detailed, ultra realistic, viral YouTube thumbnail style. 1280x720."
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = extractJson(txt);
  if (!parsed?.image_prompt) throw new Error('Director analysis failed — no image_prompt');
  return parsed;
}

// ── AI33 submit with reference image ───────────────────────────
async function submitAI33WithReference(prompt, referenceImageUrl) {
  // Fetch reference as bytes and send as multipart
  let refBlob = null;
  try {
    const r = await fetch(referenceImageUrl);
    if (r.ok) refBlob = await r.blob();
  } catch (_) { /* optional */ }

  const formData = new FormData();
  formData.append('prompt', prompt.substring(0, 4000));
  formData.append('model_id', 'bytedance-seedream-4.5');
  formData.append('generations_count', '1');
  formData.append('model_parameters', JSON.stringify({
    aspect_ratio: '16:9',
    resolution: '2K',
  }));
  if (refBlob) {
    formData.append('reference_images', refBlob, 'reference.jpg');
  }

  const res = await fetch(`${AI33_BASE}/v1i/task/generate-image`, {
    method: 'POST',
    headers: { 'xi-api-key': AI33_KEY },
    body: formData,
  });
  const data = await res.json();
  if (!data.success || !data.task_id) {
    throw new Error(`AI33 submit: ${data.message || JSON.stringify(data)}`);
  }
  return data.task_id;
}

// ── KIE Ideogram fallback (no reference support — prompt-only) ──
async function kieCreate(model, input) {
  const r = await fetch(KIE_BASE + '/createTask', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KIE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
  });
  const d = await r.json();
  if (!r.ok || d.code !== 200) throw new Error('Kie: ' + (d.msg || JSON.stringify(d)));
  return d.data.taskId;
}

// ══════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      project_id,
      reference_image_url,   // the extracted frame (or any uploaded ref)
      title = '',
      story = '',            // transcript snippet
      hook_text = '',
      niche = 'general',
      mode = '',             // optional force
    } = await req.json();

    if (!reference_image_url) {
      return Response.json({ error: 'reference_image_url required' }, { status: 400 });
    }

    // STEP 1: Director analysis
    const analysis = await directorAnalyze({ title, story, hookText: hook_text, niche, mode });
    console.log(`🎬 Director picked mode=${analysis.mode} emotion=${analysis.emotion_trigger}`);

    // STEP 2: Build final image prompt
    const finalPrompt = `${analysis.image_prompt}

Critical: NO text, no words, no letters, no numbers, no typography anywhere in the image. Clean background reserved for text overlay. Ultra high resolution, crisp sharp details, cinematic lighting, professional YouTube thumbnail quality, viral-ready composition.`;

    // STEP 3: Create a ThumbnailConcept record so pollThumbnailTask can update it
    const concept = await base44.asServiceRole.entities.ThumbnailConcepts.create({
      project_id: project_id || 'standalone',
      rank: 99,
      concept_description: `Director: ${analysis.mode} / ${analysis.emotion_trigger}`,
      text_overlay: hook_text,
      image_prompt: finalPrompt,
      color_scheme: analysis.color_palette,
      ctr_score: 10,
    });

    // STEP 4: Submit to AI33 with reference (primary) or KIE (fallback)
    if (AI33_KEY) {
      try {
        const taskId = await submitAI33WithReference(finalPrompt, reference_image_url);
        return Response.json({
          pending: true,
          task_id: taskId,
          task_type: 'ai33',
          concept_id: concept.id,
          director_analysis: analysis,
        });
      } catch (e) {
        console.warn('AI33 failed, trying KIE:', e.message);
      }
    }

    if (KIE_KEY) {
      const taskId = await kieCreate('z-image/text-to-image', {
        prompt: finalPrompt.substring(0, 2000),
        image_size: 'landscape_16_9',
        negative_prompt: 'no text, no words, no letters, no typography, blurry, low quality',
      });
      return Response.json({
        pending: true,
        task_id: taskId,
        task_type: 'kie',
        concept_id: concept.id,
        director_analysis: analysis,
      });
    }

    return Response.json({ error: 'No image API configured' }, { status: 500 });
  } catch (error) {
    console.error('viralThumbnailDirector error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});