// Reads a script the way a director reads it: for its dramatic architecture.
//
// The breakdown used to cut a new scene every seven words, which is a word counter, not a
// director — the same rhythm whether the moment was a quiet realisation or a panic. This
// pass finds where the story actually turns: a change of emotional tone, a new argument,
// a piece of evidence landing, a metaphor that has to evolve. The number of scenes falls
// out of the story instead of being decided in advance.
//
// The model never returns script text, only the SENTENCE NUMBER each beat begins at plus
// the beat's name, pacing and visual intent. The sentences are sliced here, so no line
// can be dropped, duplicated or quietly rewritten.
//
// Resumable: one window of the script per call, because the gateway in front of this
// Worker ends a long request.

import { HttpError, badRequest } from '../lib/http';
import { geminiFetch } from '../lib/ai';
import { splitIntoSentences, stripTtsMarkers } from '../lib/scriptText';
import { normalizeBeats } from '../lib/beatPlan';
import type { FnHandler } from '../types';

const SENTENCES_PER_CALL = 60;
/** Sentences of the previous window replayed for context, so a beat can span the seam. */
const CONTEXT_SENTENCES = 4;

async function callGemini(ctx, prompt, temperature = 0.4) {
  const response = await geminiFetch(ctx, '/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: 8192, responseMimeType: 'application/json' },
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini error: ${err?.error?.message || response.status}`);
  }
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  try { return JSON.parse(raw); } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not read the beat plan as JSON');
  }
}

/** One locked look for the whole video, so every scene belongs to the same film. */
async function styleBible(ctx, project, script) {
  const prompt = `You are an elite cinematographer. Define a rigid VISUAL STYLE BIBLE for one video, so that every frame generated later belongs unmistakably to the same film.

VIDEO TOPIC: ${project.name || 'untitled'}
NICHE: ${project.niche || 'general'}
REQUESTED STYLE: ${project.visual_style || 'director\'s choice'}
SCRIPT OPENING: "${script.slice(0, 700)}"

Return JSON exactly:
{
  "cinematic_style": "The exact medium, texture and artistic era — e.g. gritty 35mm film stock, IMAX analog photography, minimalist 3D claymation render, editorial neo-noir photography. Be specific and physical.",
  "color_palette_and_lighting": "Three dominant colours plus the lighting treatment — e.g. desaturated steel blue, charcoal and warm amber; high-contrast chiaroscuro with heavy volumetric shadow.",
  "camera_and_lens_profile": "The lens behaviour that forces consistency — e.g. anamorphic lenses, shallow depth of field, soft background bokeh, organic film grain."
}

Concrete physical description only. No vague praise words like "stunning", "beautiful" or "photorealistic".`;

  try {
    const result = await callGemini(ctx, prompt, 0.6);
    const bible = {
      cinematic_style: String(result?.cinematic_style || '').trim(),
      color_palette_and_lighting: String(result?.color_palette_and_lighting || '').trim(),
      camera_and_lens_profile: String(result?.camera_and_lens_profile || '').trim(),
    };
    return bible.cinematic_style ? bible : null;
  } catch (err: any) {
    console.warn(`Style bible failed (continuing without it): ${err?.message || err}`);
    return null;
  }
}

const handler: FnHandler = async (body, ctx) => {
  try {
    const { project_id, start_sentence = 0, restart = false } = body || {};
    if (!project_id) throw badRequest('project_id is required');

    const projects = await ctx.db.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) throw new HttpError(404, 'Project not found');

    const scripts = await ctx.db.Scripts.filter({ project_id });
    const script = scripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) throw new HttpError(400, 'No final script found.');

    const fullScript = stripTtsMarkers(script.full_script);
    const sentences = splitIntoSentences(fullScript);
    if (!sentences.length) throw new HttpError(400, 'The script has no sentences to plan.');

    // Beats already planned for THIS script are kept; a rewritten script starts over.
    const fingerprint = `${sentences.length}:${fullScript.length}`;
    let saved: any = {};
    try { saved = JSON.parse(project.scene_beats || '{}'); } catch (_) { saved = {}; }
    const reuse = !restart && saved?.fingerprint === fingerprint && Array.isArray(saved.beats);
    const beats = reuse ? saved.beats : [];
    const from = reuse ? Math.max(Number(start_sentence) || 0, Number(saved.next_sentence) || 0) : 0;

    let bible = null;
    try { bible = JSON.parse(project.visual_style_bible || 'null'); } catch (_) { bible = null; }
    if (from === 0 && (!bible || restart)) {
      bible = await styleBible(ctx, project, fullScript);
      if (bible) await ctx.db.Projects.update(project_id, { visual_style_bible: JSON.stringify(bible) });
    }

    if (from >= sentences.length) {
      return { success: true, done: true, beats: beats.length, total_sentences: sentences.length, style_bible: bible };
    }

    const windowStart = Math.max(0, from - (from > 0 ? CONTEXT_SENTENCES : 0));
    const windowEnd = Math.min(sentences.length, from + SENTENCES_PER_CALL);
    const numbered = sentences
      .slice(windowStart, windowEnd)
      .map((s, i) => `${windowStart + i + 1}. ${s}`)
      .join('\n');

    const previous = beats.length
      ? `The previous beat was "${beats[beats.length - 1]?.emotional_beat_name || ''}" (${beats[beats.length - 1]?.pacing_and_momentum || 'no pacing note'}). Only start a new beat here if the story genuinely turns.`
      : 'This is the opening of the film.';

    const prompt = `Act as an elite Hollywood director and master film editor blocking out a film.

Do NOT cut on time or word count. Read the script and find its dramatic beats and structural turning points. Start a new scene ONLY when:
- the emotional tone changes (curiosity to tension, comfort to shock),
- a new narrative beat or argument begins,
- a major piece of evidence or a twist is revealed,
- the visual metaphor has to evolve for the audience to follow the subtext.

Let the story dictate the number. A beat may be one sentence or a dozen.

${previous}

SCRIPT SENTENCES ${windowStart + 1}-${windowEnd} (numbered):
${numbered}

Return JSON exactly:
{
  "beats": [
    {
      "start_sentence": ${Math.max(windowStart + 1, from + 1)},
      "emotional_beat_name": "A specific dramatic name, e.g. 'The False Sense of Security', 'The Crushing Realization'",
      "pacing_and_momentum": "How this beat should feel — e.g. 'Slow and heavy, letting the silence linger' or 'Fast, erratic, building panic'",
      "directors_vision": "Camera placement, blocking, lighting shift and the psychological subtext of the frame. One or two sentences."
    }
  ]
}

RULES:
- start_sentence must be a sentence number shown above, and at least ${from + 1}.
- Beats must be in ascending order and must not repeat a number.
- Do not quote the script back; the numbers are enough.`;

    const result = await callGemini(ctx, prompt);
    const fresh = Array.isArray(result?.beats) ? result.beats : [];
    const accepted = fresh.filter(b => {
      const n = Number(b?.start_sentence);
      return Number.isFinite(n) && n >= from + 1 && n <= windowEnd;
    });

    const merged = [...beats, ...accepted];
    const nextSentence = windowEnd;
    const done = nextSentence >= sentences.length;

    await ctx.db.Projects.update(project_id, {
      scene_beats: JSON.stringify({ fingerprint, next_sentence: nextSentence, beats: merged }),
    });

    // Reported so the caller can show the real shape of the film as it is discovered.
    const planned = normalizeBeats(merged, sentences.length);
    console.log(`🎬 Beats: ${merged.length} found across ${nextSentence}/${sentences.length} sentences`);

    return {
      success: true,
      done,
      next_sentence: nextSentence,
      total_sentences: sentences.length,
      beats: merged.length,
      beat_names: planned.slice(-3).map(b => b.name),
      style_bible: bible,
    };
  } catch (error: any) {
    console.error('planSceneBeats error:', error.message);
    throw error instanceof HttpError ? error : new HttpError(500, error.message);
  }
};

export default handler;
