import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// newThumbnailConcept — Standalone thumbnail-only function
//
// Completely independent from the main production flow.
// No dependency on Scripts, Topics, BrandIdentities, or Projects.
//
// Frontend sends:  { video_title, summary? }
// This function:   Calls Gemini → saves 10 ThumbnailConcepts → returns concept_ids
// Frontend then:   Calls generateThumbnailImage per concept_id (unchanged)
//
// CTR Target: 8-12% | Template DNA Vault: 26 templates
// ══════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────
// TEMPLATE DNA VAULT — 26 templates × 7 niches
// ──────────────────────────────────────────────────────────────────
const TEMPLATE_DNA = {
  shock_face:         { name:"The Shock Face",              niches:["finance","business","make_money"],          ctr:"8-12%", power:5, psychology:"Mirror neurons — viewer FEELS shock before processing text",                                    face_emotion:"EXTREME SHOCK: eyes blown wide open, eyebrows at highest arch, jaw dropped O-shape, both hands on cheeks, forehead creased.",                                                                    text_formula:"MAX 4 WORDS ALL CAPS. SHOCKING NUMBER or OUTCOME. e.g. '$130K STILL BROKE'",       color:"DARK bg + ELECTRIC YELLOW or WHITE text + RED accent",           signals:["money","income","broke","budget","debt","invest","wealth","savings"] },
  income_reveal:      { name:"The Income Reveal",           niches:["finance","make_money","side_hustle"],       ctr:"7-11%", power:5, psychology:"Aspiration + Social Proof",                                                                     face_emotion:"PROUD CONFIDENCE: chest out, chin raised, calm knowing smile. Genuine pride.",                                                                                                                  text_formula:"SPECIFIC ODD DOLLAR AMOUNT + TIME. e.g. '$47,382 IN 6 MONTHS'",                    color:"DARK bg + NEON GREEN dollar amount + GOLD accent",               signals:["income","made","earned","passive","per month","profit","revenue"] },
  warning_alert:      { name:"The Warning/Alert",           niches:["finance","health","crypto"],                ctr:"7-10%", power:4, psychology:"Loss aversion — fear of losing beats desire to gain",                                           face_emotion:"URGENT WARNING: intense stare, eyebrows furrowed, jaw set, pointing finger at viewer.",                                                                                                         text_formula:"STOP [THIS] or WARNING: [OUTCOME]. MAX 4 WORDS.",                                   color:"DEEP RED + WHITE/YELLOW text + thick black outline",              signals:["stop","warning","danger","losing","mistake","avoid","wrong","trap"] },
  secret_hidden:      { name:"The Secret/Hidden Truth",     niches:["finance","health","business"],              ctr:"7-10%", power:4, psychology:"Information gap + exclusivity",                                                                  face_emotion:"CONSPIRATORIAL: finger to lips, sideways glance, knowing half-smile.",                                                                                                                          text_formula:"HIDDEN [TRUTH]. MAX 4 WORDS. e.g. 'HIDDEN BANK SECRET'",                           color:"NEAR BLACK + GOLD text + single dramatic spotlight",              signals:["secret","hidden","truth","they","banks","nobody tells"] },
  breaking_news:      { name:"The Breaking News",           niches:["finance","crypto","stocks"],                ctr:"7-11%", power:5, psychology:"FOMO + urgency",                                                                                 face_emotion:"URGENT PRESENTER: pointing at chart, leaning toward camera.",                                                                                                                                   text_formula:"BREAKING: [WHAT CHANGED]. MAX 5 WORDS.",                                            color:"NEWS RED banner + WHITE text + DARK bg + YELLOW accent",          signals:["just","now","breaking","announced","changed","crashed","surged","today"] },
  before_after:       { name:"The Before/After Split",      niches:["finance","fitness","transformation"],       ctr:"6-10%", power:4, psychology:"Transformation desire",                                                                          face_emotion:"LEFT: defeated/stressed | RIGHT: confident/liberated genuine relief smile.",                                                                                                                    text_formula:"STATE_A → STATE_B. e.g. 'BROKE → $200K'",                                           color:"LEFT: dark cold blues | RIGHT: warm bright gold/green | CENTER: sharp divider", signals:["before","after","transformation","went from","debt free","financial freedom"] },
  numbered_list:      { name:"The Numbered List Bomb",      niches:["finance","productivity"],                   ctr:"5-9%",  power:3, psychology:"Listicle brain — feels completable",                                                             face_emotion:"KNOWLEDGEABLE AUTHORITY: head tilt, confident half-smile, one finger raised.",                                                                                                                  text_formula:"ODD NUMBER + WHAT THEY WANT. e.g. '7 HABITS OF RICH'",                             color:"Bold bg + MASSIVE number in accent color + white text",           signals:["habits","ways","things","tips","steps","rules","secrets"] },
  identity_challenge: { name:"The Identity Challenge",      niches:["finance","self_help","mindset"],            ctr:"6-8%",  power:3, psychology:"Ego threat — click to defend identity",                                                          face_emotion:"DIRECT ACCUSATORY: eye contact + raised eyebrow + pointing finger + half-smirk.",                                                                                                               text_formula:"IF YOU [DO THIS] = [IDENTITY]. MAX 5 WORDS. e.g. 'THIS HABIT = BROKE'",            color:"DARK PURPLE/blue + WHITE accent text",                            signals:["if you","you're","still doing","poor mindset"] },
  finance_versus:     { name:"The Finance Versus",          niches:["finance","real_estate","investing"],        ctr:"6-9%",  power:4, psychology:"Binary thinking + tribal loyalty — hardwired to pick a side",                                   face_emotion:"DECISIVE AUTHORITY: arms crossed, confident half-smile of someone who tested both sides.",                                                                                                      text_formula:"[OPTION A] VS [OPTION B]. e.g. 'RENTING VS BUYING'. MAX 5 WORDS.",                 color:"SPLIT — LEFT deep blue + RIGHT warm amber. VS center WHITE/YELLOW.", signals:["vs","versus","renting","buying","stocks","401k","roth","crypto","real estate"] },
  lifestyle_proof:    { name:"The Lifestyle Proof",         niches:["finance","make_money","business"],          ctr:"6-9%",  power:4, psychology:"Social proof + aspiration — showing the RESULT creates credibility",                            face_emotion:"CASUAL ABUNDANT CONFIDENCE: hand casually touching luxury item, other in pocket. NOT flexing.",                                                                                                  text_formula:"LUXURY ITEM + INCOME SOURCE. e.g. 'MY LAMBO PAID BY YOUTUBE'. MAX 5 WORDS.",       color:"RICH dark bg + GOLD accent text + luxury item's natural glamour",  signals:["lamborghini","lambo","ferrari","mansion","rolex","passive income","bought","afford"] },
  finance_audit:      { name:"The Finance Audit Reaction",  niches:["finance","personal_finance","budgeting"],   ctr:"6-9%",  power:4, psychology:"Vicarious learning — watching someone else's disaster feels safe and educational",              face_emotion:"AUDITOR'S HORROR-DISBELIEF: eyes wide squinting, head tilted, one hand to temple, grimace of pained disbelief. The Caleb Hammer face.",                                                          text_formula:"FINANCIAL DISASTER NUMBER + WHO. e.g. '$200K DEBT AT 23'. MAX 5 WORDS.",           color:"SPLIT — auditor face left (dark bg) + financial data right (red numbers)", signals:["budget","audit","debt","broke","savings","income","expenses","net worth","spending"] },
  cliffhanger:        { name:"The Cliffhanger Frame",       niches:["storytelling","documentary","drama"],       ctr:"7-11%", power:5, psychology:"Zeigarnik effect — open loop brain demands closure",                                            face_emotion:"TENSE ANTICIPATION: eyes slightly wide looking OFF-FRAME, jaw tensed, one hand mid-gesture, frozen before everything changes.",                                                                  text_formula:"INCOMPLETE REVELATION with ellipsis. e.g. 'SHE LEFT EVERYTHING...'",               color:"WARM AMBER to DEEP ORANGE gradient + heavy sepia + dark vignette",  signals:["story","happened","she","he","they","journey","night","discovered"] },
  true_account:       { name:"The True Account Banner",     niches:["storytelling","documentary","true_crime"],  ctr:"6-9%",  power:3, psychology:"Reality anchoring — TRUE STORY = forbidden knowledge",                                          face_emotion:"DOCUMENTARY SUBJECT: calm haunted expression, natural look, slightly off-camera gaze.",                                                                                                         text_formula:"TRUE STORY: [WHAT HAPPENED]. TRUE STORY label is massive trust signal.",            color:"DESATURATED muted tones + yellowed newspaper aesthetic",           signals:["true","real","based","actual","documented","happened","case"] },
  cold_case_file:     { name:"The Cold Case File",          niches:["true_crime","documentary","mystery"],       ctr:"8-12%", power:5, psychology:"Justice obsession + morbid curiosity — hardwired to solve mysteries",                           face_emotion:"HAUNTED: troubled expression, dark circles, looking down or away, vulnerability mixed with fear.",                                                                                               text_formula:"THE [CRIME] THAT [UNSOLVED OUTCOME]. e.g. 'THE MURDER NOBODY SOLVED'",             color:"NEAR BLACK + BLOOD RED accent + YELLOW evidence highlight",        signals:["murder","crime","killer","suspect","case","investigation","disappeared","unsolved"] },
  suspect_reveal:     { name:"The Suspect Reveal",          niches:["true_crime","mystery","thriller"],          ctr:"7-10%", power:4, psychology:"Accusation trigger — wired to stare at the accused",                                            face_emotion:"HALF-SHADOWED AMBIGUITY: exactly half face in deep shadow, one eye visible with penetrating gaze.",                                                                                             text_formula:"ACCUSATORY WITHOUT CONFIRMING. e.g. 'SHE SMILED AT THE FUNERAL'",                  color:"PURE BLACK + SINGLE harsh light + POLICE YELLOW tape element",    signals:["suspect","killer","guilty","innocent","confession","who did it"] },
  heartbreak_headline:{ name:"The Heartbreak Headline",     niches:["relationships","love","dating"],            ctr:"7-10%", power:5, psychology:"Emotional contagion — pain is most universally shared emotion",                                  face_emotion:"RAW EMOTIONAL PAIN: eyes red-rimmed, lower lip trembling, chin dimpled, shoulders collapsed. Zero performance.",                                                                                text_formula:"UNRESOLVED PAINFUL MOMENT. e.g. 'HE LEFT WITHOUT A WORD'",                         color:"DESATURATED dark blues + single warm light on face + heavy vignette", signals:["love","relationship","broke up","cheated","left","heartbreak","marriage","toxic","ex"] },
  relationship_red_flag:{ name:"The Relationship Red Flag", niches:["relationships","dating","self_help"],       ctr:"6-9%",  power:4, psychology:"Self-protection instinct — click to confirm or deny own situation",                             face_emotion:"PROTECTIVE WARNING: raised eyebrow skepticism + caring urgency. Trusted friend saying 'you need to hear this'.",                                                                                 text_formula:"DIRECT CHALLENGE. e.g. 'IF HE DOES THIS — RUN'",                                   color:"RED warning dominant + WHITE thick-outline text",                  signals:["red flag","toxic","narcissist","signs","if he","if she","gaslighting"] },
  destination_wow:    { name:"The Destination Wow Shot",    niches:["travel","vacation","lifestyle"],            ctr:"6-10%", power:5, psychology:"Escapism pull — stunning scenery triggers immediate desire to be there",                         face_emotion:"AWESTRUCK JOY: jaw slightly dropped, eyes wide with genuine wonder, arms spread embracing view.",                                                                                               text_formula:"[PLACE] FOR $AMOUNT. e.g. 'MALDIVES FOR $800'",                                    color:"ULTRA-VIVID SATURATED landscape + golden hour warm light",         signals:["travel","trip","vacation","country","beach","explore","destination","island"] },
  hidden_gem:         { name:"The Hidden Gem Reveal",       niches:["travel","adventure","lifestyle"],           ctr:"7-9%",  power:4, psychology:"Exclusivity + FOMO — nobody talks about this",                                                  face_emotion:"DISCOVERER'S EXCITEMENT: genuine surprise-joy, pointing at discovery, breathless excitement.",                                                                                                  text_formula:"EXCLUSIVITY + PLACE. e.g. 'HIDDEN BEACH NOBODY KNOWS'",                            color:"LUSH natural greens + crystal blues + golden discovery light",     signals:["hidden","secret","nobody knows","undiscovered","gem","paradise","underrated"] },
  ai_takeover:        { name:"The AI Takeover Frame",       niches:["ai","tech","business","career"],            ctr:"7-11%", power:5, psychology:"Existential fear + curiosity — AI threatens identity, job, and future",                         face_emotion:"ALARMED URGENCY: wide eyes of someone who saw the threat, raised stop hand at camera, forward lean.",                                                                                           text_formula:"AI THREAT + PERSONAL IMPACT. e.g. 'AI JUST REPLACED 10,000 JOBS'",                 color:"ELECTRIC NEON BLUE on NEAR BLACK + PURPLE circuit aesthetic",      signals:["AI","ChatGPT","automation","replaced","GPT","Gemini","artificial intelligence","robot"] },
  cheat_code_reveal:  { name:"The Cheat Code Reveal",       niches:["ai","tech","productivity","make_money"],    ctr:"6-10%", power:4, psychology:"Shortcut psychology + unfair advantage desire",                                                  face_emotion:"CONSPIRATORIAL: leaning forward, one eyebrow raised, half-smile of giving forbidden access.",                                                                                                   text_formula:"TIME COMPRESSION. e.g. '10 HRS → 5 MINS'",                                         color:"DARK PURPLE/black + ELECTRIC CYAN or GREEN + code/terminal aesthetic", signals:["tool","hack","prompt","automation","workflow","faster","10x","AI tool","productivity"] },
  tech_comparison:    { name:"The Tech Comparison Bomb",    niches:["ai","tech","software","reviews"],           ctr:"6-9%",  power:4, psychology:"Tribal loyalty — tech people are fanatically loyal to their tools",                             face_emotion:"DECISIVE AUTHORITY: confident direct gaze, hands on desk, 'I've tested both' energy.",                                                                                                          text_formula:"[TOOL A] VS [TOOL B]. Bold VS center.",                                             color:"SPLIT with tool colors + bold VS center white",                   signals:["vs","versus","compared","better","tested","which","review","comparison"] },
  plot_twist_tease:   { name:"The Plot Twist Tease",        niches:["movies","tv","entertainment","recap"],      ctr:"8-12%", power:5, psychology:"Spoiler magnetism — seen it: validation. Not seen: secret knowledge",                           face_emotion:"MIND-BLOWN MAXIMUM: both hands on head/face, eyes ABSOLUTE MAX width, mouth O-shape, leaning back. NOT posed.",                                                                                 text_formula:"UNREVEALED MYSTERY. e.g. 'THE TWIST YOU MISSED'",                                   color:"CINEMATIC TEAL AND ORANGE + FILM GRAIN + GOLD highlight text",    signals:["movie","film","show","series","ending","twist","explained","theory","review","recap"] },
  deep_lore_dive:     { name:"The Deep Lore Dive",          niches:["movies","gaming","anime","entertainment"],  ctr:"6-9%",  power:4, psychology:"Superfan identity — true fans NEED hidden knowledge",                                           face_emotion:"DETECTIVE REVEAL: magnifying glass gesture, intensely focused, eureka single raised finger.",                                                                                                   text_formula:"HIDDEN KNOWLEDGE. e.g. 'THE CLUE NOBODY NOTICED'",                                  color:"DARK mysterious tones + spotlight on key element + annotation arrows", signals:["lore","hidden","detail","nobody noticed","theory","easter egg","secret","symbolism"] },
  reaction_recap:     { name:"The Reaction Recap",          niches:["movies","entertainment","reaction","anime"], ctr:"7-10%", power:4, psychology:"Shared experience — reliving emotional peaks through someone else",                             face_emotion:"COMPLETELY AUTHENTIC UNFILTERED REACTION: real tears, genuine open-mouth laugh, OR hand covering mouth in gasp. ZERO posing.",                                                                   text_formula:"EMOTIONAL REACTION + SUBJECT. e.g. 'I CRIED 3 TIMES'",                             color:"SPLIT: warm natural face left + content-matched grade right",      signals:["reaction","reacting","watched","first time","cried","shocked","first watch"] },
  shorts_hook_frame:  { name:"The Shorts Hook Frame",       niches:["all_niches"],                               ctr:"scroll-stop", power:5, psychology:"Pattern interrupt — stop scroll in under 0.3 seconds",                                    face_emotion:"EXTREME VERSION of video's core emotion amplified 200%. Fills 80%+ of vertical 9:16 frame.",                                                                                                    text_formula:"1-2 LINES MAX. POV hook / shocking statement. ALL CAPS MASSIVE.",                   color:"SINGLE BOLD background + WHITE or NEON text top 30%",             signals:["shorts","short","#shorts","pov","quick"] },
};

