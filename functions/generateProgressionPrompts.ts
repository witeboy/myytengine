import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const CATEGORY_ARCS = {
  construction: {
    stages: ['Empty plot — raw land, boundary markers, wild grass','Foundation & footings — excavated trenches, rebar cages, concrete poured','Ground floor structure — columns, beams, brick infill walls rising','Upper floor & roof — second story framing, roof slab, scaffolding','Exterior complete — plastered walls, painted facade, windows installed','Fully finished — landscaping, driveway, fence, move-in ready','Life in use — family on porch, warm lights glowing, car in driveway'],
    video_cues: ['excavator digging, workers laying rebar, concrete pouring','columns erected, bricks laid course by course, mortar spreading','scaffolding rising, upper beams placed, workers on scaffolds','roof panels, exterior plastering, window frames installed','painters on ladders, landscapers planting, fence going in','camera sweeps to new angle, family walks up, lights turn on']
  },
  renovation: {
    stages: ['Neglected interior — peeling paint, stained carpet, dated fixtures','Demolition — walls stripped to studs, debris removed, bare floors','New framing — fresh studs, electrical wiring, plumbing visible','Drywall & finishes — smooth walls, primer, new flooring','Fixtures — cabinets, countertops, lighting, trim painted','Fully styled — furniture, art, plants, everything in place','Lived in — person reading by window, coffee steaming, morning light'],
    video_cues: ['workers demolishing walls, debris falling, dust clouds','electrician pulling wire, plumber fitting pipes, framing','drywall going up, mud and tape, sander smoothing','cabinets mounted, countertop lowered, fixtures wired','movers carrying furniture, art hung, plants placed','camera glides in, person sits with book, sunlight streams']
  },
  restoration: {
    stages: ['Damaged — rusted, dented, faded paint, neglected','Stripped — paint removed, surface bare, rust treated','Repair — dents hammered, parts replaced, welded seams','Primed — even gray primer, smooth surface','Paint & detail — glossy color, chrome polished, new badges','Showroom ready — gleaming under lights, every detail perfect','In glory — in action, admiring crowd, purpose fulfilled'],
    video_cues: ['wire brush scrubbing rust, stripper bubbling paint','welder sparking, body hammer tapping, grinder smoothing','spray gun laying primer, even gray covering surface','color coat building layer by layer, chrome buffed','final polish, badges pressed on, glass cleaned','crowd admiring, engine starts, satisfying reveal']
  },
  space_remodel: {
    stages: ['Empty warehouse — concrete floor, high ceilings, dust','Cleared — cleaned floors, walls marked for layout','Partitions — glass walls, offices framed, reception area','Systems — HVAC, lighting, network cables, paint','Furnished — desks, chairs, monitors, kitchen equipped','Branded — logo, art, plants, fully operational','Buzzing — team at desks, meeting room active, coffee bar'],
    video_cues: ['sweeping, pressure washing, marking lines','glass panels lifted, stud walls rising, drywall carried','electricians running conduit, painters rolling walls','furniture delivered, desks assembled, chairs unwrapped','logo mounted, plants arranged, final touches','camera sweeps through, people working, energy']
  },
  vehicle: {
    stages: ['Rusted wreck — flat tires, broken glass, dents','Stripped to frame — panels removed, engine pulled, bare chassis','Bodywork — panels repaired, welded, gaps aligned','Primer — full body gray primer, smooth','Paint & chrome — glossy color, chrome bumpers, new glass','Complete — engine detailed, interior restored, wheels on','On the road — driving highway, sun on paint, freedom'],
    video_cues: ['wrenches turning, panels unbolted, engine hoisted','welding torch, hammer shaping metal, grinder sparking','spray gun sweeping primer, steady coats','paint booth mist, color building, wet sand between coats','seats installed, dashboard assembled, engine lowered','key turns, engine roars, car pulls into sunlight']
  },
  street_urban: {
    stages: ['Deteriorated — cracked pavement, faded markings, overgrown','Torn up — surface removed, trenches dug, bare earth','Infrastructure — pipes laid, manholes set, curbs formed','Paved — fresh asphalt, smooth, drains installed','Marked — lanes, crosswalks, signs, benches, lights','Landscaped — trees, planters, bike lane, clean','Alive — pedestrians, cyclists, cafe tables, evening glow'],
    video_cues: ['jackhammers breaking surface, excavators digging','workers laying pipes, concrete pouring into forms','paving machine rolling asphalt, roller compacting','line painter striping, signs bolted, benches placed','landscapers planting trees, flowers in beds','camera rises showing bustling street at golden hour']
  },
  nature: {
    stages: ['Bare earth — empty soil, weeds, rocks','Prepared — soil tilled, raised beds framed, paths marked','Early growth — seedlings sprouting, mulch laid','Growing — plants knee-high, vines climbing, buds forming','Full bloom — lush, colorful flowers, vegetables ripe','Harvest ready — fruits heavy, garden at peak, butterflies','Enjoyed — hands picking produce, basket full, sunset glow'],
    video_cues: ['shovel turning soil, bed frames placed, raking','seeds pressed in, watering, sprouts emerging','stems growing time-lapse, leaves unfurling','buds opening, bees buzzing, colors spreading','breeze through garden, butterflies, dappling sun','hands picking tomato, placing in basket, overview']
  }
};

