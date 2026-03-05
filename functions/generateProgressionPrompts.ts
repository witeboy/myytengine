import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// FLOW/RE-MAKE — Prompt Pack Generator
// ══════════════════════════════════════════════════════════════════
// Uses the "Prompt Pack" pattern: LLM generates ONLY the subject
// description per stage. Camera lock suffix is built in CODE and
// appended identically to every scene. No LLM drift possible.
// ══════════════════════════════════════════════════════════════════

const CATEGORY_PACKS = {
  construction: {
    role: 'professional architectural content creator, architect, civil engineer, cinematic visual designer',
    camera_lock: 'same suburban background with neighboring houses and boundary wall visible, same right-side golden sunlight casting shadows to the left, identical fixed three-quarter aerial perspective, slightly above eye level, worksite ground filling lower third of frame, clear sky with scattered clouds, no humans, no machinery, no vehicles, no equipment, no workers, photorealistic, sharp architectural photography, no text, no numbers, no words, no letters, no watermarks',
    scene_flow: [
      { title: 'Empty Plot', instruction: 'Empty cleared rectangular plot of land. Boundary markers with string lines marking the layout. Excavated soil piled to one side. Raw earth surface with patches of wild grass. No structure exists yet. Pegs driven into ground at corners.' },
      { title: 'Foundation & Footings', instruction: 'RCC isolated footings cast with clean concrete finish. PCC layer visible beneath. Plinth beams connecting footings forming structural grid. Vertical column starter bars with exposed reinforcement rising upward. Compacted soil backfilled neatly around footings.' },
      { title: 'Ground Floor Structure', instruction: 'RCC columns risen to full ground floor height. Brick masonry infill walls between columns at varying stages of completion. Ground floor roof slab cast with visible beam lines. Staircase RCC flight visible. Window and door openings left in brickwork.' },
      { title: 'Upper Floor & Roof', instruction: 'Second floor columns and brick walls completed. Upper roof slab cast with parapet walls started. External staircase visible. Scaffolding marks on walls. All window openings formed. Chajja projections visible above openings. Water tank platform on roof.' },
      { title: 'Exterior Finishing', instruction: 'External plaster coat applied smooth on all walls. UPVC window frames installed with glass. Main door frame fitted. External paint in final color applied. Chajja tiles fixed. MS railing on staircase and balcony. Waterproofing membrane visible on roof edge.' },
      { title: 'Fully Complete', instruction: 'Boundary wall with gate and nameplate. Paved driveway and walkway. Landscaped garden with planted shrubs. External light fixtures mounted. Vitrified tile flooring visible through windows. Completely finished and move-in ready exterior.' },
      { title: 'Life In Use', instruction: null }
    ],
    scene7_template: 'Ground-level close-up perspective, warm golden sunset lighting. Family gathered on the front porch of the completed house. Children playing in the landscaped garden. Warm interior lights glowing through large windows. Car parked in the driveway. Inviting and lived-in atmosphere. Photorealistic, cinematic warmth, no text, no watermarks.',
    video_cues: [
      'High-speed time-lapse, excavator digging trenches, workers from behind laying rebar cages, concrete mixer truck pouring into formwork, dust rising, camera perfectly still',
      'Fast-forward columns rising with formwork, bricklayers from behind laying courses, mortar spreading, scaffolding being erected, camera locked',
      'Time-lapse upper floor formwork and pour, brick walls rising on second floor, staircase taking shape, workers on scaffolds seen from behind only',
      'Plasterers applying external coat from scaffolds, window frames being lifted into openings, painters rolling exterior walls, all workers backs to camera',
      'Landscapers planting shrubs, pavers being laid for driveway, gate being installed, final exterior lights mounted, workers from behind',
      'Camera angle shifts and lowers to ground level, family approaches the front door, warm lights turn on inside, children run into garden'
    ],
    realism_rules: 'Structurally accurate RCC system. Realistic slab thickness. Proper beam-column grid. Accurate brick infill walls. Staircase formation visible. Parapet walls. Logical construction progression. No unrealistic structural errors.'
  },

  vehicle: {
    role: 'master automotive restorer, body shop technician, cinematic workshop visual designer',
    camera_lock: 'same workshop background with tool pegboard on rear wall and concrete floor, same warm overhead workshop lighting from above-left, identical fixed three-quarter front angle, vehicle centered on same position on floor, same distance from camera, no humans, no visible hands, no tools in motion, photorealistic, sharp mechanical photography, no text, no numbers, no words, no letters, no watermarks',
    scene_flow: [
      { title: 'Rusted Wreck', instruction: 'Heavily oxidized body panels with deep rust pitting and flaking paint. Flat deteriorated tires on corroded rims. Broken windshield with spider cracks. Missing trim pieces and badges. Dented quarter panels and door skins. Overall abandoned neglected condition.' },
      { title: 'Stripped to Frame', instruction: 'All body panels removed and leaning against workshop wall. Bare chassis and subframe exposed. Engine bay empty with engine on stand nearby. Interior completely gutted. Wiring harness removed. Suspension components visible. Raw bare metal frame.' },
      { title: 'Bodywork Complete', instruction: 'All panels refitted with aligned gaps. Body filler smoothed on repaired dents. Spot welds ground flush. Pinch welds cleaned. All panel gaps even and consistent. New replacement panels where needed. Surface ready for primer. No rust visible.' },
      { title: 'Primer Coat', instruction: 'Full body covered in even gray primer coat. Smooth matte gray surface across all panels. Guide coat applied for surface check. No orange peel visible. All body lines straight and crisp. Window openings masked with tape and paper.' },
      { title: 'Paint & Chrome', instruction: 'Deep glossy color coat with mirror-like reflection. Clear coat polished to showroom finish. Chrome bumpers freshly replated and gleaming. New glass installed all around. All trim clips and badges refitted. New rubber seals around doors and windows.' },
      { title: 'Showroom Ready', instruction: 'Engine bay fully detailed with correct components. New interior fully installed with restored upholstery. New tires on polished wheels. All lights working. Dashboard complete with original gauges. Perfect concours condition from every angle.' },
      { title: 'On The Road', instruction: null }
    ],
    scene7_template: 'Low angle tracking shot perspective on open coastal highway. The fully restored vehicle driving with sun reflecting off gleaming paint. Wind in the scene. Beautiful landscape backdrop. Driver visible only as silhouette. Sense of freedom and mechanical perfection. Cinematic, photorealistic, golden hour light, no text, no watermarks.',
    video_cues: [
      'Time-lapse hands with wrenches unbolting panels, engine lifted by chain hoist, parts placed on shelves, worker backs to camera only',
      'Fast-forward welding sparks flying, body hammer tapping dents, angle grinder smoothing metal, dust particles catching light',
      'Spray gun sweeping even primer coats across panels, masking tape applied, guide coat dusted on, sanding blocks working surface',
      'Paint booth mist, rich color building coat by coat, wet sanding between layers, chrome bumpers being buffed to mirror shine',
      'Interior seats being bolted in, dashboard assembled, engine lowered back into bay, wheels torqued on, final detailing cloth wipe',
      'Key inserted, engine turns over and roars to life, car rolls forward out of garage into bright sunlight, camera follows'
    ],
    realism_rules: 'Correct proportions for the vehicle type. Accurate panel gap alignment. Logical restoration sequence. Proper mechanical components visible. No fantasy modifications.'
  },

  restoration: {
    role: 'master restorer, conservation specialist, cinematic workshop visual designer',
    camera_lock: 'same workbench surface with wood grain visible, same warm overhead workshop lamp lighting from above-left, identical fixed three-quarter overhead macro perspective, subject centered on same position on bench, same distance and framing, no humans, no visible hands, no tools in motion, photorealistic, sharp mechanical detail photography, no text, no numbers, no words, no letters, no watermarks',
    scene_flow: [
      { title: 'Damaged Original', instruction: 'Heavy surface oxidation and rust pitting across all metal surfaces. Cracked and flaking original finish. Dents and scratches from years of neglect. Grime and dirt buildup in crevices. Missing or broken small components. Overall neglected and deteriorated condition on workbench.' },
      { title: 'Stripped & Cleaned', instruction: 'All old finish completely removed by chemical stripping and bead blasting. Bare raw metal surface exposed. Rust completely treated and neutralized. All components disassembled and laid out on clean cloth on workbench. Each part individually cleaned.' },
      { title: 'Repair & Refinement', instruction: 'Dents carefully worked out with precision tools. Replacement parts fitted where originals were beyond repair. Welded seams ground smooth and invisible. Metal surfaces honed and polished to even texture. All moving parts tested for function.' },
      { title: 'Primer & Prep', instruction: 'Even gray primer coat applied across all metal components. Surface inspected under raking light for imperfections. Wet sanded between coats to glass-smooth finish. Masking applied to areas that will receive different finishes. Ready for final color.' },
      { title: 'Final Finish Applied', instruction: 'Deep rich color coat with mirror-smooth surface. All chrome or nickel plated parts gleaming. Original markings and engravings crisp and clean. Wooden or grip components refinished with hand-rubbed oil finish. Original factory specification appearance achieved.' },
      { title: 'Museum Grade Complete', instruction: 'Fully reassembled in perfect working order on display cloth. Every component polished and fitted. Light catching all reflective surfaces. Original case or display stand visible. Perfect concours restoration from every angle. Pristine museum-quality presentation.' },
      { title: 'In Glory', instruction: null }
    ],
    scene7_template: 'Low angle glamour shot perspective in display setting. The fully restored piece displayed under museum lighting with velvet backdrop. Admiring collector examining from respectful distance. Warm spotlights creating dramatic highlights on polished surfaces. Sense of reverence and craftsmanship triumph. Cinematic, photorealistic, dramatic lighting, no text, no watermarks.',
    video_cues: [
      'Hands with wire brush carefully scrubbing rust, chemical stripper bubbling on surface, cotton swabs cleaning crevices, all from behind no faces',
      'Precision hammer tapping dents, jewelers file working edges, welding torch making tiny repair beads, grinding wheel smoothing, sparks flying',
      'Spray gun laying even primer coats, wet sandpaper working surface smooth, inspection under angled light, masking tape applied precisely',
      'Paint booth fine mist, color building in thin layers, polishing compound applied with cloth, chrome parts emerging from plating bath',
      'Careful reassembly with precision tools, each component fitted and tested, final cleaning with soft cloth, display arrangement',
      'Camera pulls back to reveal display setting, soft museum lights illuminate, collector leans in to admire, subtle nod of appreciation'
    ],
    realism_rules: 'Accurate to the original design of the subject. Correct proportions and details. Logical restoration sequence. Authentic finishes and techniques. No fantasy modifications or modernization.'
  },

  renovation: {
    role: 'interior designer, renovation contractor, cinematic visual designer',
    camera_lock: 'same room corner angle showing window on left wall and doorframe on right, same natural daylight from window direction, identical fixed perspective from room corner, same ceiling height and floor area visible, no humans, no tools in motion, photorealistic, sharp interior photography, no text, no numbers, no words, no letters, no watermarks',
    scene_flow: [
      { title: 'Neglected State', instruction: 'Peeling yellowed wallpaper on all walls. Stained matted carpet with visible wear paths. Dated wood-grain laminate cabinets with broken handles. Old fluorescent ceiling fixture with yellowed plastic cover. Cracked ceramic floor tile near doorway. Water stain on ceiling corner.' },
      { title: 'Demolition Complete', instruction: 'Walls stripped to bare studs with insulation visible between framing. Old carpet removed exposing plywood subfloor. All old cabinets and fixtures removed. Debris swept into pile. Bare electrical boxes visible on studs. Plumbing pipes exposed in wall cavity.' },
      { title: 'New Systems Framed', instruction: 'Fresh lumber stud walls with new electrical conduit and outlet boxes wired. PEX plumbing lines run in walls with stub-outs for fixtures. Insulation batts installed between studs. Subfloor repaired and leveled. Recessed lighting cans installed in ceiling framing.' },
      { title: 'Drywall & Finishes', instruction: 'Smooth finished drywall on all walls with joint compound sanded. Fresh white primer coat applied. New LVP flooring planks installed across room. Crown molding and baseboard trim installed and caulked. Recessed lights visible in finished ceiling. Window trim painted.' },
      { title: 'Fixtures Installed', instruction: 'Kitchen cabinets mounted with quartz countertop installed. Subway tile backsplash grouted. Pendant lights hanging over counter. Under-cabinet LED strip lighting. Stainless steel appliances fitted in openings. Soft-close drawer hardware visible.' },
      { title: 'Fully Styled', instruction: 'Furniture arranged with area rug on floor. Art hung on walls. Indoor plants on shelves and countertop. Decorative items styled on surfaces. Coordinated throw pillows on seating. Books and personal touches visible. Magazine-ready interior design.' },
      { title: 'Lived In', instruction: null }
    ],
    scene7_template: 'Warm morning light streaming through window. Person sitting comfortably reading with coffee mug steaming on side table. Soft natural light creating cozy atmosphere. Plants catching window light. Everything feels naturally inhabited and loved. Cinematic warmth, photorealistic, lifestyle photography feel, no text, no watermarks.',
    video_cues: [
      'Workers swinging sledgehammers at walls, debris falling, dust clouds, old carpet being ripped up, all workers from behind',
      'Electrician pulling wire through studs, plumber fitting copper joints, insulation being pressed between studs, all from behind',
      'Drywall sheets lifted to walls, joint compound spread, sander working smooth, primer roller painting, flooring planks clicking together',
      'Cabinets lifted onto wall brackets, countertop lowered into place, tile being pressed onto backsplash, lights switched on',
      'Furniture being carried through doorway, art being hung on walls, plants placed on shelves, pillows arranged, all from behind',
      'Camera settles into cozy perspective, person walks in and sits down, opens book, takes sip of coffee, morning sunlight shifts'
    ],
    realism_rules: 'Realistic renovation sequence. Proper framing and systems order. Accurate fixture installation. Logical interior design progression.'
  },

  space_remodel: {
    role: 'commercial architect, fit-out contractor, cinematic visual designer',
    camera_lock: 'same warehouse interior angle from entry corner showing full depth of space, same industrial window light from left side, identical fixed perspective, same ceiling trusses and far wall visible, no humans, no furniture being moved, photorealistic, sharp commercial interior photography, no text, no numbers, no words, no letters, no watermarks',
    scene_flow: [
      { title: 'Empty Warehouse', instruction: 'Vast empty concrete floor with dust and debris scattered. Exposed steel roof trusses high above. Industrial windows grimy and partly blocked. No partitions or walls. Raw concrete block perimeter walls. Single hanging industrial light. Abandoned vacant feel.' },
      { title: 'Cleared & Prepped', instruction: 'Floor pressure-washed clean showing smooth concrete. Chalk layout lines marked on floor for partitions. Walls cleaned and prepped. Windows cleaned letting light flood in. Temporary construction lighting set up. Material pallets staged along far wall.' },
      { title: 'Partitions Built', instruction: 'Glass partition walls erected forming office spaces and meeting rooms. Reception desk millwork installed in entry area. Stud walls framed for private offices. Drywall applied on solid walls. Cable trays running along ceiling for data and power.' },
      { title: 'Systems Complete', instruction: 'Suspended ceiling grid installed with LED panel lights. HVAC ductwork visible in open ceiling areas. All walls painted in clean white and accent colors. Polished concrete floor sealed and gleaming. Fire sprinkler heads visible. All electrical outlets and switches installed.' },
      { title: 'Furnished', instruction: 'Workstation desks with monitors arranged in open plan area. Ergonomic chairs at each desk. Meeting room with conference table and whiteboard. Kitchenette with countertop, sink, coffee machine. Breakout area with sofa and low tables.' },
      { title: 'Branded & Operational', instruction: 'Company logo mounted on reception wall with dimensional lettering. Indoor plants throughout space in modern planters. Art and motivational pieces on walls. Acoustic panels in strategic locations. All accessories and stationery in place. Fully operational office ready for day one.' },
      { title: 'Buzzing With Life', instruction: null }
    ],
    scene7_template: 'Ground level perspective inside the bustling office. Team members at desks working on screens. Meeting in progress behind glass wall. Someone at the coffee bar. Natural conversation energy. Plants catching window light. Productive creative atmosphere. Cinematic, photorealistic, commercial lifestyle photography, no text, no watermarks.',
    video_cues: [
      'Workers sweeping and pressure washing floor, marking lines with chalk snap, staging materials, all from behind',
      'Glass panels lifted into ceiling tracks, stud walls rising, drywall carried and screwed into place, cable trays bolted to ceiling',
      'Electricians in ceiling installing lights, HVAC installers on lifts connecting ducts, painters rolling walls, all from behind',
      'Delivery truck unloading flat-pack furniture, desks being assembled, chairs unwrapped, monitors placed, all from behind',
      'Logo being mounted with level, plants arranged in planters, art being hung with care, final cable management clips',
      'Camera lowers to desk level, people stream in through entrance, laptops open, conversations start, coffee poured'
    ],
    realism_rules: 'Realistic commercial fit-out sequence. Proper systems installation order. Accurate office furniture and equipment. Professional workspace standards.'
  },

  street_urban: {
    role: 'civil engineer, urban planner, cinematic visual designer',
    camera_lock: 'same elevated perspective looking down the street with building facades on both sides, same afternoon sunlight from right side, identical fixed viewpoint, same distant vanishing point and sky proportion, no humans, no vehicles moving, photorealistic, sharp urban photography, no text, no numbers, no words, no letters, no watermarks',
    scene_flow: [
      { title: 'Deteriorated Street', instruction: 'Cracked and potholed bituminous road surface with visible sub-base through damaged areas. Faded barely visible lane markings. Overgrown weeds pushing through gutter cracks. Leaning utility pole with tangled wires. Broken curb stones. Blocked storm drain inlets. General urban neglect.' },
      { title: 'Torn Up & Excavated', instruction: 'Old road surface completely removed exposing compacted sub-base. Utility trenches dug along both sides revealing old pipes. Excavated earth piled alongside trenches. Old curb stones removed. Temporary barriers marking work zone. Raw exposed ground along full street length.' },
      { title: 'New Infrastructure', instruction: 'New PVC and concrete pipes laid in trenches with gravel bedding. New manhole covers set at correct grade. Concrete curb and gutter forms poured on both sides. New utility conduits laid. Compacted granular sub-base leveled and rolled. Storm drain inlets connected.' },
      { title: 'Fresh Paved', instruction: 'Smooth fresh black asphalt surface paved across full width. New concrete curbs and gutters bright white. Storm drain grates flush with surface. No markings yet applied. Clean sharp edges where asphalt meets curb. Road surface pristine and even.' },
      { title: 'Marked & Furnished', instruction: 'Crisp white lane markings and crosswalk stripes painted. Road signs bolted to new galvanized posts. LED street lights installed on new poles. Benches and trash receptacles placed on sidewalk. Bike lane separator bollards installed. Tactile paving at crossings.' },
      { title: 'Landscaped & Complete', instruction: 'Street trees planted in new tree grates along sidewalk. Planter beds with ornamental grasses and flowers. Permeable paver sidewalk sections installed. Bike lane painted green. All lighting working. Complete and pristine streetscape from end to end.' },
      { title: 'Alive With Activity', instruction: null }
    ],
    scene7_template: 'Street level perspective at golden hour. Pedestrians walking on new sidewalk. Cyclist in bike lane. Outdoor cafe tables occupied with people having drinks. Street lights just turning on. Trees casting long shadows. Vibrant urban life on a beautifully renewed street. Cinematic warmth, photorealistic, urban lifestyle photography, no text, no watermarks.',
    video_cues: [
      'Jackhammers breaking old surface, excavator scooping into dump truck, workers from behind pulling old pipes, dust rising',
      'Workers laying new pipes in trenches, concrete pouring into curb forms, gravel being spread and compacted, all from behind',
      'Paving machine rolling fresh asphalt, steam roller compacting behind, edges being trimmed, smooth black surface emerging',
      'Line painting machine rolling crisp markings, workers from behind bolting signs, benches being placed, lights being wired',
      'Landscapers from behind planting trees, mulch being spread, pavers being laid, flower beds being planted',
      'Camera lowers to street level, people appear walking, cyclist passes, cafe chairs being pulled out, evening lights glow'
    ],
    realism_rules: 'Realistic civil engineering progression. Proper infrastructure installation order. Accurate urban design elements. Standard traffic engineering markings and signage.'
  },

  nature: {
    role: 'landscape architect, horticulturist, cinematic garden visual designer',
    camera_lock: 'same slightly elevated garden perspective with boundary fence visible in background, same warm afternoon sunlight from right, identical fixed viewpoint, same sky and background trees visible, no humans, no tools in motion, photorealistic, sharp garden photography, no text, no numbers, no words, no letters, no watermarks',
    scene_flow: [
      { title: 'Bare Earth', instruction: 'Empty patch of dry compacted soil with scattered weeds and small rocks. No beds, no paths, no structure. Raw unworked ground with uneven surface. Dead grass patches. Boundary fence visible with overgrown vines. Neglected and barren plot.' },
      { title: 'Ground Prepared', instruction: 'Soil tilled and turned to rich dark loam. Cedar frame raised beds constructed and positioned in rows. Gravel paths marked between beds with landscape fabric laid. Drip irrigation lines laid along bed edges. Compost mixed into bed soil. Stepping stones placed along main path.' },
      { title: 'Early Growth', instruction: 'Small seedlings sprouting in neat rows in raised beds. Bark mulch spread thick around plants. Tomato cages and bean trellis supports installed. Drip irrigation emitters visible at plant bases. Plant labels marking varieties. First true leaves visible on young plants.' },
      { title: 'Growing Strong', instruction: 'Plants knee-high with thick healthy foliage. Tomato vines climbing cages with green fruit forming. Bean vines wrapping up trellis. Flower buds visible on companion plants. Herbs bushy and full. Mulch paths clean between beds. Garden taking productive shape.' },
      { title: 'Full Bloom', instruction: 'Lush abundant garden at peak production. Ripe red tomatoes, full lettuce heads, colorful peppers. Flowers in full bloom attracting butterflies and bees. Vines heavy with produce. Garden paths bordered by marigolds and zinnias. Productive and colorful at peak season.' },
      { title: 'Harvest Ready', instruction: 'Fruits hanging heavy ready for picking. Large pumpkins on vine. Tall sunflowers at back. Butterflies resting on flowers. Bird feeder with visitors. Garden at absolute peak abundance. Baskets staged at bed edges ready for harvest. Rich golden late-summer light.' },
      { title: 'Harvest Enjoyed', instruction: null }
    ],
    scene7_template: 'Close ground-level perspective among the garden beds. Hands reaching to pick a ripe tomato and placing it in a woven basket already full of colorful produce. Sunset light filtering through tall plants. Butterflies nearby. Feeling of satisfaction and abundance. Cinematic warmth, photorealistic, lifestyle garden photography, no text, no watermarks.',
    video_cues: [
      'Hands turning soil with shovel, placing cedar bed frames, raking soil smooth, laying landscape fabric, all from behind',
      'Fingers pressing seeds into soil, watering can sprinkling, tiny green sprouts emerging through mulch, time-lapse growth',
      'Time-lapse stems extending upward, leaves unfurling, tendrils wrapping around trellis supports, buds forming on branches',
      'Flowers opening in time-lapse, bees buzzing between blooms, colors spreading across beds, fruits swelling on vines',
      'Garden swaying in breeze, butterflies landing, sunlight dappling through tall plants, abundance visible from every angle',
      'Hands reaching into plants picking produce, placing in basket, satisfied overview of full garden at golden hour'
    ],
    realism_rules: 'Realistic growing progression. Proper plant spacing and support. Accurate seasonal growth stages. Companion planting principles visible.'
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
          { role: "system", content: "You are a world-class visual prompt engineer. Respond in valid JSON only." },
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

    const pack = CATEGORY_PACKS[category] || CATEGORY_PACKS.construction;

    // ═══ BUILD PROMPTS IN CODE — NOT LLM ═══
    // The LLM only customizes the subject description per stage.
    // Camera lock suffix is HARDCODED and appended by us.

    const prompt = `You are a ${pack.role}.

PROJECT: "${title}"  
SUBJECT: ${subject_description || title}
Category: ${category}

For each of the following 7 stages, write a TECHNICAL DESCRIPTION of the subject at that stage. 
Use specific ${category} terminology. Describe ONLY what is physically visible — materials, components, conditions.
Write like a professional inspector documenting each stage.

STAGES:
${pack.scene_flow.map((s, i) => `Stage ${i + 1} "${s.title}": ${s.instruction || 'DIFFERENT ANGLE — completed subject being used and enjoyed by people. Ground-level perspective. Warm emotional lighting.'}`).join('\n')}

SUBJECT TO DESCRIBE: ${subject_description || title}

Return JSON:
{
  "subject_identity": "Exact description of the final completed subject, forty to sixty words",
  "stage_descriptions": [
    "Stage one: fifty to eighty words describing what is physically visible at this stage for the specific subject: ${subject_description || title}",
    "Stage two: fifty to eighty words",
    "Stage three: fifty to eighty words",
    "Stage four: fifty to eighty words",
    "Stage five: fifty to eighty words",
    "Stage six: fifty to eighty words",
    "Stage seven: fifty to eighty words — DIFFERENT: ground level angle, people enjoying the completed result, warm sunset atmosphere"
  ]
}

RULES:
- Write exactly 7 stage_descriptions
- Customize each for the specific subject "${subject_description || title}" — not generic
- Use specific technical terms for ${category}
- No numbers as digits — spell all numbers as words
- Stage seven must describe people using/enjoying the completed subject from a different closer angle
- Do NOT include any camera instructions — those are handled separately
- Keep each description between fifty and eighty words`;

    console.log(`🎬 Flow Pack: ${title} | ${category} | ${orientation}`);

    let result;
    try {
      result = await callLLM(prompt, 0.5);
    } catch (llmErr) {
      console.error(`❌ LLM failed: ${llmErr.message}`);
      return Response.json({ error: `LLM failed: ${llmErr.message}` }, { status: 500 });
    }

    const descriptions = result.stage_descriptions;
    if (!descriptions || descriptions.length < 7) {
      console.error(`❌ Got ${descriptions?.length || 0} descriptions`);
      return Response.json({ error: `Expected 7 descriptions, got ${descriptions?.length || 0}` }, { status: 500 });
    }

    // ═══ ASSEMBLE FINAL PROMPTS — CAMERA LOCK IN CODE ═══
    const cameraLock = pack.camera_lock;
    const scenes = [];

    for (let i = 0; i < 7; i++) {
      const stageInfo = pack.scene_flow[i];
      let imagePrompt;

      if (i < 6) {
        // Scenes 1-6: Subject description + HARDCODED camera lock
        imagePrompt = `${descriptions[i].replace(/^\s*Stage\s+\w+:?\s*/i, '').trim()}, ${cameraLock}`;
      } else {
        // Scene 7: Use the special unlocked template + LLM description
        imagePrompt = pack.scene7_template.replace(
          /^.*?\./,
          `${descriptions[6].replace(/^\s*Stage\s+\w+:?\s*/i, '').trim()}.`
        );
      }

      // Strip any digits the LLM may have snuck in
      imagePrompt = imagePrompt
        .replace(/\b\d+\s*m\b/gi, '')
        .replace(/\b\d+\s*mm\b/gi, '')
        .replace(/\bf[/:]?\s*\d+\.?\d*\b/gi, '')
        .replace(/\b\d+k\b/gi, '')
        .replace(/\b\d+p\b/gi, '')
        .replace(/,\s*,/g, ',')
        .replace(/\s{2,}/g, ' ')
        .trim();

      // Cap at 1200 chars
      if (imagePrompt.length > 1200) {
        imagePrompt = imagePrompt.substring(0, 1150).trim();
        const lastPeriod = imagePrompt.lastIndexOf('.');
        if (lastPeriod > 900) imagePrompt = imagePrompt.substring(0, lastPeriod + 1);
      }

      scenes.push({
        scene_number: i + 1,
        title: `${title} - ${stageInfo.title}`,
        image_prompt: imagePrompt,
        video_transition_prompt: pack.video_cues[i] || '',
        hold_seconds: i === 0 ? 1.5 : i === 5 ? 1.5 : i === 6 ? 2.0 : 0.8,
        is_camera_locked: i < 6,
      });
    }

    // ═══ SAVE TO DATABASE ═══
    try {
      const old = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      for (const s of old) await base44.asServiceRole.entities.Scenes.delete(s.id);
    } catch (_) {}

    let created = 0;
    for (const scene of scenes) {
      try {
        await base44.asServiceRole.entities.Scenes.create({
          project_id,
          scene_number: scene.scene_number,
          narration_text: scene.title,
          image_prompt: scene.image_prompt,
          animation_prompt: scene.video_transition_prompt,
          duration_seconds: scene.hold_seconds,
          status: 'prompts_ready',
        });
        created++;
      } catch (err) {
        console.error(`❌ Scene ${scene.scene_number}: ${err.message}`);
      }
    }

    await base44.asServiceRole.entities.Projects.update(project_id, { status: 'breakdown_complete', current_step: 5 });

    console.log(`✓ Created ${created}/7 scenes (pack pattern)`);
    console.log(`  Camera lock: ${cameraLock.substring(0, 80)}...`);
    console.log(`  S1 prompt: ${scenes[0].image_prompt.substring(0, 100)}...`);

    return Response.json({
      success: true,
      scenes_created: created,
      subject_identity: result.subject_identity,
      camera_lock: cameraLock.substring(0, 100),
    });

  } catch (error) {
    console.error('generateProgressionPrompts error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});