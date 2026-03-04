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

PROJECT: Title: "${title}" | Category: ${category} | Subject: ${subject_description || title}
Visual Style: ${visual_style || 'photorealistic 4K'} | Orientation: ${isPortrait ? '9:16' : '16:9'} | Lens: ${lensSpec}

STAGES:
${stages.map((s, i) => `  S${i + 1}: ${s}`).join('\n')}

VIDEO CUES:
${videoCues.map((c, i) => `  T${i + 1}-${i + 2}: ${c}`).join('\n')}

Generate JSON:
{
  "camera_lock_block": "EXTREMELY detailed camera+environment description IDENTICAL for scenes 1-6. Exact camera height in meters, distance in meters, angle degrees, lens mm, f-stop, time of day, sun angle and direction, sky details, background elements (specific buildings/trees/terrain), foreground elements. 80-120 words. Do NOT describe the subject itself.",
  "visual_style_suffix": "${visual_style || 'photorealistic 4K'}, sharp focus, no text, no watermarks, no people, no vehicles, no machinery.",
  "scenes": [
    {
      "scene_number": 1,
      "title": "Stage title",
      "image_prompt": "Scenes 1-6: EXACT camera_lock_block text VERBATIM + subject description at this stage (60-80 words with specific textures, materials, colors, dimensions, structural details) + visual_style_suffix. NO people/machines/vehicles. Scene 7: DIFFERENT camera angle (ground level, closer, human perspective), includes people and activity, warm emotional payoff.",
      "video_transition_prompt": "Scenes 1-6: High-speed cinematic time-lapse showing transformation from THIS scene to the NEXT. Workers visible but ONLY from behind (no faces ever visible). Equipment and machinery allowed. Dust particles in light, materials being moved, structural changes happening fast. Subtle camera push-in. 40-60 words. Scene 7: null",
      "hold_seconds": 1.5,
      "is_camera_locked": true
    }
  ]
}

CRITICAL RULES:
1. camera_lock_block COPIED VERBATIM at start of scenes 1-6. NOT paraphrased. IDENTICAL text.
2. Scene 7 = DIFFERENT camera (closer, ground level), INCLUDES people enjoying the result.
3. Image prompts 1-6 = ZERO people, ZERO machines, ZERO vehicles. Structurally active but empty.
4. Video prompts = workers backs-to-camera, equipment, activity ALLOWED.
5. Each scene shows SPECIFIC NEW structural elements vs previous (not just "more complete").
6. Hold: S1=1.5s, S2-5=0.8s, S6=1.5s, S7=2.0s`;

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