// ──────────────────────────────────────────────────────────────────
// Template selector — picks the 3 best templates for the given title
// ──────────────────────────────────────────────────────────────────
function selectTemplates(title = "", summary = "") {
  const text = (title + " " + summary).toLowerCase();

  const nicheScores = {
    finance:       ["money","income","budget","debt","invest","broke","salary","wealth","savings","financial","rich","poor","lambo","real estate","renting","buying","audit","vs","passive","401k","roth","dividend","etf","index fund"],
    true_crime:    ["murder","crime","killer","suspect","case","investigation","disappeared","evidence","unsolved","confession","dead","bodies","missing"],
    storytelling:  ["story","happened","she","he","they","journey","night","everything changed","discovered","true story"],
    relationships: ["love","relationship","broke up","cheated","partner","marriage","heartbreak","toxic","dating","ex","affair"],
    travel:        ["travel","trip","vacation","country","flight","hotel","beach","explore","destination","island","resort","paradise"],
    ai:            ["ai","chatgpt","claude","automation","replaced","gpt","gemini","artificial intelligence","robot","tool","prompt"],
    movies:        ["movie","film","show","series","scene","ending","twist","explained","theory","review","recap","cinema"],
    make_money:    ["income","side hustle","passive","earn online","make money","revenue"],
    nollywood:     ["nollywood","nigerian","naija","yoruba","igbo","mama","oga","sapa"],
  };

  const scores = {};
  for (const [niche, kws] of Object.entries(nicheScores)) {
    scores[niche] = kws.filter(kw => text.includes(kw)).length;
  }
  const topNiche = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] || "finance";

  const ranked = Object.values(TEMPLATE_DNA)
    .filter(t => t.id !== "shorts_hook_frame")
    .map(t => {
      let score = 0;
      if (t.niches.some(n => n === topNiche || n.includes(topNiche.split("_")[0]))) score += 40;
      score += (t.signals || []).filter(kw => text.includes(kw.toLowerCase())).length * 8;
      score += (t.power || 3) * 5;
      return { ...t, _score: score };
    })
    .sort((a, b) => b._score - a._score);

  return ranked.slice(0, 3);
}

