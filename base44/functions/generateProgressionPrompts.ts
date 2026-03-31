import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// FLOW/RE-MAKE — Prompt Pack Generator v3
// ══════════════════════════════════════════════════════════════════
// LLM generates: subject descriptions per stage + environment lock
// Code handles: camera rules, video cues, scene assembly
// ══════════════════════════════════════════════════════════════════

const CATEGORY_PACKS = {
  construction: {
    role: 'professional architect, civil engineer, and construction site inspector',
    camera_rules: 'identical fixed three-quarter aerial perspective, slightly above eye level, ground filling lower third of frame, same lighting direction throughout, no humans, no machinery, no vehicles, no equipment, no workers, photorealistic, sharp architectural photography, no text, no numbers, no words, no letters, no watermarks',
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
      'Completely static locked tripod camera, zero camera movement. High-speed time-lapse, JCB excavator arrives and digs foundation trenches in sequence, workers from behind bend and tie rebar cages inside trenches, concrete mixer truck reverses into position and pours wet concrete into formwork, laborers from behind spread and vibrate concrete with needle vibrator, dust and debris rising in sunlight, natural construction rhythm',
      'Completely static locked tripod camera, zero camera movement. Fast-forward time-lapse, wooden column formwork erected and concrete poured in stages, formwork stripped revealing clean columns, bricklayers from behind lay red brick courses one by one with mortar trowel, scaffold pipes assembled and raised alongside walls, plumb line checked, natural brick-by-brick rhythm',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, upper floor slab shuttering boards laid across beam formwork, rebar mesh tied on top, concrete poured and leveled with screed board, formwork stripped after curing revealing clean slab, second floor brick walls start rising course by course, staircase flight formwork built, natural floor-by-floor progression',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, plasterers on bamboo scaffolds applying rough coat then finish coat with trowel in sweeping motions, UPVC window frames lifted and fitted into openings with wedges and foam, painters from behind rolling exterior paint with long rollers, natural finishing sequence',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, boundary compound wall built with bricks and plastered, iron gate hung on hinges, driveway pavers laid in herringbone pattern by workers on knees from behind, landscapers digging holes and planting shrubs, exterior light fixtures wired and mounted, natural final touches sequence',
      'Camera angle changes to ground level, family of four walks up the paved pathway carrying bags, front door opens, warm interior lights glow through windows, children run to the garden, evening settling in'
    ],
  },

  vehicle: {
    role: 'master automotive restorer, body shop technician, and mechanical inspector',
    camera_rules: 'identical fixed three-quarter front angle, subject centered on same position, same distance from camera, no humans, no visible hands, no tools in motion, photorealistic, sharp mechanical photography, no text, no numbers, no words, no letters, no watermarks',
    scene_flow: [
      { title: 'Rusted Wreck', instruction: 'Heavily oxidized body panels with deep rust pitting and flaking paint. Flat deteriorated tires on corroded rims. Broken windshield with spider cracks. Missing trim pieces and badges. Dented quarter panels and door skins. Overall abandoned neglected condition.' },
      { title: 'Stripped to Frame', instruction: 'All body panels removed and leaning against wall. Bare chassis and subframe exposed. Engine bay empty with engine on stand nearby. Interior completely gutted. Wiring harness removed. Suspension components visible. Raw bare metal frame.' },
      { title: 'Bodywork Complete', instruction: 'All panels refitted with aligned gaps. Body filler smoothed on repaired dents. Spot welds ground flush. Pinch welds cleaned. All panel gaps even and consistent. New replacement panels where needed. Surface ready for primer. No rust visible.' },
      { title: 'Primer Coat', instruction: 'Full body covered in even gray primer coat. Smooth matte gray surface across all panels. Guide coat applied for surface check. No orange peel visible. All body lines straight and crisp. Window openings masked with tape and paper.' },
      { title: 'Paint & Chrome', instruction: 'Deep glossy color coat with mirror-like reflection. Clear coat polished to showroom finish. Chrome bumpers freshly replated and gleaming. New glass installed all around. All trim clips and badges refitted. New rubber seals around doors and windows.' },
      { title: 'Showroom Ready', instruction: 'Engine bay fully detailed with correct components. New interior fully installed with restored upholstery. New tires on polished wheels. All lights working. Dashboard complete with original gauges. Perfect concours condition from every angle.' },
      { title: 'On The Road', instruction: null }
    ],
    scene7_template: 'Low angle tracking shot perspective on open coastal highway. The fully restored vehicle driving with sun reflecting off gleaming paint. Wind in the scene. Beautiful landscape backdrop. Driver visible only as silhouette. Sense of freedom and mechanical perfection. Cinematic, photorealistic, golden hour light, no text, no watermarks.',
    video_cues: [
      'Completely static locked tripod camera, zero camera movement. High-speed time-lapse, mechanic hands from behind using ratchet to unbolt fender bolts one by one, panels carefully lifted off and leaned against wall, engine hoist chain attached to engine block and slowly lifted out of bay, parts organized on shelving, natural systematic disassembly',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, welder from behind running bead along cracked panel seam with MIG welder sparks flying, body hammer tapping high spots on dolly underneath, angle grinder smoothing welded areas sending sparks downward, panel gaps checked with finger, natural bodywork progression',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, spray gun from behind sweeping even primer coats left to right across body panels, light gray primer building up in layers, wet sanding between coats with sanding block and soapy water, guide coat powder dusted and sanded to check low spots, natural primer application',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, paint booth fine color mist building rich deep color coat by coat, clear coat applied in flowing passes, wet sanding between clear coats, polishing machine buffing to mirror finish, chrome bumpers being bolted back on with socket wrench, natural paint finishing',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, restored leather seats lowered into cabin and bolted down, dashboard assembly reconnected wire by wire, new carpet laid and trimmed, engine lowered back into bay on hoist chains and bolted to mounts, wheels torqued on with impact wrench, battery connected, natural reassembly',
      'Camera shifts to tracking angle, key turned in ignition, engine cranks and roars to life with exhaust puff, car rolls forward slowly out of garage bay into bright daylight, gleaming paint catches sunlight'
    ],
  },

  restoration: {
    role: 'master restorer, conservation specialist, and precision craftsman',
    camera_rules: 'identical fixed three-quarter overhead macro perspective, subject centered on same position on workbench, same distance and framing, no humans, no visible hands, no tools in motion, photorealistic, sharp detail photography, no text, no numbers, no words, no letters, no watermarks',
    scene_flow: [
      { title: 'Damaged Original', instruction: 'Heavy surface oxidation and rust pitting across all metal surfaces. Cracked and flaking original finish. Dents and scratches from years of neglect. Grime and dirt buildup in crevices. Missing or broken small components. Overall neglected deteriorated condition on workbench.' },
      { title: 'Stripped & Cleaned', instruction: 'All old finish completely removed by chemical stripping and bead blasting. Bare raw metal surface exposed. Rust completely treated and neutralized. All components disassembled and laid out on clean cloth on workbench. Each part individually cleaned.' },
      { title: 'Repair & Refinement', instruction: 'Dents carefully worked out with precision tools. Replacement parts fitted where originals were beyond repair. Welded seams ground smooth and invisible. Metal surfaces honed and polished to even texture. All moving parts tested for function.' },
      { title: 'Primer & Prep', instruction: 'Even gray primer coat applied across all metal components. Surface inspected under raking light for imperfections. Wet sanded between coats to glass-smooth finish. Masking applied to areas receiving different finishes. Ready for final color.' },
      { title: 'Final Finish Applied', instruction: 'Deep rich color coat with mirror-smooth surface. All chrome or nickel plated parts gleaming. Original markings and engravings crisp and clean. Wooden or grip components refinished with hand-rubbed oil finish. Original factory specification appearance achieved.' },
      { title: 'Museum Grade Complete', instruction: 'Fully reassembled in perfect working order on display cloth. Every component polished and fitted. Light catching all reflective surfaces. Original case or display stand visible. Perfect concours restoration. Pristine museum-quality presentation.' },
      { title: 'In Glory', instruction: null }
    ],
    scene7_template: 'Low angle glamour shot perspective in display setting. The fully restored piece displayed under museum lighting with velvet backdrop. Admiring collector examining from respectful distance. Warm spotlights creating dramatic highlights on polished surfaces. Sense of reverence and craftsmanship triumph. Cinematic, photorealistic, dramatic lighting, no text, no watermarks.',
    video_cues: [
      'Completely static locked tripod camera, zero camera movement. Time-lapse, hands from behind carefully applying chemical paint stripper with brush, old finish bubbling and lifting, wire brush scrubbing surface in circular motions, cotton swabs cleaning intricate crevices, rust converter applied with small brush, natural careful stripping process',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, precision ball-peen hammer tapping out small dents against backing tool, jewelers file smoothing edges and surfaces, micro welding torch making tiny repair beads on cracked areas, fine grinding wheel smoothing repairs flush, natural precision metalwork',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, airbrush spray gun laying thin even primer coats from behind, wet sandpaper on sanding block working surface in long strokes with soapy water, inspection under raking angle light checking imperfections, masking tape applied precisely along edges, natural primer finishing',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, fine spray gun building rich color coat in thin passes, chrome parts dipped into plating bath and emerging gleaming, polishing cloth buffing surfaces to mirror finish with compound, natural color application and plating',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, careful reassembly with precision screwdrivers and wrenches from behind, each component tested for fit and function, final cleaning with microfiber cloth revealing perfect surfaces, placement on display cloth with care, natural meticulous reassembly',
      'Camera pulls back slowly to reveal display setting with warm spotlights, collector approaches and leans in to examine details, subtle appreciative nod, ambient museum atmosphere'
    ],
  },

  renovation: {
    role: 'interior designer, renovation contractor, and building inspector',
    camera_rules: 'identical fixed perspective from room corner, same ceiling height and floor area visible, no humans, no tools in motion, photorealistic, sharp interior photography, no text, no numbers, no words, no letters, no watermarks',
    scene_flow: [
      { title: 'Neglected State', instruction: 'Peeling yellowed wallpaper on all walls. Stained matted carpet with visible wear paths. Dated wood-grain laminate cabinets with broken handles. Old fluorescent ceiling fixture with yellowed plastic cover. Cracked ceramic floor tile near doorway. Water stain on ceiling corner.' },
      { title: 'Demolition Complete', instruction: 'Walls stripped to bare studs with insulation visible between framing. Old carpet removed exposing plywood subfloor. All old cabinets and fixtures removed. Debris swept into pile. Bare electrical boxes visible on studs. Plumbing pipes exposed in wall cavity.' },
      { title: 'New Systems Framed', instruction: 'Fresh lumber stud walls with new electrical conduit and outlet boxes wired. PEX plumbing lines run in walls with stub-outs for fixtures. Insulation batts installed between studs. Subfloor repaired and leveled. Recessed lighting cans installed in ceiling framing.' },
      { title: 'Drywall & Finishes', instruction: 'Smooth finished drywall on all walls with joint compound sanded. Fresh white primer coat applied. New LVP flooring planks installed across room. Crown molding and baseboard trim installed and caulked. Recessed lights visible in finished ceiling. Window trim painted.' },
      { title: 'Fixtures Installed', instruction: 'Kitchen cabinets mounted with quartz countertop installed. Subway tile backsplash grouted. Pendant lights hanging over counter. Under-cabinet LED strip lighting. Stainless steel appliances fitted in openings. Soft-close drawer hardware visible.' },
      { title: 'Fully Styled', instruction: 'Furniture arranged with area rug on floor. Art hung on walls. Indoor plants on shelves and countertop. Decorative items styled on surfaces. Coordinated throw pillows on seating. Books and personal touches visible. Magazine-ready interior design.' },
      { title: 'Lived In', instruction: null }
    ],
    scene7_template: 'Warm morning light streaming through window. Person sitting comfortably reading with coffee mug steaming on side table. Soft natural light creating cozy atmosphere. Plants catching window light. Everything feels naturally inhabited and loved. Cinematic warmth, photorealistic, lifestyle photography, no text, no watermarks.',
    video_cues: [
      'Completely static locked tripod camera, zero camera movement. Time-lapse, workers from behind swinging sledgehammers at drywall breaking into pieces, crowbar prying off old trim boards, old carpet pulled up in strips revealing subfloor, debris swept into pile and shoveled into bags, natural demolition sequence',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, electrician from behind pulling Romex wire through stud holes and stapling, plumber sweating copper joints with torch, insulation batts pressed between studs, new stud walls raised and nailed into top plate, natural rough-in sequence',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, drywall sheets lifted and screwed to studs, joint compound spread with taping knife in smooth passes, dried compound sanded smooth, primer rolled onto walls with roller on extension pole, flooring planks clicked together row by row, natural finishing sequence',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, upper cabinets lifted onto wall brackets and screwed in, countertop slab lowered onto base cabinets, backsplash tiles pressed onto mastic one by one, pendant lights wired and hung, natural fixture installation',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, movers from behind carrying sofa through doorway and positioning, art held against wall at different heights then nailed, plants placed on shelves and windowsill, throw pillows arranged, natural styling sequence',
      'Camera settles to seated perspective, person walks in from doorway, sits in chair by window, opens book, takes sip from steaming mug, morning sunlight shifts across room'
    ],
  },

  space_remodel: {
    role: 'commercial architect, fit-out contractor, and workplace designer',
    camera_rules: 'identical fixed perspective from entry corner showing full depth of space, same ceiling trusses and far wall visible, no humans, no furniture being moved, photorealistic, sharp commercial photography, no text, no numbers, no words, no letters, no watermarks',
    scene_flow: [
      { title: 'Empty Warehouse', instruction: 'Vast empty concrete floor with dust and debris scattered. Exposed steel roof trusses high above. Industrial windows grimy and partly blocked. No partitions or walls. Raw concrete block perimeter walls. Single hanging industrial light. Abandoned vacant feel.' },
      { title: 'Cleared & Prepped', instruction: 'Floor pressure-washed clean showing smooth concrete. Chalk layout lines marked on floor for partitions. Walls cleaned and prepped. Windows cleaned letting light flood in. Temporary construction lighting set up. Material pallets staged along far wall.' },
      { title: 'Partitions Built', instruction: 'Glass partition walls erected forming office spaces and meeting rooms. Reception desk millwork installed in entry area. Stud walls framed for private offices. Drywall applied on solid walls. Cable trays running along ceiling for data and power.' },
      { title: 'Systems Complete', instruction: 'Suspended ceiling grid installed with LED panel lights. HVAC ductwork visible in open ceiling areas. All walls painted in clean white and accent colors. Polished concrete floor sealed and gleaming. Fire sprinkler heads visible. All electrical outlets installed.' },
      { title: 'Furnished', instruction: 'Workstation desks with monitors arranged in open plan area. Ergonomic chairs at each desk. Meeting room with conference table and whiteboard. Kitchenette with countertop, sink, coffee machine. Breakout area with sofa and low tables.' },
      { title: 'Branded & Operational', instruction: 'Company logo mounted on reception wall with dimensional lettering. Indoor plants throughout space in modern planters. Art and motivational pieces on walls. Acoustic panels in strategic locations. All accessories and stationery in place. Fully operational office.' },
      { title: 'Buzzing With Life', instruction: null }
    ],
    scene7_template: 'Ground level perspective inside the bustling office. Team members at desks working on screens. Meeting in progress behind glass wall. Someone at the coffee bar. Natural conversation energy. Plants catching window light. Productive creative atmosphere. Cinematic, photorealistic, commercial lifestyle photography, no text, no watermarks.',
    video_cues: [
      'Completely static locked tripod camera, zero camera movement. Time-lapse, workers from behind pushing brooms across concrete floor, pressure washer blasting grime off walls, chalk snap lines marked on floor for layout, material pallets dollied in and staged, natural prep sequence',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, aluminum tracks screwed to floor and ceiling, glass partition panels lifted into tracks and sealed, stud walls framed with drill and screws, drywall sheets carried and screwed on, cable trays bolted to ceiling joists, natural partition build',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, electricians from behind on step ladders installing ceiling light panels, HVAC duct sections connected with sheet metal screws, painters rolling walls with rollers on poles, floor sealer applied with squeegee mop, natural systems installation',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, flat-pack desk boxes opened and assembled with Allen keys, chairs unwrapped from plastic, monitors placed on desk arms and connected, kitchen countertop installed and sink connected, natural furniture setup',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, dimensional logo letters held against reception wall and drilled in, indoor plants placed in planters and arranged, art frames hung with level, acoustic panels adhesived to walls, cable management clips tidied, natural branding sequence',
      'Camera lowers to desk level perspective, people stream through entrance one by one, laptops opened, first meeting starts behind glass wall, coffee machine whirs, productive energy fills the space'
    ],
  },

  street_urban: {
    role: 'civil engineer, urban planner, and infrastructure inspector',
    camera_rules: 'identical fixed elevated viewpoint looking down the street, same distant vanishing point and sky proportion, no humans, no vehicles moving, photorealistic, sharp urban photography, no text, no numbers, no words, no letters, no watermarks',
    scene_flow: [
      { title: 'Deteriorated Street', instruction: 'Cracked and potholed bituminous road surface with visible sub-base through damaged areas. Faded barely visible lane markings. Overgrown weeds pushing through gutter cracks. Leaning utility pole with tangled wires. Broken curb stones. Blocked storm drain inlets. General urban neglect.' },
      { title: 'Torn Up & Excavated', instruction: 'Old road surface completely removed exposing compacted sub-base. Utility trenches dug along both sides revealing old pipes. Excavated earth piled alongside trenches. Old curb stones removed. Temporary barriers marking work zone. Raw exposed ground.' },
      { title: 'New Infrastructure', instruction: 'New PVC and concrete pipes laid in trenches with gravel bedding. New manhole covers set at correct grade. Concrete curb and gutter forms poured on both sides. New utility conduits laid. Compacted granular sub-base leveled and rolled. Storm drain inlets connected.' },
      { title: 'Fresh Paved', instruction: 'Smooth fresh black asphalt surface paved across full width. New concrete curbs and gutters bright white. Storm drain grates flush with surface. No markings yet applied. Clean sharp edges where asphalt meets curb. Road surface pristine and even.' },
      { title: 'Marked & Furnished', instruction: 'Crisp white lane markings and crosswalk stripes painted. Road signs bolted to new galvanized posts. LED street lights installed on new poles. Benches and trash receptacles placed on sidewalk. Bike lane separator bollards installed. Tactile paving at crossings.' },
      { title: 'Landscaped & Complete', instruction: 'Street trees planted in new tree grates along sidewalk. Planter beds with ornamental grasses and flowers. Permeable paver sidewalk sections installed. Bike lane painted green. All lighting working. Complete and pristine streetscape.' },
      { title: 'Alive With Activity', instruction: null }
    ],
    scene7_template: 'Street level perspective at golden hour. Pedestrians walking on new sidewalk. Cyclist in bike lane. Outdoor cafe tables occupied with people having drinks. Street lights just turning on. Trees casting long shadows. Vibrant urban life on a beautifully renewed street. Cinematic warmth, photorealistic, no text, no watermarks.',
    video_cues: [
      'Completely static locked tripod camera, zero camera movement. Time-lapse, pneumatic jackhammer from behind breaking old asphalt in chunks, excavator bucket scooping broken material into dump truck, workers from behind shoveling trench edges clean, old pipes exposed and removed, natural demolition sequence',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, new PVC pipes lowered into trench by workers from behind, gravel bedding poured and compacted around pipes, concrete manhole rings stacked and mortared, curb forms built with boards and stakes, concrete poured into forms, natural infrastructure installation',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, paver machine from behind laying hot asphalt in even strip, steel drum roller compacting fresh surface making it smooth, edges trimmed with hand tools, storm drain grates set flush with surface level, natural paving sequence',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, line marking machine from behind painting crisp white stripes, road signs bolted to galvanized posts with impact wrench, street light poles set in concrete bases, benches and bollards anchored to sidewalk, natural street furniture installation',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, landscapers from behind digging holes with post-hole digger, trees root-balled and lowered in, soil backfilled and mulched, flower beds planted in rows, permeable pavers laid in sidewalk sections, natural landscaping sequence',
      'Camera rises to elevated golden hour view, pedestrians appear walking on new sidewalk, cyclist passes in bike lane, cafe chairs pulled out and occupied, street lights flicker on as evening begins'
    ],
  },

  nature: {
    role: 'landscape architect, horticulturist, and garden designer',
    camera_rules: 'identical fixed slightly elevated garden perspective, same sky and background visible, no humans, no tools in motion, photorealistic, sharp garden photography, no text, no numbers, no words, no letters, no watermarks',
    scene_flow: [
      { title: 'Bare Earth', instruction: 'Empty patch of dry compacted soil with scattered weeds and small rocks. No beds, no paths, no structure. Raw unworked ground with uneven surface. Dead grass patches. Neglected and barren plot.' },
      { title: 'Ground Prepared', instruction: 'Soil tilled and turned to rich dark loam. Cedar frame raised beds constructed and positioned in rows. Gravel paths marked between beds with landscape fabric laid. Drip irrigation lines laid along bed edges. Compost mixed into bed soil. Stepping stones placed.' },
      { title: 'Early Growth', instruction: 'Small seedlings sprouting in neat rows in raised beds. Bark mulch spread thick around plants. Tomato cages and bean trellis supports installed. Drip irrigation emitters visible at plant bases. Plant labels marking varieties. First true leaves visible.' },
      { title: 'Growing Strong', instruction: 'Plants knee-high with thick healthy foliage. Tomato vines climbing cages with green fruit forming. Bean vines wrapping up trellis. Flower buds visible on companion plants. Herbs bushy and full. Mulch paths clean between beds.' },
      { title: 'Full Bloom', instruction: 'Lush abundant garden at peak production. Ripe red tomatoes, full lettuce heads, colorful peppers. Flowers in full bloom attracting butterflies and bees. Vines heavy with produce. Garden paths bordered by marigolds and zinnias.' },
      { title: 'Harvest Ready', instruction: 'Fruits hanging heavy ready for picking. Large pumpkins on vine. Tall sunflowers at back. Butterflies resting on flowers. Bird feeder with visitors. Garden at absolute peak abundance. Baskets staged at bed edges.' },
      { title: 'Harvest Enjoyed', instruction: null }
    ],
    scene7_template: 'Close ground-level perspective among the garden beds. Hands reaching to pick a ripe tomato and placing it in a woven basket already full of colorful produce. Sunset light filtering through tall plants. Butterflies nearby. Satisfaction and abundance. Cinematic warmth, photorealistic, no text, no watermarks.',
    video_cues: [
      'Completely static locked tripod camera, zero camera movement. Time-lapse, hands from behind driving shovel into soil and turning it over, cedar boards measured and screwed into raised bed frames, landscape fabric rolled out and pinned, paths raked smooth with gravel spread, natural garden preparation',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, fingers from behind pressing seeds into furrows in dark soil, watering can sprinkling gently, tiny green cotyledon sprouts pushing up through soil surface days later, bark mulch spread around sprouts by hand, natural planting and germination',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, seedlings growing taller day by day, stems thickening, leaves multiplying and broadening, tendrils reaching out and wrapping around trellis wire, tomato cages placed over growing plants, natural vegetative growth',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, flower buds swelling then opening petal by petal, bees arriving and buzzing between blooms, green fruits on vines slowly changing color as they ripen, garden filling with color day by day, natural blooming and ripening',
      'Completely static locked tripod camera, zero camera movement. Time-lapse, garden swaying gently in warm breeze, butterflies floating between flowers and landing on petals, heavy fruits pulling branches down, sunlight shifting across garden through the day, natural peak abundance',
      'Camera lowers to ground level among the beds, hands from behind reaching for ripe red tomato and twisting it off vine, placing in woven basket already full of colorful peppers and herbs, golden sunset light filtering through tall plants'
    ],
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
    const isPortrait = orientation === 'portrait';

    // ═══ LLM generates ONLY: environment + subject descriptions per stage ═══
    const prompt = `You are a ${pack.role}.

PROJECT: "${title}"
SUBJECT: ${subject_description || title}
Category: ${category}
Location/Setting: ${subject_description || title}

TASK 1 — ENVIRONMENT LOCK:
Describe the SPECIFIC BACKGROUND AND SETTING for this project based on the subject description above.
What is visible BEHIND and AROUND the subject? What is the ground surface? What is in the distance?
This must match what the user described — if they say "beach front" describe ocean, sand, waves, coastal vegetation.
If they say "suburban India" describe neighboring houses, boundary walls, water tanks on roofs.
If they say "workshop" describe tool pegboard, concrete floor, overhead lights.
Write ONLY the environment — no camera angles, no photography terms. Thirty to fifty words.

TASK 2 — STAGE DESCRIPTIONS:
For each of the 7 stages below, write what is PHYSICALLY VISIBLE at that stage.
Use specific ${category} technical terminology. Describe materials, components, conditions.
Write like a ${pack.role} documenting an inspection. Fifty to eighty words each.

STAGES:
${pack.scene_flow.map((s, i) => `Stage ${i + 1} "${s.title}": ${s.instruction || 'DIFFERENT ANGLE — completed subject being used and enjoyed by people. Ground-level perspective. Warm emotional lighting.'}`).join('\n')}

SPECIFIC SUBJECT: ${subject_description || title}

Return JSON:
{
  "subject_identity": "Exact description of the final completed subject, forty to sixty words",
  "environment_lock": "The specific background and setting environment described above, thirty to fifty words, matching the user location description exactly",
  "stage_descriptions": [
    "fifty to eighty words for stage one customized for ${subject_description || title}",
    "fifty to eighty words for stage two",
    "fifty to eighty words for stage three",
    "fifty to eighty words for stage four",
    "fifty to eighty words for stage five",
    "fifty to eighty words for stage six",
    "fifty to eighty words for stage seven — DIFFERENT: ground level, people enjoying result, warm sunset"
  ]
}

RULES:
- Exactly 7 stage_descriptions in the array
- Customize every description for "${subject_description || title}" specifically — not generic
- Use specific technical terms for ${category}
- Spell out all numbers as words — no digits
- Stage seven: people using/enjoying the result, different closer angle, warm atmosphere
- Do NOT include camera angles or photography terms — those are handled separately
- environment_lock MUST match the location in "${subject_description || title}"`;

    console.log(`🎬 Flow Pack v3: ${title} | ${category} | ${orientation}`);
    console.log(`📋 Subject: ${subject_description || 'none'}`);

    let result;
    try {
      result = await callLLM(prompt, 0.5);
      console.log(`✓ LLM returned: ${JSON.stringify(result).substring(0, 200)}...`);
    } catch (llmErr) {
      console.error(`❌ LLM failed: ${llmErr.message}`);
      return Response.json({ error: `LLM failed: ${llmErr.message}` }, { status: 500 });
    }

    const descriptions = result.stage_descriptions;
    if (!descriptions || descriptions.length < 7) {
      console.error(`❌ Got ${descriptions?.length || 0} descriptions`);
      return Response.json({ error: `Expected 7 descriptions, got ${descriptions?.length || 0}` }, { status: 500 });
    }

    // ═══ ASSEMBLE: LLM environment + CODE camera rules ═══
    const environment = (result.environment_lock || '').replace(/^\s*Environment:?\s*/i, '').trim();
    const cameraRules = pack.camera_rules;
    const fullCameraLock = environment
      ? `${environment}, ${cameraRules}`
      : cameraRules;

    console.log(`🌍 Environment: ${environment.substring(0, 80)}...`);
    console.log(`📷 Camera rules: ${cameraRules.substring(0, 80)}...`);

    const scenes = [];

    for (let i = 0; i < 7; i++) {
      const stageInfo = pack.scene_flow[i];
      const rawDesc = descriptions[i].replace(/^\s*Stage\s+\w+:?\s*/i, '').trim();
      let imagePrompt;

      if (i < 6) {
        // Scenes 1-6: LLM subject description + LLM environment + CODE camera rules
        imagePrompt = `${rawDesc}, ${fullCameraLock}`;
      } else {
        // Scene 7: LLM description + hardcoded scene7 template
        imagePrompt = `${rawDesc}. ${pack.scene7_template}`;
      }

      // Strip any digits the LLM may have snuck in
      imagePrompt = imagePrompt
        .replace(/\b\d+\s*m\b/gi, '')
        .replace(/\b\d+\s*mm\b/gi, '')
        .replace(/\bf[/:]?\s*\d+\.?\d*\b/gi, '')
        .replace(/\b\d+k\b/gi, '')
        .replace(/\b\d+p\b/gi, '')
        .replace(/\b\d+\s*meters?\b/gi, '')
        .replace(/\b\d+\s*degrees?\b/gi, '')
        .replace(/,\s*,/g, ',')
        .replace(/\s{2,}/g, ' ')
        .trim();

      // Cap at 1200 chars with smart sentence cut
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
      console.log(`🧹 Deleting ${old.length} old scenes...`);
      for (const s of old) await base44.asServiceRole.entities.Scenes.delete(s.id);
    } catch (delErr) {
      console.warn(`⚠ Delete failed: ${delErr.message}`);
    }

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

    try {
      await base44.asServiceRole.entities.Projects.update(project_id, { status: 'breakdown_complete', current_step: 5 });
    } catch (updErr) {
      console.warn(`⚠ Project update failed: ${updErr.message}`);
    }

    console.log(`✓ Created ${created}/7 scenes (pack v3)`);
    console.log(`  S1: ${scenes[0]?.image_prompt?.substring(0, 120)}...`);
    console.log(`  S7: ${scenes[6]?.image_prompt?.substring(0, 120)}...`);

    return Response.json({
      success: true,
      scenes_created: created,
      subject_identity: result.subject_identity,
      environment: environment.substring(0, 100),
    });

  } catch (error) {
    console.error('generateProgressionPrompts error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});