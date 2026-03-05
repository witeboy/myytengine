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
        temperature, max_tokens: 16384, response_format: { type: "json_object" }
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

    const body = await req.json();
    const project_id = body.project_id;
    const title = (body.title || '').replace(/["""''`\\\n\r]/g, "'").substring(0, 200);
    const category = body.category;
    const subject_description = (body.subject_description || '').replace(/["""''`\\\n\r]/g, "'").substring(0, 500);
    const visual_style = body.visual_style || 'photorealistic';
    const orientation = body.orientation || 'portrait';
    const custom_stages = body.custom_stages;

    if (!project_id || !title || !category) return Response.json({ error: 'project_id, title, category required' }, { status: 400 });

    const arc = CATEGORY_ARCS[category];
    const stages = custom_stages || arc?.stages;
    const videoCues = arc?.video_cues || [];
    if (!stages || stages.length < 7) return Response.json({ error: 'Need 7 stages' }, { status: 400 });

const CATEGORY_LANGUAGE = {
      construction: {
        engineer_role: 'structural engineer and site inspector',
        technical_terms: 'RCC footings, plinth beams, column starters, brick masonry infill, roof slab, shuttering, rebar cages, formwork, PCC layer, plastering, UPVC window frames, MS railing, waterproofing membrane, vitrified tile, external plaster coat, parapet wall, lintel beam, chajja',
        stage_one_desc: 'empty cleared plot of land with boundary markers, excavated soil, pegs and string lines marking the layout, no structure exists yet',
        position_lock: 'The building occupies the SAME position centered in the frame across all scenes. The surrounding neighborhood, boundary walls, trees, sky stay identical.',
      },
      renovation: {
        engineer_role: 'interior designer and renovation contractor',
        technical_terms: 'load-bearing wall, stud framing, electrical conduit, PEX plumbing, drywall sheets, joint compound, crown molding, baseboard trim, recessed lighting, subway tile backsplash, quartz countertop, floating vanity, LVP flooring, cabinet carcass, soft-close hinges',
        stage_one_desc: 'neglected room interior with peeling wallpaper, stained carpet, yellowed ceiling, dated wood paneling, old fluorescent fixtures, cracked tile',
        position_lock: 'The room is viewed from the SAME corner angle. The window position, door frame, ceiling height, and room proportions stay identical. Only the surfaces, fixtures, and furnishings change.',
      },
      restoration: {
        engineer_role: 'master restorer and conservation specialist',
        technical_terms: 'surface oxidation, patina removal, rust pitting, bead blasting, body filler, primer coat, wet sanding, clear coat, chrome replating, gasket replacement, honing, polishing compound, lacquer finish, original factory spec',
        stage_one_desc: 'heavily damaged original item showing deep rust, dents, cracked paint, missing parts, general neglect and decay, covered in grime and dirt',
        position_lock: 'The subject sits on the SAME surface in the SAME position and angle. The background wall, floor, lighting direction stay identical. Only the condition of the subject changes.',
      },
      space_remodel: {
        engineer_role: 'commercial architect and fit-out contractor',
        technical_terms: 'concrete slab floor, exposed ductwork, cable tray, glass partition wall, raised access floor, suspended ceiling grid, LED panel lights, data cabling, fire sprinkler heads, reception millwork, acoustic panels, breakout area, kitchenette countertop',
        stage_one_desc: 'vast empty warehouse interior with bare concrete floor, exposed steel roof trusses, industrial windows, dust and debris, no partitions',
        position_lock: 'The interior is viewed from the SAME entry point angle. Ceiling height, far wall, window positions stay identical. Only the interior build-out changes.',
      },
      vehicle: {
        engineer_role: 'master automotive restorer and body shop technician',
        technical_terms: 'quarter panel, rocker panel, A-pillar, B-pillar, door skin, fender flare, chassis rail, subframe, engine bay, firewall, wheel arch, drip rail, rain gutter, pinch weld, spot weld, body filler, guide coat, orange peel, clear coat, color sand, cut and buff, chrome bumper, trim clip',
        stage_one_desc: 'abandoned rusted vehicle sitting on flat tires with broken glass, heavily oxidized paint, visible dents and body damage, missing trim pieces, overall decay',
        position_lock: 'The vehicle sits in the SAME position on the SAME surface at the SAME three-quarter front angle. Background wall, ground surface, lighting direction stay identical. Only the vehicle condition changes.',
      },
      street_urban: {
        engineer_role: 'civil engineer and urban planner',
        technical_terms: 'bituminous surface, storm drain inlet, curb and gutter, manhole cover, utility trench, compacted sub-base, asphalt overlay, road marking paint, pedestrian bollard, LED street light, tree grate, permeable paver, cycle lane separator, tactile paving, median strip',
        stage_one_desc: 'deteriorated street with cracked and potholed asphalt, faded lane markings, overgrown weeds in gutter cracks, leaning utility pole, general urban decay',
        position_lock: 'The street is viewed from the SAME elevated position looking down the road. Building facades on both sides, distant vanishing point, sky proportion all stay identical. Only the road surface and street furniture change.',
      },
      nature: {
        engineer_role: 'landscape architect and horticulturist',
        technical_terms: 'topsoil layer, raised bed cedar frame, drip irrigation line, landscape fabric, bark mulch, root ball, transplant, trellis support, compost amendment, pollinator border, stepping stone path, edging stone, rain barrel, companion planting, succession planting',
        stage_one_desc: 'bare patch of earth with scattered weeds, rocks, and dry soil, no planted beds, no paths, no structure, just raw unworked ground',
        position_lock: 'The garden plot is viewed from the SAME slightly elevated angle. Boundary fence, background trees or structures, sky stay identical. Only the garden beds and plantings change.',
      },
    };

    const catLang = CATEGORY_LANGUAGE[category] || CATEGORY_LANGUAGE.construction;

    const isPortrait = orientation === 'portrait';
    const lensSpec = isPortrait ? 'vertical composition, 35mm lens, portrait, camera height 10m' : '3/4 aerial perspective, 24mm lens, camera height 12m';

    const prompt = `You are a ${catLang.engineer_role} AND a professional photographer creating a progression photo series.

PROJECT: "${title}"
SUBJECT: ${subject_description || title}
Category: ${category}
Orientation: ${isPortrait ? 'vertical portrait' : 'horizontal landscape'}

THE 7 STAGES (in exact order):
${stages.map((s, i) => `  Stage ${i + 1}: ${s}`).join('\n')}

VIDEO TRANSITION CUES:
${videoCues.map((c, i) => `  Between ${i + 1} and ${i + 2}: ${c}`).join('\n')}

TECHNICAL VOCABULARY FOR THIS CATEGORY (use these terms in prompts):
${catLang.technical_terms}

Generate this EXACT JSON structure:

{
  "subject_identity": "Describe the EXACT final ${category === 'vehicle' ? 'vehicle' : category === 'nature' ? 'garden' : category === 'street_urban' ? 'street' : category === 'renovation' || category === 'space_remodel' ? 'space' : 'structure'} being transformed. Be hyper-specific about its final completed form — style, materials, key features, distinguishing details. Write like a ${catLang.engineer_role} would describe the finished project. Forty to sixty words.",

  "camera_suffix": "Same fixed three-quarter perspective, same background, same lighting direction, identical camera position throughout, no humans, no machinery, no equipment, ${visual_style || 'photorealistic'}, sharp focus, no text, no numbers, no words, no letters, no writing, no watermarks",

  "scenes": [
    {
      "scene_number": 1,
      "title": "${title} - [stage name]",
      "image_prompt": "STRUCTURE: Write a technical description of what is PHYSICALLY VISIBLE at this stage using category-specific terminology (${catLang.technical_terms.split(',').slice(0, 6).join(',')}). Describe specific materials, components, conditions, and structural elements. Be precise like a ${catLang.engineer_role} writing a site inspection report. CAMERA: End with the camera_suffix text VERBATIM — copied exactly, not rephrased. TOTAL: one hundred twenty to one hundred eighty words.",
      "video_transition_prompt": "Cinematic high-speed time-lapse showing the transformation from THIS stage to the NEXT. Workers visible only from behind, no faces. Describe specific activities for this category. Camera stays perfectly still, only the subject changes. Forty to sixty words.",
      "hold_seconds": 1.5,
      "is_camera_locked": true
    }
  ]
}

ABSOLUTE RULES:

RULE 1 — SCENE ONE IS THE STARTING STATE: Scene one shows: ${catLang.stage_one_desc}. Nothing has been done yet. This is the raw starting condition before any work begins.

RULE 2 — REALISTIC STEP-BY-STEP PROGRESSION: Each scene must show the NEXT logical step. No skipping stages. Each scene adds specific new elements visible from the previous scene. A viewer must see CLEAR physical change between each consecutive pair.

RULE 3 — POSITION LOCKED: ${catLang.position_lock} The subject does NOT move, rotate, or shift between scenes one through six.

RULE 4 — CAMERA SUFFIX VERBATIM: Every image_prompt for scenes one through six MUST end with the EXACT camera_suffix text. Copied character for character. Not rephrased.

RULE 5 — TECHNICAL LANGUAGE: Write prompts like a ${catLang.engineer_role} describing an inspection photo. Use specific technical terms from this vocabulary: ${catLang.technical_terms}. Do NOT write poetic or atmospheric descriptions. Be precise and structural.

RULE 6 — NO DIGIT NUMBERS IN IMAGE PROMPTS: Spell out all numbers as words. Write "two-story" not "2-story". Grok renders digits as visible text in the image.

RULE 7 — EXACTLY SEVEN SCENES in the scenes array.

RULE 8 — TITLE: Every scene title must start with "${title} -".

RULE 9 — SCENE SEVEN UNLOCKED: Scene seven uses a DIFFERENT camera angle — closer, at ground level, showing people actively using and enjoying the completed result. Warm emotional payoff. This is the only scene where people appear in the image_prompt.

RULE 10 — HOLD TIMING: Scene one = one and a half seconds. Scenes two through five = point eight seconds. Scene six = one and a half seconds. Scene seven = two seconds.`;
    
    console.log(`🎬 Flow: ${title} | ${category} | ${orientation}`);
    console.log(`📋 Subject: ${subject_description || 'none'}`);
    console.log(`🎨 Style: ${visual_style}`);
    console.log(`📝 Prompt length: ${prompt.length} chars`);

    let result;
    try {
      result = await callLLM(prompt, 0.6);
      console.log(`✓ LLM returned: ${JSON.stringify(result).substring(0, 200)}...`);
    } catch (llmErr) {
      console.error(`❌ LLM call failed: ${llmErr.message}`);
      return Response.json({ error: `LLM failed: ${llmErr.message}` }, { status: 500 });
    }

    if (!result.scenes || !Array.isArray(result.scenes)) {
      console.error(`❌ No scenes array in result. Keys: ${Object.keys(result).join(', ')}`);
      return Response.json({ error: `LLM returned no scenes array. Got keys: ${Object.keys(result).join(', ')}` }, { status: 500 });
    }

    if (result.scenes.length < 7) {
      console.error(`❌ Only ${result.scenes.length} scenes returned`);
      return Response.json({ error: `Expected 7 scenes, got ${result.scenes.length}` }, { status: 500 });
    }

    // Delete old scenes
    try {
      const old = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      console.log(`🧹 Deleting ${old.length} old scenes...`);
      for (const s of old) {
        await base44.asServiceRole.entities.Scenes.delete(s.id);
      }
    } catch (delErr) {
      console.warn(`⚠ Delete old scenes failed: ${delErr.message} — continuing anyway`);
    }

    // Create new scenes
    let created = 0;
    for (const scene of result.scenes) {
      try {
        await base44.asServiceRole.entities.Scenes.create({
          project_id,
          scene_number: scene.scene_number || (created + 1),
          narration_text: scene.title || `Scene ${created + 1}`,
          image_prompt: scene.image_prompt || '',
          animation_prompt: scene.video_transition_prompt || '',
          duration_seconds: scene.hold_seconds || 1,
          status: 'prompts_ready',
        });
        created++;
      } catch (createErr) {
        console.error(`❌ Failed to create scene ${scene.scene_number}: ${createErr.message}`);
      }
    }

    console.log(`✓ Created ${created}/7 scenes`);

    try {
      await base44.asServiceRole.entities.Projects.update(project_id, { status: 'breakdown_complete', current_step: 5 });
    } catch (updErr) {
      console.warn(`⚠ Project update failed: ${updErr.message}`);
    }

    return Response.json({
      success: true,
      scenes_created: created,
      subject_identity: result.subject_identity,
      composition_lock: result.composition_lock?.substring(0, 100),
    });
  } catch (error) {
    console.error('generateProgressionPrompts error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