// ──────────────────────────────────────────────────────────────────
// JSON repair helper
// ──────────────────────────────────────────────────────────────────
function repairJSON(str) {
  return str
    .replace(/[\x00-\x1F\x7F]/g, c => (c === '\n' || c === '\r' || c === '\t' ? c : ' '))
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(["\w\d])\s*\n\s*"/g, '$1, "');
}

// ──────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    // ── Auth ──────────────────────────────────────────────────────
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // ── Input ─────────────────────────────────────────────────────
    const body = await req.json();
    const { video_title, summary = '' } = body;

    if (!video_title?.trim()) {
      return Response.json({ error: 'video_title is required' }, { status: 400 });
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return Response.json({ error: 'GEMINI_API_KEY not configured in environment variables' }, { status: 500 });
    }

    // ── Select templates ─────────────────────────────────────────
    const templates = selectTemplates(video_title, summary);
    const primary = templates[0];

    console.log('══════════════════════════════════════════════');
    console.log('newThumbnailConcept — Standalone Thumbnail Gen');
    console.log(`Title: ${video_title}`);
    console.log(`Templates: ${templates.map(t => t.name).join(' | ')}`);
    console.log('══════════════════════════════════════════════');

    // ── Build Gemini prompt ───────────────────────────────────────
    const templateBlock = templates.map((t, i) => `
▶ TEMPLATE ${i + 1} ${i === 0 ? '(PRIMARY — use for concepts 1 & 2)' : `(ALTERNATE — use for concept ${i + 2})`}
  Name: ${t.name} | CTR: ${t.ctr} | Power: ${'★'.repeat(t.power || 3)}
  Psychology: ${t.psychology}
  Face/Emotion: ${t.face_emotion}
  Text Formula: ${t.text_formula}
  Color System: ${t.color}
`).join('\n');

    const prompt = `You are the world's #1 YouTube thumbnail designer. Generate 10 high-CTR thumbnail concepts for this video.

VIDEO TITLE: "${video_title}"
${summary ? `VIDEO SUMMARY: "${summary}"` : ''}

═══════════════════════════════════
SELECTED TEMPLATE DNA
═══════════════════════════════════
${templateBlock}

═══════════════════════════════════
THUMBNAIL FORMAT TYPES — USE VARIETY
═══════════════════════════════════
A — BOLD TEXT + OBJECT: One powerful word/number dominates 40-60% of frame. Object fills bg.
B — BEFORE/AFTER CONTRAST: Left dark before state. Right bright after state. Sharp divider.
C — CHARACTER + BOLD OVERLAY: Character prominent, 2-4 word bold text captures main point.
D — DATA/NUMBER SHOCK: Specific number dominates. Chart/money provides context.
E — QUESTION/CHALLENGE: Provocative question. Character looking puzzled/reacting.
F — SCENE SNAPSHOT: Most dramatic visual moment. Minimal text. Cinematic composition.
G — SYMBOLIC OBJECT: One powerful symbolic object fills frame. Dramatic lighting.
H — REACTION SPLIT: 50% authentic reaction face + 50% content being reacted to.

═══════════════════════════════════
TEXT RULES (NON-NEGOTIABLE)
═══════════════════════════════════
- MAX 4 WORDS. ALL CAPS. Impact or Bebas Neue font only.
- Text MUST connect directly to video title keywords.
- BANNED generic phrases: "YOU WON'T BELIEVE", "SHOCKING", "MUST WATCH", "INCREDIBLE"
- Text position: upper-left or upper-center ONLY. NEVER bottom-right (YouTube timestamp zone).
- Thick 6px black outline + heavy drop shadow on ALL text.

═══════════════════════════════════
COMPOSITION RULES
═══════════════════════════════════
- Max 3 elements: subject + text + background
- DEAD ZONE: bottom-right corner always empty
- Subject at rule-of-thirds, never dead center
- Background slightly desaturated/blurred to pop subject

═══════════════════════════════════
OUTPUT — Return ONLY a valid JSON array, no markdown, no explanation:
═══════════════════════════════════
[
  {
    "rank": 1,
    "format": "A",
    "template_dna_used": "${primary.name}",
    "concept_type": "shock_face",
    "concept_description": "What this shows and exactly why it gets 10%+ CTR",
    "psychological_trigger": "The specific psychology at play",
    "text_overlay": "MAX 4 WORDS ALL CAPS",
    "focal_point": "What the eye goes to first",
    "visual_metaphor": "The symbolic meaning",
    "color_scheme": "Primary color | Accent | Background",
    "text_style": "white | thick 6px black outline | upper-left | Impact",
    "style_reference": "cinematic",
    "ctr_score": 9,
    "why_it_stops_scrolling": "Specific psychological mechanism",
    "faceless_adaptation": "How to do this without showing a face",
    "image_prompt": "START WITH: 1920x1080 Full HD 16:9 widescreen YouTube thumbnail, graphic design composition. Then 300+ words describing the complete scene. Use color names only (no hex). CRITICAL: do NOT include any text, words, letters or numbers in the image — leave clean empty space for text overlay.",
    "negative_prompt": "text, letters, numbers, watermark, blurry, low quality, distorted faces, cluttered, text in bottom-right, flat expression, stock photo smile"
  }
]

REQUIREMENTS:
- Exactly 10 concepts
- At least 5 different format types (A through H)
- Concepts 1 & 2 use the primary template: ${primary.name}
- Concept 3 uses: ${templates[1]?.name || 'secondary template'}
- Every image_prompt is 300+ words
- Every text_overlay connects directly to the video title
- ctr_score between 7 and 10

Return the JSON array now.`;

    // ── Call Gemini ───────────────────────────────────────────────
    let concepts = [];
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.9,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        throw new Error(`Gemini API ${geminiRes.status}: ${errText.substring(0, 200)}`);
      }

      const geminiData = await geminiRes.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

      // Try parse with multiple fallback strategies
      try { concepts = JSON.parse(rawText); } catch (_) {}
      if (!Array.isArray(concepts) || !concepts.length) {
        try { concepts = JSON.parse(repairJSON(rawText)); } catch (_) {}
      }
      if (!Array.isArray(concepts) || !concepts.length) {
        const arrMatch = rawText.match(/\[[\s\S]*\]/);
        if (arrMatch) { try { concepts = JSON.parse(arrMatch[0]); } catch (_) {} }
      }
      if (!Array.isArray(concepts) || !concepts.length) {
        throw new Error('Failed to parse Gemini response as JSON array');
      }
    } catch (geminiErr) {
      console.error('Gemini error:', geminiErr.message);
      return Response.json({ error: `Gemini failed: ${geminiErr.message}` }, { status: 500 });
    }

    console.log(`Gemini returned ${concepts.length} concepts`);

    // ── Save to ThumbnailConcepts ────────────────────────────────
    // No project_id needed — we create a lightweight session record
    // and tag all concepts with it so frontend can filter them.
    // We use a timestamp-based session_id as the project_id placeholder.
    const sessionId = `thumb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const saved = [];
    const failed = [];

    for (const [i, c] of concepts.slice(0, 10).entries()) {
      try {
        let imagePrompt = c.image_prompt || '';

        // Ensure dimension spec is present
        if (!imagePrompt.includes('1920x1080') && !imagePrompt.includes('16:9')) {
          imagePrompt = `1920x1080 Full HD 16:9 widescreen YouTube thumbnail, graphic design composition. ${imagePrompt}`;
        }

        // Add quality marker if missing
        if (!imagePrompt.toLowerCase().includes('crisp') && !imagePrompt.toLowerCase().includes('sharp')) {
          imagePrompt += ' Ultra high resolution, crisp sharp details, professional quality.';
        }

        // Photorealism enforcement
        const hasHuman = /\b(person|man|woman|face|expression|skin|portrait)\b/i.test(imagePrompt);
        const alreadyPhoto = /photorealistic|DSLR|real human/i.test(imagePrompt);
        if (hasHuman && !alreadyPhoto) {
          imagePrompt = imagePrompt.replace(
            'graphic design composition.',
            'graphic design composition. Photorealistic photograph, DSLR camera shot, real human skin with visible pores, NOT illustration, NOT cartoon, NOT 3D render.'
          );
        }

        const record = await base44.entities.ThumbnailConcepts.create({
          project_id:            sessionId,
          rank:                  c.rank ?? (i + 1),
          concept_type:          c.concept_type ?? 'revelation',
          psychological_trigger: c.psychological_trigger ?? '',
          concept_description:   c.concept_description ?? '',
          focal_point:           c.focal_point ?? '',
          visual_metaphor:       c.visual_metaphor ?? '',
          color_scheme:          c.color_scheme ?? '',
          text_overlay:          c.text_overlay ?? '',
          text_style:            c.text_style ?? 'white | thick black outline | upper-left | Impact',
          style_reference:       c.style_reference ?? 'cinematic',
          ctr_score:             c.ctr_score ?? 7,
          why_it_stops_scrolling:c.why_it_stops_scrolling ?? '',
          faceless_adaptation:   c.faceless_adaptation ?? '',
          image_prompt:          imagePrompt,
          negative_prompt:       c.negative_prompt ?? 'text, letters, numbers, watermark, blurry, low quality, distorted faces',
          mood:                  c.mood ?? '',
          quality_valid:         true,
          is_selected:           false,
          image_url:             null,
          title:                 video_title,
          status:                'pending',
        });

        console.log(`✓ Saved concept ${c.rank ?? i + 1}: "${c.text_overlay}" CTR:${c.ctr_score}`);
        saved.push(record.id);
      } catch (saveErr) {
        console.error(`✗ Failed to save concept ${i + 1}:`, saveErr.message);
        failed.push({ rank: i + 1, error: saveErr.message });
      }
    }

    if (!saved.length) {
      return Response.json({
        error: `All ${concepts.length} concepts failed to save. First error: ${failed[0]?.error}. Check ThumbnailConcepts entity fields.`,
      }, { status: 500 });
    }

    console.log(`✓ Done: ${saved.length} saved, ${failed.length} failed`);

    return Response.json({
      success: true,
      concept_ids: saved,
      project_id: sessionId,
      concepts_saved: saved.length,
      template_selection: {
        primary_template: primary.name,
        primary_ctr_target: primary.ctr,
        all_templates: templates.map(t => ({ name: t.name, ctr: t.ctr, power: t.power })),
      },
      meta: {
        total_generated: concepts.length,
        total_saved: saved.length,
        total_failed: failed.length,
        failed_details: failed,
        dimensions: '1920x1080',
      },
    });

  } catch (error) {
    console.error('newThumbnailConcept error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