async function callLLM(prompt, temperature = 0.7) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a world-class architectural photographer and AI image prompt engineer. Always respond in valid JSON only." },
          { role: "user", content: prompt }
        ],
        temperature, max_tokens: 8192, response_format: { type: "json_object" }
      })
    });
    if (response.status === 429) { await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 5000)); continue; }
    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    try { return JSON.parse(text); } catch (_) {
      const fenced = text?.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) return JSON.parse(fenced[1]);
      throw new Error('JSON parse failed');
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, title, category, subject_description, visual_style, orientation, custom_stages } = await req.json();
    if (!project_id || !title || !category) return Response.json({ error: 'project_id, title, category required' }, { status: 400 });

    const arc = CATEGORY_ARCS[category];
    const stages = custom_stages || arc?.stages;
    const videoCues = arc?.video_cues || [];
    if (!stages || stages.length < 7) return Response.json({ error: 'Need 7 stages' }, { status: 400 });

    const isPortrait = orientation === 'portrait';
    const lensSpec = isPortrait ? 'vertical composition, 35mm lens, portrait, camera height 10m' : '3/4 aerial perspective, 24mm lens, camera height 12m';

    const prompt = `Create a 7-scene VISUAL PROGRESSION — cinematic time-lapse transformation.

PROJECT TITLE: "${title}"
SUBJECT: ${subject_description || title}
Category: ${category}
Visual Style: ${visual_style || 'photorealistic'}
Orientation: ${isPortrait ? '9:16 vertical' : '16:9 horizontal'}

STAGES:
${stages.map((s, i) => `  S${i + 1}: ${s}`).join('\n')}

VIDEO CUES:
${videoCues.map((c, i) => `  T${i + 1}-${i + 2}: ${c}`).join('\n')}

Generate JSON:
{
  "subject_identity": "A HYPER-SPECIFIC description of the EXACT subject being transformed. If it is a vehicle: exact make, model, year, body style, color when new. If building: exact style, dimensions, material. If object: exact type, brand, model. This description MUST be specific enough that any artist would draw the SAME object. Example: 'a 1987 Toyota Land Cruiser FJ60, boxy SUV body, rounded headlights, chrome front bumper, originally silver metallic paint'. 30-50 words.",

  "composition_lock": "A description of WHERE the subject sits in the frame and what surrounds it. NO numbers. NO measurements. NO technical camera specs. NO focal lengths. NO f-stops. NO distances in meters. Describe using ONLY visual words. Example: 'The vehicle is centered in the frame, facing slightly to the right at a three-quarter angle. It sits on flat dusty ground that fills the lower third of the image. Behind the vehicle, a tall concrete perimeter wall stretches across the full width. Beyond the wall, three palm trees and a water tower are visible against a clear blue sky with a few white clouds. Golden late-afternoon sunlight comes from the left side, casting long shadows to the right.' This block is COPIED VERBATIM into scenes one through six. 80-100 words. CRITICAL: Do NOT use ANY numbers, measurements, millimeters, meters, degrees, f-stops, or resolution values — Grok will render them as visible text in the image.",

  "visual_style_suffix": "${visual_style || 'photorealistic'}, sharp focus, absolutely no text, no numbers, no words, no letters, no writing, no watermarks, no UI elements, no people, no vehicles other than the subject, no machinery",

  "scenes": [
    {
      "scene_number": 1,
      "title": "Stage title that includes the project title ${title}",
      "image_prompt": "For scenes one through six: Start with the EXACT composition_lock text WORD FOR WORD. Then write: the subject_identity text. Then describe ONLY what has changed about the subject at THIS stage — rust patterns, missing parts, new paint, structural changes. Describe the subject in its CURRENT CONDITION at this stage. Keep the subject in the EXACT SAME POSITION, SAME SIZE, SAME ANGLE in every scene. The background must be IDENTICAL. End with visual_style_suffix. TOTAL prompt should be 120-180 words. For scene seven: DIFFERENT composition — close-up or action shot showing the completed subject being used and enjoyed. Include people.",
      "video_transition_prompt": "For scenes one through six: Describe a cinematic time-lapse showing the transformation from THIS stage to the NEXT. Workers visible but only from behind, never showing faces. Equipment and tools in use. Dust and debris. Fast-forward motion. The camera stays perfectly still — only the subject changes. 40-60 words. Scene seven: null",
      "hold_seconds": 1.5,
      "is_camera_locked": true
    }
  ]
}

ABSOLUTE RULES — VIOLATION OF ANY RULE MEANS FAILURE:

RULE 1 — ZERO NUMBERS IN IMAGE PROMPTS: The image_prompt must contain ZERO digits. No "10m", no "35mm", no "f/5.6", no "4K", no "720p", no "1080", no "24mm". Use ONLY descriptive words: "medium distance", "slightly above eye level", "sharp focus". Grok Imagine RENDERS numbers as visible text in the image. ANY number in the prompt will appear as ugly text overlaid on the image.

RULE 2 — SAME SUBJECT IDENTITY: The subject_identity description must appear in EVERY image prompt for scenes one through six. It is the SAME object transforming. Not a different car. Not a different building. The EXACT SAME one described with the EXACT SAME identity words plus its current condition at that stage.

RULE 3 — COMPOSITION LOCK = VERBATIM: The composition_lock text is COPIED CHARACTER FOR CHARACTER into scenes one through six. Not paraphrased. Not reworded. COPIED. This ensures the subject stays in the same position, same size, same angle, same background in every frame.

RULE 4 — ONLY THE SUBJECT CHANGES: Between scenes one through six, the ONLY thing that changes is the CONDITION of the subject. The background, ground, sky, lighting, shadows, surrounding elements — ALL stay identical. Described by the composition_lock block.

RULE 5 — TITLE INCLUSION: The project title "${title}" must appear in every scene title.

RULE 6 — SCENE SEVEN IS DIFFERENT: Scene seven breaks all locks. New angle, new composition, includes people, shows the subject being used/enjoyed. Emotional payoff.

RULE 7 — NO TECHNICAL PHOTOGRAPHY TERMS: Do not use "bokeh", "depth of field", "aperture", "ISO", "shutter speed", "focal length", "lens", "f-stop" in image prompts. These get rendered as text. Use simple visual descriptions instead.`;

    console.log(`🎬 Flow: ${title} | ${category}`);
    const result = await callLLM(prompt, 0.6);
    if (!result.scenes || result.scenes.length < 7) throw new Error(`Expected 7, got ${result.scenes?.length || 0}`);

    const old = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    for (const s of old) await base44.asServiceRole.entities.Scenes.delete(s.id);

    for (const scene of result.scenes) {
      await base44.asServiceRole.entities.Scenes.create({
        project_id, scene_number: scene.scene_number, narration_text: scene.title,
        image_prompt: scene.image_prompt, animation_prompt: scene.video_transition_prompt || '',
        duration_seconds: scene.hold_seconds || 1, status: 'prompts_ready',
      });
    }

    await base44.asServiceRole.entities.Projects.update(project_id, { status: 'breakdown_complete', current_step: 5 });

    return Response.json({ success: true, scenes_created: result.scenes.length, camera_lock_block: result.camera_lock_block });
  } catch (error) {
    console.error('generateProgressionPrompts error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
