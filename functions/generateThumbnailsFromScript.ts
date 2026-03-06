import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ═══════════════════════════════════════════════════════════════════
// THUMBNAIL ENGINE v4 — 4-Phase + Template Auto-Select
// Template DNA Vault: 26 templates × 7 niches
// Face/Emotion Intelligence: per-template expression specs
// Shorts Detection: auto-switches to vertical hook frame
// CTR Target: 8-12% | View Target: 10M+
// ═══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

// ───────────────────────────────────────────────────────────────────
// KIE.AI IMAGE GENERATION
// ───────────────────────────────────────────────────────────────────
async function kieCreate(apiKey, model, input) {
  const r = await fetch(KIE_BASE + "/createTask", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input })
  });
  const d = await r.json();
  if (!r.ok || d.code !== 200) throw new Error("Kie " + model + ": " + (d.msg || JSON.stringify(d)));
  return d.data.taskId;
}

async function kiePoll(apiKey, taskId) {
  const start = Date.now();
  while (Date.now() - start < 120000) {
    await new Promise(r => setTimeout(r, 4000));
    const r = await fetch(KIE_BASE + "/recordInfo?taskId=" + taskId, { headers: { Authorization: "Bearer " + apiKey } });
    const d = await r.json();
    if (d.code !== 200) continue;
    if (d.data?.state === "success") {
      const j = JSON.parse(d.data.resultJson || "{}");
      return j.resultUrls?.[0] || j.url || j.imageUrl || null;
    }
    if (d.data?.state === "fail") throw new Error(d.data?.failMsg || "failed");
  }
  throw new Error("timeout");
}

async function genImage(apiKey, prompt, neg, isShorts = false) {
  const aspectRatio = isShorts ? "9:16" : "16:9";
  const imageSize = isShorts ? "portrait_9_16" : "landscape_16_9";

  // Primary: Ideogram V3 QUALITY
  try {
    const tid = await kieCreate(apiKey, "ideogram/v3-text-to-image", {
      prompt: prompt.substring(0, 2000) + ". Ultra high resolution, crisp sharp details, professional quality.",
      image_size: imageSize, style: "DESIGN", rendering_speed: "QUALITY",
      expand_prompt: false,
      negative_prompt: neg || "blurry, low quality, pixelated, watermark, distorted text, small text, cluttered, text in bottom-right, low contrast"
    });
    const u = await kiePoll(apiKey, tid);
    if (u) return { url: u, model: "ideogram-v3-quality" };
  } catch (e) { console.warn("ideogram-v3 failed:", e.message); }

  // Fallback: Ideogram V3 BALANCED
  try {
    const tid = await kieCreate(apiKey, "ideogram/v3-text-to-image", {
      prompt: prompt.substring(0, 1200),
      image_size: imageSize, style: "DESIGN", rendering_speed: "BALANCED",
      expand_prompt: false,
      negative_prompt: neg || "blurry, low quality, pixelated, watermark"
    });
    const u = await kiePoll(apiKey, tid);
    if (u) return { url: u, model: "ideogram-v3-balanced" };
  } catch (e) { console.warn("ideogram-balanced failed:", e.message); }

  // Fallback 2: Grok Imagine
  try {
    const tid = await kieCreate(apiKey, "grok-imagine/text-to-image", {
      prompt: prompt.substring(0, 1500), aspect_ratio: aspectRatio
    });
    const u = await kiePoll(apiKey, tid);
    if (u) return { url: u, model: "grok-imagine" };
  } catch (e) { console.warn("grok-imagine failed:", e.message); }

  return { url: null, model: "none" };
}

// ───────────────────────────────────────────────────────────────────
// GEMINI HELPER
// ───────────────────────────────────────────────────────────────────
async function gemini(prompt, temp, maxTok) {
  const key = Deno.env.get("GEMINI_API_KEY");
  for (let i = 0; i < 3; i++) {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + key, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: temp, maxOutputTokens: maxTok, responseMimeType: "application/json" }
      })
    });
    if (r.status === 429) { await new Promise(w => setTimeout(w, (i + 1) * 10000)); continue; }
    if (!r.ok) { const e = await r.json(); throw new Error("Gemini " + r.status + ": " + (e.error?.message || "")); }
    const d = await r.json();
    if (!d.candidates?.length) throw new Error("No candidates");
    const t = d.candidates[0].content.parts[0].text;
    const clean = s => s.replace(/[\x00-\x1F\x7F]/g, c => "\n\r\t".includes(c) ? c : ' ').replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(t); } catch (_) {}
    try { return JSON.parse(clean(t)); } catch (_) {}
    let j = t;
    if (t.includes("```json")) j = t.split("```json")[1].split("```")[0].trim();
    else if (t.includes("```")) j = t.split("```")[1].split("```")[0].trim();
    try { return JSON.parse(clean(j)); } catch (_) {}
    const objM = j.match(/\{[\s\S]*\}/);
    if (objM) try { return JSON.parse(clean(objM[0])); } catch (_) {}
    const arrM = j.match(/\[[\s\S]*\]/);
    if (arrM) try { return JSON.parse(clean(arrM[0])); } catch (_) {}
    throw new Error("Parse failed");
  }
  throw new Error("Rate limited");
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE DNA VAULT — 26 Templates × 7 Niches
// ═══════════════════════════════════════════════════════════════════
const TEMPLATE_DNA = {
  shock_face: { id:"shock_face", name:"The Shock Face", niches:["finance","personal_finance","business","real_estate","make_money"], ctr:"8-12%", power:5, psychology:"Mirror neurons — viewer FEELS the shock before their brain processes text", face_required:true, face_emotion:"EXTREME SHOCK: eyes blown wide open, eyebrows at maximum arch, jaw dropped with mouth in O shape, both hands raised to cheeks or covering mouth, pupils visibly dilated, forehead creased with disbelief. Must be readable at 120px. NO fake expressions.", text_formula:"SHOCKING NUMBER or PAINFUL OUTCOME. MAX 4 WORDS ALL CAPS. e.g. '$130K STILL BROKE' or 'I LOST EVERYTHING'", color:"DARK background (#0a0a1a) + ELECTRIC YELLOW (#FFD700) or WHITE text + RED accent. Maximum contrast.", composition:"Face occupies 45-55% of frame, rule-of-thirds. Text in opposing third with 6px+ black outline and heavy drop shadow. Rim light on face edge for separation.", signals:["money","income","salary","broke","budget","debt","invest","wealth","savings","financial"], ideogram:"ultra-sharp facial features, pore-level skin detail, rim light separation, heavy background bokeh, cinematic color grade" },
  income_reveal: { id:"income_reveal", name:"The Income Reveal", niches:["finance","make_money","side_hustle","investing","crypto"], ctr:"7-11%", power:5, psychology:"Aspiration + Social Proof", face_required:false, face_emotion:"PROUD CONFIDENCE: chest out, chin slightly raised, direct camera gaze with calm knowing smile. NOT cocky — genuinely proud.", text_formula:"SPECIFIC ODD DOLLAR AMOUNT + TIME PERIOD. MAX 4 WORDS. e.g. '$47,382 IN 6 MONTHS'. Always odd non-round numbers for credibility.", color:"DARK background + NEON GREEN (#00C853) dollar amount with green glow + GOLD accent. Dollar number dominates 30-40% of frame.", composition:"Dollar amount centered-large, subtle proof element (chart/phone) slightly blurred in background.", signals:["income","made","earned","passive","per month","profit","revenue","side hustle"], ideogram:"money green color palette, financial success aesthetic, clean professional photography" },
  warning_alert: { id:"warning_alert", name:"The Warning/Alert", niches:["finance","health","crypto","real_estate","news"], ctr:"7-10%", power:4, psychology:"Loss aversion — humans fear losing more than gaining", face_required:false, face_emotion:"URGENT WARNING: intense forward stare into camera, eyebrows furrowed, jaw set, pointing finger at viewer. 'You need to hear this NOW' energy.", text_formula:"STOP [DOING THIS] or WARNING: [OUTCOME]. MAX 4 WORDS ALL CAPS.", color:"DEEP RED dominant + WHITE or BRIGHT YELLOW text + BLACK outline + ⚠️ symbol.", composition:"Warning symbol top-left, text center-screen, subject center-right if used. Pure urgency.", signals:["stop","warning","danger","losing","mistake","avoid","never","wrong","trap","scam"], ideogram:"urgent red color scheme, high contrast, warning aesthetic, bold typography" },
  secret_hidden: { id:"secret_hidden", name:"The Secret/Hidden Truth", niches:["finance","health","business"], ctr:"7-10%", power:4, psychology:"Information gap + exclusivity", face_required:false, face_emotion:"CONSPIRATORIAL WHISPER: finger to lips, sideways glance, knowing half-smile, leaning forward sharing forbidden knowledge.", text_formula:"HIDDEN [TRUTH] or WHAT [THEY] DON'T TELL YOU. MAX 4 WORDS.", color:"NEAR BLACK background + GOLD or BRIGHT YELLOW text + single dramatic light source.", composition:"Dark atmospheric, single dramatic light from one side. Subject partially in shadow.", signals:["secret","hidden","truth","they don't want","banks","nobody tells","revealed"], ideogram:"noir mystery lighting, single dramatic spotlight, dark atmospheric shadows, gold accent" },
  breaking_news: { id:"breaking_news", name:"The Breaking News", niches:["finance","crypto","real_estate","stocks","news"], ctr:"7-11%", power:5, psychology:"FOMO + urgency — if this just happened I need to know NOW", face_required:false, face_emotion:"URGENT PRESENTER: pointing at chart/screen, leaning toward camera, wide awake, 'act now' energy.", text_formula:"BREAKING: [WHAT CHANGED]. MAX 5 WORDS.", color:"NEWS RED banner + WHITE text + DARK background + URGENT YELLOW accent.", composition:"BREAKING badge top-left, news ticker element, TODAY timestamp, news broadcast aesthetic.", signals:["just","now","breaking","announced","happened","changed","crashed","surged","today","update"], ideogram:"news broadcast aesthetic, red alert banner, urgent news graphics" },
  before_after: { id:"before_after", name:"The Before/After Split", niches:["finance","fitness","transformation","budgeting"], ctr:"6-10%", power:4, psychology:"Transformation desire", face_required:false, face_emotion:"LEFT: defeated/stressed, shoulders hunched | RIGHT: liberated/confident, direct gaze, genuine smile.", text_formula:"STATE_A → STATE_B. e.g. 'BROKE → $200K' or '$0 → DEBT FREE'.", color:"LEFT: dark cold blues/grays | RIGHT: warm bright gold/green | CENTER: sharp divider or arrow.", composition:"50/50 split with heavy vignette left, bright light right.", signals:["before","after","transformation","went from","used to","debt free","financial freedom"], ideogram:"split composition, warm vs cold contrast, transformation aesthetic" },
  numbered_list: { id:"numbered_list", name:"The Numbered List Bomb", niches:["finance","productivity","health","self_improvement"], ctr:"5-9%", power:3, psychology:"Listicle brain — numbered content feels completable", face_required:false, face_emotion:"KNOWLEDGEABLE AUTHORITY: head tilt, confident smile, one finger raised — about to share all items.", text_formula:"ODD NUMBER + WHAT THEY WANT. e.g. '7 HABITS OF RICH'. Odd numbers more credible. MAX 5 WORDS.", color:"Bold background + MASSIVE number in accent color + white supporting text.", composition:"Number large (25-35% of frame), clean design. Number IS the hook.", signals:["habits","ways","things","tips","steps","rules","secrets","mistakes"], ideogram:"bold graphic design, large typography, clean modern aesthetic, number prominence" },
  identity_challenge: { id:"identity_challenge", name:"The Identity Challenge", niches:["finance","self_help","mindset","relationships"], ctr:"6-8%", power:3, psychology:"Ego threat — click to defend identity", face_required:true, face_emotion:"DIRECT ACCUSATORY CHALLENGE: eyes locked on camera, raised single eyebrow, pointing finger at lens, half-smirk of 'I know what you're doing'. Friend calling you out.", text_formula:"IF YOU [DO THIS] = [NEGATIVE IDENTITY]. e.g. 'THIS HABIT = POOR'. MAX 5 WORDS.", color:"DARK PURPLE/blue background + WHITE/bright accent text + pointing gesture visual.", composition:"Face pointing toward text, gesture bridges face and text creating visual flow.", signals:["if you","you're","still doing","keeping you","poor mindset","broke habits"], ideogram:"confrontational framing, purple dramatic background, pointing gesture emphasis" },
  finance_versus: { id:"finance_versus", name:"The Finance Versus", niches:["finance","real_estate","investing","personal_finance","make_money","crypto"], ctr:"6-9%", power:4, psychology:"Binary thinking + tribal loyalty — people are hardwired to pick a side and defend financial decisions that affect their identity. Creates instant debate engagement.", face_required:false, face_emotion:"DECISIVE AUTHORITY: arms crossed with confident half-smile of someone who has tested BOTH sides and knows the answer. The trusted advisor who will settle the debate. NOT smug.", text_formula:"[OPTION A] VS [OPTION B] — financial, personal, stakes-driven. e.g. 'RENTING VS BUYING' or 'STOCKS VS REAL ESTATE' or '401K VS ROTH IRA'. MAX 5 WORDS.", color:"SPLIT — LEFT bold color (deep blue for one option) + RIGHT contrasting color (warm amber for the other). VS center in WHITE/YELLOW on dark. Each color IS the identity of its option.", composition:"Perfect 50/50 vertical split. Each half has its own color, icon/visual, and mini label. VS divider center in bold white or yellow. Winner side very slightly larger or brighter — teasing the answer without giving it.", signals:["vs","versus","or","renting","buying","stocks","bonds","real estate","401k","roth","crypto","index fund","etf","property","dividend","save","invest"], ideogram:"split composition design, bold color blocks each half, versus battle financial aesthetic, high contrast divider" },
  lifestyle_proof: { id:"lifestyle_proof", name:"The Lifestyle Proof", niches:["finance","make_money","side_hustle","business","youtube","creator_economy"], ctr:"6-9%", power:4, psychology:"Social proof + aspiration — showing the RESULT not the process creates instant credibility and desire. The luxury item is evidence the strategy actually worked.", face_required:false, face_emotion:"CASUAL ABUNDANT CONFIDENCE: one hand casually touching or leaning on luxury item (car/watch/house), other hand in pocket or arms crossed loosely — the body language of someone so comfortable with wealth it's now ordinary. NOT showing off. Just normal life that happens to include a Lamborghini.", text_formula:"LUXURY ITEM + HOW IT'S FUNDED or INCOME SOURCE. e.g. 'MY LAMBO PAID BY YOUTUBE' or '$12K/MONTH FROM MY PHONE' or 'HOW I BOUGHT THIS AT 24'. Specific dollar + specific method. MAX 5 WORDS.", color:"RICH dark background (navy/charcoal/black) + GOLD accent text (#FFD700) + the luxury item's natural glamour. Aspirationally tasteful, not gaudy.", composition:"Luxury proof item occupies 50-60% of frame. Income number/source in large text floating near item. Person casually near item if face used. Feels like evidence of success, not a flex.", signals:["lamborghini","lambo","ferrari","mansion","rolex","watch","passive income","youtube income","my car","bought","afford","paid for by","how i bought","at 24","at 25","made me","pays for"], ideogram:"luxury lifestyle photography, high-end product cinematography, wealth aesthetic dark background, gold accent, aspirational composition" },
  finance_audit: { id:"finance_audit", name:"The Finance Audit Reaction", niches:["finance","personal_finance","budgeting","debt","make_money"], ctr:"6-9%", power:4, psychology:"Vicarious learning + rubbernecking — watching someone else's financial disaster feels safe and educational. Caleb Hammer built 2M subscribers purely on this psychology.", face_required:true, face_emotion:"AUDITOR'S HORROR-DISBELIEF: eyes wide and slightly squinting as if looking at something painful, head tilted slightly back or to the side, one hand raised to temple or jaw, mouth open in a grimace that says 'HOW did this happen' — pained disbelief mixed with dark humor. NOT angry, NOT judgmental — genuinely pained by what they're seeing. This is the Caleb Hammer face. The Ethan Suplee face. The face of a financial expert confronting a truly catastrophic budget.", face_position:"left-third or left-center, chest-up, gaze directed RIGHT at the financial data/screen — the gaze direction pulls the viewer's eye to the numbers.", text_formula:"THE FINANCIAL DISASTER NUMBER + WHO IT HAPPENED TO. e.g. '$200K DEBT AT 23' or 'REACTING TO $0 SAVINGS AT 40' or 'SHE MAKES $80K AND IS BROKE'. Specific number + specific person. MAX 5 WORDS.", color:"SPLIT: auditor face (left 40%) with neutral/dark bg + financial data/numbers (right 60%) with stark clinical white or red. RED numbers for debt. GREEN for income. This color-coded data IS the horror.", composition:"SPLIT — auditor's pained reaction face left-third + subject's financial breakdown data right-two-thirds. OR: large shocking financial number dominates frame with small auditor face corner-reacting. The NUMBER and FACE together tell the complete story at 120px.", signals:["budget","audit","reaction","reacting","debt","broke","financial disaster","savings","income","expenses","net worth","spending","paycheck","financial review","how they spend","financial roast"], ideogram:"financial data chart visualization, clinical split composition, pained auditor reaction face, red debt numbers, Caleb Hammer financial audit aesthetic, stark contrast lighting" },

  // STORYTELLING
  cliffhanger: { id:"cliffhanger", name:"The Cliffhanger Frame", niches:["storytelling","documentary","narrative","drama"], ctr:"7-11%", power:5, psychology:"Open loop — Zeigarnik effect, brain CANNOT rest until story resolves", face_required:true, face_emotion:"TENSE ANTICIPATION: eyes slightly wide focused off-frame, jaw tensed, one hand mid-gesture — the moment before everything changes. NOT looking at camera.", text_formula:"INCOMPLETE REVELATION with ellipsis. e.g. 'SHE LEFT EVERYTHING...' or 'NOBODY KNEW UNTIL...'. Always incomplete, brain demands completion.", color:"WARM AMBER to DEEP ORANGE gradient + heavy sepia/vintage color grade + crushing dark vignette.", composition:"Subject in dramatic mid-action looking INTO the negative space where the unknown lives. Cinematic wide crop.", signals:["story","happened","she","he","they","journey","night","everything changed","discovered","found out"], ideogram:"cinematic amber warm color grade, dramatic vignette, storytelling aesthetic, mid-action drama" },
  true_account: { id:"true_account", name:"The True Account Banner", niches:["storytelling","documentary","true_crime","history"], ctr:"6-9%", power:3, psychology:"Reality anchoring — 'TRUE STORY' = forbidden knowledge being shared", face_required:false, face_emotion:"DOCUMENTARY SUBJECT: calm but haunted expression, natural unstyled look, direct but slightly off-camera gaze.", text_formula:"TRUE STORY: [WHAT HAPPENED]. The 'TRUE STORY' label is a major trust + click signal.", color:"DESATURATED muted tones + yellowed newspaper/file aesthetic + muted ambers.", composition:"Documentary aesthetic, file folder or newspaper texture, case number timestamp.", signals:["true","real","based","actual","documented","happened","case","account"], ideogram:"documentary film aesthetic, desaturated vintage tones, case file newspaper texture" },

  // TRUE CRIME
  cold_case_file: { id:"cold_case_file", name:"The Cold Case File", niches:["true_crime","documentary","mystery","crime"], ctr:"8-12%", power:5, psychology:"Justice obsession + morbid curiosity — hardwired to solve mysteries", face_required:false, face_emotion:"HAUNTED: deeply troubled, dark circles, looking down or away, vulnerability mixed with residual fear. Someone who witnessed something terrible.", text_formula:"THE [CRIME] THAT [UNSOLVED OUTCOME]. e.g. 'THE MURDER NOBODY SOLVED' or 'THE KILLER NEXT DOOR'.", color:"NEAR BLACK background + BLOOD RED accent + YELLOW evidence highlight. Crime investigation palette.", composition:"Evidence board aesthetic: polaroid photos, red string, case file stamps. Feels like accessing classified information.", signals:["murder","crime","killer","suspect","case","investigation","disappeared","evidence","caught","unsolved","confession"], ideogram:"crime investigation aesthetic, evidence board composition, noir lighting, red and black palette" },
  suspect_reveal: { id:"suspect_reveal", name:"The Suspect Reveal", niches:["true_crime","mystery","news","thriller"], ctr:"7-10%", power:4, psychology:"Accusation trigger — wired to stare at the accused", face_required:true, face_emotion:"HALF-SHADOWED AMBIGUITY: exactly half face in deep shadow, visible half showing either intense staring suspicion OR unsettling calm normalcy that feels wrong. One eye clearly visible with penetrating gaze.", text_formula:"ACCUSATORY WITHOUT CONFIRMING. e.g. 'EVERYONE THOUGHT IT WAS HIM' or 'SHE SMILED AT THE FUNERAL'.", color:"PURE BLACK + SINGLE harsh white/red light + POLICE YELLOW tape element. Maximum drama from minimum light.", composition:"Dramatic chiaroscuro — 50% deep shadow, 50% harsh revelation light. Police tape or evidence element.", signals:["suspect","killer","accused","guilty","innocent","confession","arrested","who did it","charged"], ideogram:"chiaroscuro half-shadow lighting, single dramatic light source, crime thriller aesthetic" },

  // LOVE & RELATIONSHIPS
  heartbreak_headline: { id:"heartbreak_headline", name:"The Heartbreak Headline", niches:["relationships","love","dating","marriage","divorce"], ctr:"7-10%", power:5, psychology:"Emotional contagion — pain and loss are most universally shared emotions", face_required:true, face_emotion:"RAW EMOTIONAL PAIN — NOT staged: eyes red-rimmed or glistening with real tears, lower lip slightly trembling, chin dimpled, shoulders slightly collapsed. Looking down OR into camera with soul-crushing vulnerability. Zero performance.", text_formula:"UNRESOLVED PAINFUL MOMENT. Short and specific, feels like overhearing a confession. e.g. 'HE LEFT WITHOUT A WORD' or 'SHE FOUND THE MESSAGES'.", color:"DESATURATED dark blues and cold grays + single warm light on face + heavy vignette. Cold palette amplifies pain.", composition:"Subject slightly turned away OR in direct vulnerable gaze. Desaturated environment, face has only warmth.", signals:["love","relationship","broke up","cheated","left","heartbreak","partner","marriage","toxic","ex","affair","betrayal"], ideogram:"cold desaturated palette, emotional documentary lighting, single warm light on face, heavy vignette" },
  relationship_red_flag: { id:"relationship_red_flag", name:"The Relationship Red Flag", niches:["relationships","dating","self_help","psychology"], ctr:"6-9%", power:4, psychology:"Self-protection instinct — click to confirm or deny own situation", face_required:true, face_emotion:"PROTECTIVE WARNING: raised eyebrow skepticism combined with caring urgency. Trusted friend saying 'you need to hear this'. Hand raised in stop gesture OR arms crossed protectively.", text_formula:"DIRECT CHALLENGE OR WARNING. e.g. 'IF HE DOES THIS — RUN' or '5 SIGNS THEY DON'T LOVE YOU'.", color:"RED warning dominant + WHITE text with thick black outline + red flag visual element.", composition:"Person in warning/protective pose with strong eye contact. Red flag element prominent.", signals:["red flag","toxic","narcissist","manipulate","signs","if he","if she","run","gaslighting","controlling"], ideogram:"urgent red warning palette, protective energy, red flag visual elements" },

  // TRAVEL & VACATION
  destination_wow: { id:"destination_wow", name:"The Destination Wow Shot", niches:["travel","vacation","lifestyle","adventure"], ctr:"6-10%", power:5, psychology:"Escapism pull — stunning scenery triggers immediate desire to be there", face_required:false, face_emotion:"AWESTRUCK PURE JOY: jaw slightly dropped, eyes wide with genuine wonder, arms potentially spread wide. Authentic wanderlust joy.", text_formula:"[PLACE] FOR $AMOUNT or I SPENT [TIME] IN [PLACE] FOR $AMOUNT. Price makes dream feel accessible.", color:"ULTRA-VIVID SATURATED landscape colors + golden hour warm light + high saturation boost.", composition:"Wide cinematic shot. Small human figure for SCALE. Destination fills 75-80% of frame.", signals:["travel","trip","vacation","country","flight","hotel","beach","explore","destination","island","resort","paradise"], ideogram:"ultra-vivid landscape photography, golden hour lighting, travel photography, wide cinematic composition" },
  hidden_gem: { id:"hidden_gem", name:"The Hidden Gem Reveal", niches:["travel","adventure","lifestyle"], ctr:"7-9%", power:4, psychology:"Exclusivity + FOMO — 'nobody talks about this' triggers urgency", face_required:false, face_emotion:"DISCOVERER'S EXCITEMENT: genuine surprise-joy hybrid, pointing at discovery, breathless excitement of sharing a secret.", text_formula:"EXCLUSIVITY LANGUAGE + PLACE. e.g. 'HIDDEN BEACH NOBODY KNOWS' or 'THIS COUNTRY BEATS ITALY'.", color:"LUSH natural greens + crystal azure blues + golden discovery light. Unspoiled beauty palette.", composition:"NO tourist infrastructure visible. Sense of private discovery. Person looks like first one there.", signals:["hidden","secret","nobody knows","undiscovered","gem","paradise","underrated","skip the crowds"], ideogram:"pristine natural beauty, lush tropical photography, discovery lighting, unspoiled wilderness" },

  // IT & AI
  ai_takeover: { id:"ai_takeover", name:"The AI Takeover Frame", niches:["ai","tech","business","future","career"], ctr:"7-11%", power:5, psychology:"Existential fear + curiosity — AI threatens identity, career, and future simultaneously", face_required:false, face_emotion:"ALARMED URGENCY: wide eyes of someone who saw the threat, raised hand in stop/warning gesture at camera, forward lean of 'you need to hear this NOW'.", text_formula:"AI THREAT + PERSONAL IMPACT. e.g. 'AI JUST REPLACED 10,000 JOBS' or 'YOUR JOB IS GONE'.", color:"ELECTRIC NEON BLUE (#00B4FF) on NEAR BLACK + PURPLE AI circuit aesthetic + cold blue glow.", composition:"AI interface/robot element dominant and threatening. Human element small or threatened. Circuit board background.", signals:["AI","ChatGPT","Claude","automation","replaced","machine learning","GPT","Gemini","artificial intelligence","robot"], ideogram:"neon blue AI technology aesthetic, circuit board patterns, futuristic cyberpunk lighting" },
  cheat_code_reveal: { id:"cheat_code_reveal", name:"The Cheat Code Reveal", niches:["ai","tech","productivity","make_money","tools"], ctr:"6-10%", power:4, psychology:"Shortcut psychology + unfair advantage desire", face_required:false, face_emotion:"CONSPIRATORIAL SECRET SHARER: leaning forward, one eyebrow raised, the half-smile of giving someone something they shouldn't have. 'I shouldn't be telling you this but...'", text_formula:"TIME/EFFORT COMPRESSION. e.g. '10 HRS → 5 MINS' or 'THE PROMPT THAT CHANGES EVERYTHING'.", color:"DARK PURPLE/black + ELECTRIC CYAN or GREEN accent + code/terminal aesthetic + screen glow.", composition:"Tool/screen interface VISIBLE as proof. Time/effort comparison dominates. Hacker productivity aesthetic.", signals:["tool","hack","prompt","automation","workflow","faster","10x","AI tool","productivity","secret tool"], ideogram:"dark hacker aesthetic, glowing screen interface, productivity tool visual, purple cyan neon" },
  tech_comparison: { id:"tech_comparison", name:"The Tech Comparison Bomb", niches:["ai","tech","software","tools","reviews"], ctr:"6-9%", power:4, psychology:"Tribal tech loyalty — developers are fanatically loyal to their tools", face_required:false, face_emotion:"DECISIVE TESTING AUTHORITY: confident direct gaze, 'I've done the research so you don't have to' look.", text_formula:"[TOOL A] VS [TOOL B] or I TESTED EVERY [AI/TOOL]. Bold VS center element.", color:"SPLIT design with tool brand colors on respective sides + bold VS center + NEUTRAL professional.", composition:"Logos/interfaces from each tool clearly visible. VS divider center. Winner implied by size hierarchy.", signals:["vs","versus","compared","better","winner","best","tested","review","benchmark","comparison"], ideogram:"head-to-head battle aesthetic, split composition, versus tournament energy" },

  // MOVIES & RECAP
  plot_twist_tease: { id:"plot_twist_tease", name:"The Plot Twist Tease", niches:["movies","tv","entertainment","recap","reviews"], ctr:"8-12%", power:5, psychology:"Spoiler magnetism — seen it: validation; not seen it: secret knowledge", face_required:true, face_emotion:"MIND-BLOWN MAXIMUM: both hands on head, eyes at ABSOLUTE MAXIMUM width, mouth open in O shape, visibly leaning back from impact. NOT posed — authentic shattered worldview expression.", text_formula:"UNREVEALED MYSTERY. e.g. 'THE TWIST YOU MISSED' or 'WHAT THEY DIDN'T SHOW YOU'.", color:"CINEMATIC TEAL AND ORANGE color grade + FILM GRAIN overlay + GOLD highlight text.", composition:"SPLIT: reactor face (40%) + cinematic scene (60%). Film grain and cinematic grade throughout.", signals:["movie","film","show","series","scene","ending","twist","explained","theory","review","recap","breakdown"], ideogram:"cinematic teal-orange color grade, film grain overlay, movie poster composition" },
  deep_lore_dive: { id:"deep_lore_dive", name:"The Deep Lore Dive", niches:["movies","gaming","anime","entertainment","books"], ctr:"6-9%", power:4, psychology:"Superfan identity — true fans NEED hidden knowledge casual viewers missed", face_required:false, face_emotion:"THE DETECTIVE REVEAL: magnifying glass gesture, intensely focused, eureka single raised finger — the energy of finding the hidden clue.", text_formula:"HIDDEN KNOWLEDGE. e.g. 'THE CLUE NOBODY NOTICED' or 'HIDDEN MESSAGE IN [SHOW]'.", color:"DARK mysterious tones matching IP palette + spotlight on key element + annotation arrows/circles.", composition:"Icon/symbol from IP highlighted with dramatic spotlight. Detective investigation board aesthetic.", signals:["lore","hidden","detail","nobody noticed","theory","easter egg","secret","symbolism","foreshadowing","clue"], ideogram:"dark mysterious atmosphere, magnifying spotlight effect, detective investigation aesthetic" },
  reaction_recap: { id:"reaction_recap", name:"The Reaction Recap", niches:["movies","entertainment","reaction","tv","anime"], ctr:"7-10%", power:4, psychology:"Shared experience — reliving emotional moments through someone else", face_required:true, face_emotion:"COMPLETELY AUTHENTIC UNFILTERED REACTION: tears on cheeks, genuine open-mouth laugh with crinkled eyes, or hand covering mouth in gasp — ZERO performance, ZERO posing. The authenticity IS the content.", text_formula:"EMOTIONAL REACTION + SUBJECT. e.g. 'I CRIED 3 TIMES' or 'WATCHING [MOVIE] FOR FIRST TIME'.", color:"SPLIT: warm natural lighting on face (left) + content-matched color grade (right). Natural vs cinematic.", composition:"40-50% authentic reaction face + 50-60% content being reacted to. Both elements readable at thumbnail size.", signals:["reaction","reacting","watched","first time","cried","shocked","reviewing","first watch","blind reaction"], ideogram:"authentic emotional photography, natural candid lighting, cinema split composition" },

  // SHORTS
  shorts_hook_frame: { id:"shorts_hook_frame", name:"The Shorts Hook Frame", niches:["all_niches"], ctr:"3-sec scroll-stop", power:5, psychology:"Pattern interrupt — stop scroll in UNDER 0.3 seconds", face_required:false, face_emotion:"EXTREME VERSION of the video's core emotion amplified 200%. Fills 80%+ of vertical frame.", text_formula:"1-2 LINES MAXIMUM. POV hook, shocking statement, or cliffhanger. ALL CAPS. MASSIVE font.", color:"SINGLE BOLD background color + WHITE or NEON text filling top 30% of frame. Zero complexity.", composition:"VERTICAL 9:16. Text top 30%. Subject bottom 70%. OR: full-frame TEXT only. First frame = the entire hook.", signals:["shorts","short","#shorts","pov","quick","60 seconds"], ideogram:"vertical 9:16 composition, bold single color background, massive readable text, shorts-optimized" }
};

// ───────────────────────────────────────────────────────────────────
// NICHE DETECTION + TEMPLATE AUTO-SELECT
// ───────────────────────────────────────────────────────────────────
function detectAndSelectTemplates(title = "", script = "", projectNiche = "", isShorts = false) {
  if (isShorts) {
    return [TEMPLATE_DNA.shorts_hook_frame, TEMPLATE_DNA.shock_face, TEMPLATE_DNA.warning_alert];
  }

  const text = (title + " " + script + " " + projectNiche).toLowerCase();

  const nicheSignals = {
    finance: ["money","income","budget","debt","invest","broke","salary","wealth","savings","financial","rich","poor","lambo","lamborghini","real estate","renting","buying","audit","vs","versus","passive","401k","roth","dividend","etf","index fund"],
    true_crime: ["murder","crime","killer","suspect","case","investigation","disappeared","evidence","unsolved","confession","arrest"],
    storytelling: ["story","happened","she","he","they","journey","night","everything changed","discovered","found out","true story"],
    relationships: ["love","relationship","broke up","cheated","partner","marriage","heartbreak","toxic","dating","ex","affair","red flag"],
    travel: ["travel","trip","vacation","country","flight","hotel","beach","explore","destination","island","resort","paradise"],
    ai: ["AI","ChatGPT","Claude","automation","replaced","GPT","Gemini","artificial intelligence","robot","machine learning"],
    movies: ["movie","film","show","series","scene","ending","twist","explained","theory","review","recap","cinema"],
    make_money: ["income","side hustle","passive","earn online","make money","revenue"],
    crypto: ["bitcoin","crypto","ethereum","blockchain","NFT","trading"],
    self_help: ["mindset","motivation","success","goal","discipline","confidence","anxiety","growth"]
  };

  // Score niches
  const scores = {};
  for (const [niche, kws] of Object.entries(nicheSignals)) {
    scores[niche] = kws.filter(kw => text.includes(kw.toLowerCase())).length;
  }
  // Boost from projectNiche
  const pn = projectNiche.toLowerCase();
  for (const [niche] of Object.entries(scores)) {
    if (pn.includes(niche) || pn.includes(niche.replace("_"," "))) scores[niche] += 5;
  }
  if (pn.includes("finance") || pn.includes("money") || pn.includes("budget")) scores.finance = (scores.finance||0)+5;
  if (pn.includes("crime")) scores.true_crime = (scores.true_crime||0)+5;
  if (pn.includes("travel")) scores.travel = (scores.travel||0)+5;
  if (pn.includes("ai") || pn.includes("tech")) scores.ai = (scores.ai||0)+5;
  if (pn.includes("movie") || pn.includes("recap") || pn.includes("entertainment")) scores.movies = (scores.movies||0)+5;
  if (pn.includes("relationship") || pn.includes("love") || pn.includes("dating")) scores.relationships = (scores.relationships||0)+5;

  const topNiche = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0]?.[0] || "finance";

  // Score all templates
  const ranked = Object.values(TEMPLATE_DNA)
    .filter(t => t.id !== "shorts_hook_frame")
    .map(t => {
      let score = 0;
      if (t.niches.some(n => n === topNiche || n.includes(topNiche.split("_")[0]))) score += 40;
      const sigHits = (t.signals||[]).filter(kw => text.includes(kw.toLowerCase())).length;
      score += sigHits * 8;
      score += (t.power||3) * 5;
      return { ...t, _score: score };
    })
    .sort((a,b) => b._score - a._score);

  return ranked.slice(0, 3);
}

function buildTemplateDNABlock(templates) {
  let ctx = `\n═══════════════════════════════════════════════════════════
SMART TEMPLATE DNA — AUTO-SELECTED FROM SCRIPT ANALYSIS
These 3 templates are calibrated for 8-12% CTR and 10M+ views.
Your thumbnail concepts MUST implement these templates.
═══════════════════════════════════════════════════════════\n`;

  templates.forEach((t, i) => {
    ctx += `
▶ TEMPLATE ${i+1} (${i===0?"PRIMARY":"ALTERNATE"}) — ${t.name} | CTR: ${t.ctr} | Power: ${"★".repeat(t.power||3)}
  📌 Psychology: ${t.psychology}
  👁 FACE/EMOTION REQUIREMENT: ${t.face_emotion}
  💬 Text Formula: ${t.text_formula}
  🎨 Color System: ${t.color}
  📐 Composition: ${t.composition}
  ✅ Face Required: ${t.face_required ? "YES — face IS the primary hook at this CTR level" : "NO — object/graphic driven hook"}
  🤖 Ideogram Quality Modifiers: ${t.ideogram}
`;
  });

  ctx += `\n═══════════════════════════════════════════════════════════
MANDATORY RULES:
• Concept 1: MUST implement Template 1 (PRIMARY) exactly
• Concept 2: MUST implement Template 1 or 2 with variation
• Concept 3: CAN be Template 3 or creative fusion
• Face/emotion specs above are NON-NEGOTIABLE — they are the difference between 2% CTR and 10% CTR
• Text must be MAX 4 WORDS, ALL CAPS, with thick outline readable at 120px
═══════════════════════════════════════════════════════════\n`;

  return ctx;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const KIE_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_KEY) return Response.json({ error: 'KIE_API_KEY missing' }, { status: 500 });

    const { project_id, reference_style, template_blueprint, niche_dna, niche_name, selected_title, selected_templates } = await req.json();


    const [projects, scripts, topics] = await Promise.all([
      base44.entities.Projects.filter({ id: project_id }),
      base44.entities.Scripts.filter({ project_id }),
      base44.entities.Topics.filter({ project_id })
    ]);
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
    const script = scripts.find(s => s.version === 'final_aggregated') || scripts.find(s => s.version === 'final') || scripts[0];
    if (!script) return Response.json({ error: 'No script found' }, { status: 400 });
    const topic = topics.find(t => t.is_selected);
    const topicTitle = topic?.title || script.title || project.name || 'Untitled Video';

    const fullScript = script.full_script || [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro].filter(Boolean).join('\n\n');
    const trunc = fullScript.substring(0, 3000);

    // Detect if this is a Shorts project
    const isShorts = (project.content_type || '').toLowerCase().includes('short') ||
      (topicTitle + ' ' + (script.title||'')).toLowerCase().includes('#short') ||
      (fullScript.length < 800);

    const style = ['picstory_cocomelon','cartoon_2d'].includes(project.visual_style||'') ? 'cinematic_realistic' : (project.visual_style||'cinematic_realistic');
    const titleCtx = selected_title ? ` SEO TITLE: "${selected_title}"` : '';
    const nicheCtx = niche_dna ? ` NICHE DNA: ${niche_dna.substring(0,600)}` : '';

    // ──────────────────────────────────────────────────────────────
    // PRE-PHASE: TEMPLATE AUTO-SELECTION
    // ──────────────────────────────────────────────────────────────
    const selectedTemplates = detectAndSelectTemplates(topicTitle, trunc, project.niche || '', isShorts);
    const templateDNABlock = buildTemplateDNABlock(selectedTemplates);
    const primaryTemplate = selectedTemplates[0];

    console.log(`Template Auto-Select: [${selectedTemplates.map(t=>t.name).join(' | ')}]`);
    console.log(`Shorts mode: ${isShorts} | Primary template: ${primaryTemplate.name}`);
    console.log(`Face required: ${primaryTemplate.face_required}`);

    // ──────────────────────────────────────────────────────────────
    // PHASE 0: SCRIPT ESSENCE + EMOTIONAL CORE EXTRACTION
    // ──────────────────────────────────────────────────────────────
    console.log("Phase 0: Script essence extraction");
    const essenceScript = fullScript.substring(0, 6000);

    const script_essence = await gemini(`You are a LEGENDARY YouTube thumbnail creator for channels with 10M+ views. You've created thumbnails for MrBeast, Veritasium, Kurzgesagt. Your thumbnails achieve 15%+ CTR. You are analyzing this script to extract the ONE viral thumbnail concept that stops the scroll.

VIDEO: "${topicTitle}" | TITLE: "${script.title}" | NICHE: "${project.niche}"${titleCtx}
CONTENT TYPE: ${isShorts ? "YOUTUBE SHORTS — optimize for 0.3 second scroll-stop, vertical 9:16 format" : "LONG-FORM VIDEO — optimize for 8-12% CTR"}

${templateDNABlock}

SCRIPT:
${essenceScript}

Extract with EXTREME precision — every field drives the thumbnail:

JSON: {
  "emotional_hook": "The ONE dominant emotion viewers will feel. Be specific — not just 'curiosity' but 'morbid curiosity about a hidden financial trap'.",
  "primary_template_match": "${primaryTemplate.id} — confirm this is correct OR suggest better match from the vault",
  "face_expression_spec": "Based on the primary template's face requirement, specify EXACTLY what expression is needed: which muscles, what configuration, what emotion reads at 120px",
  "thumbnail_message_concept": "Scroll-stopping headline concept. MAX 4 words. Uses the template's text formula. Creates curiosity gap OR shock OR urgency. NO generic phrases.",
  "impactful_visual_element": "The SINGLE most powerful visual. Hyper-specific: exact object, exact state, exact framing. Anchored to script content.",
  "human_emotion_description": "${primaryTemplate.face_required ? "REQUIRED: describe the exact face expression per template DNA above" : "N/A — this template is object/graphic driven"}",
  "key_characters_objects": ["2-3 most visually distinctive items from script climax"],
  "contrast_description": "The strongest before/after or illusion-vs-reality contrast in the script",
  "narrative_summary": "2 sentences: what happens and why viewers MUST click",
  "forbidden_knowledge": "What secret does this video reveal that viewers don't know?",
  "stakes": "What is at risk? Why should viewer care RIGHT NOW?",
  "shorts_hook_frame": "${isShorts ? "Describe the EXACT first frame for this Short — what fills the vertical frame, what text appears, what stops the scroll in 0.3 seconds" : "N/A"}"
}`, 0.9, 4096);

    console.log("Phase 0 done. Hook: " + (script_essence.emotional_hook || 'unknown'));
    // Build selected template DNA context if user chose templates
const templateContext = selected_templates?.length > 0
  ? buildTemplateContext(selected_templates)
  : '';

// Function to build template DNA context string
function buildTemplateContext(templateIds) {
  const TEMPLATE_DNA = {
    shock_face:          { name:"The Shock Face",           face_emotion:"EXTREME SHOCK: eyes blown wide, eyebrows maximum arch, jaw dropped in O shape, both hands to cheeks. Must be readable at 120px.", text_formula:"SHOCKING NUMBER or PAINFUL OUTCOME. MAX 4 WORDS.", color:"DARK background + ELECTRIC YELLOW text.", composition:"Face 45-55% of frame, rule-of-thirds. Rim light for separation." },
    income_reveal:       { name:"The Income Reveal",        face_emotion:"PROUD CONFIDENCE: chest out, chin raised, calm knowing smile. Genuine pride.", text_formula:"SPECIFIC ODD DOLLAR AMOUNT + TIME. e.g. '$47,382 IN 6 MONTHS'.", color:"DARK background + NEON GREEN dollar amount + GOLD accent.", composition:"Dollar amount centered-large, proof element slightly blurred background." },
    warning_alert:       { name:"The Warning / Alert",      face_emotion:"URGENT WARNING: intense stare, furrowed brows, jaw set, pointing finger at viewer.", text_formula:"STOP [THIS] or WARNING: [OUTCOME]. MAX 4 WORDS.", color:"DEEP RED dominant + WHITE/YELLOW text + ⚠️ symbol.", composition:"Warning symbol top-left, text center, subject center-right." },
    secret_hidden:       { name:"The Secret / Hidden Truth",face_emotion:"CONSPIRATORIAL: finger to lips, sideways glance, knowing half-smile.", text_formula:"HIDDEN [TRUTH]. MAX 4 WORDS.", color:"NEAR BLACK + GOLD text + single dramatic spotlight.", composition:"Subject slightly off-center with dramatic lighting." },
    breaking_news:       { name:"The Breaking News",        face_emotion:"URGENT PRESENTER: pointing at chart, leaning forward, 'act now' energy.", text_formula:"BREAKING: [WHAT CHANGED]. MAX 5 WORDS.", color:"RED banner + WHITE text + DARK background.", composition:"News broadcast aesthetic, red alert banner." },
    before_after:        { name:"The Before / After Split", face_emotion:"LEFT: defeated/stressed | RIGHT: confident/liberated with genuine relief.", text_formula:"STATE → STATE. e.g. 'BROKE → $200K'.", color:"LEFT dark cold blues | RIGHT warm bright gold/green | CENTER sharp divider.", composition:"50/50 split with arrow divider center." },
    numbered_list:       { name:"The Numbered List Bomb",   face_emotion:"KNOWLEDGEABLE AUTHORITY: head tilt, confident half-smile, one finger raised.", text_formula:"ODD NUMBER + WHAT THEY WANT. e.g. '7 HABITS OF RICH'.", color:"Bold background + MASSIVE number in accent color.", composition:"Number large 25-35% of frame." },
    identity_challenge:  { name:"The Identity Challenge",   face_emotion:"DIRECT ACCUSATORY: eye contact, raised single eyebrow, pointing finger at lens, half-smirk.", text_formula:"IF YOU [DO THIS] = [IDENTITY]. MAX 5 WORDS.", color:"DARK PURPLE/blue + WHITE accent text.", composition:"Face pointing toward text, gesture bridges both." },
    finance_versus:      { name:"The Finance Versus",       face_emotion:"DECISIVE AUTHORITY: arms crossed, confident half-smile of someone who tested both options.", text_formula:"[OPTION A] VS [OPTION B]. MAX 5 WORDS.", color:"SPLIT — LEFT bold color + RIGHT contrasting color. VS center WHITE/YELLOW.", composition:"50/50 split, each half has own color and icon. VS divider center." },
    lifestyle_proof:     { name:"The Lifestyle Proof",      face_emotion:"CASUAL ABUNDANT CONFIDENCE: one hand on luxury item, other in pocket. Wealth is ordinary now.", text_formula:"LUXURY ITEM + HOW FUNDED. e.g. 'MY LAMBO PAID BY YOUTUBE'.", color:"DARK background + GOLD text + luxury item glamour.", composition:"Luxury item 50-60% of frame. Income source in large text." },
    finance_audit:       { name:"The Finance Audit",        face_emotion:"AUDITOR'S HORROR-DISBELIEF: eyes wide squinting, head tilted back, hand to temple, grimace of 'HOW did this happen'. Pained disbelief. Gaze directed RIGHT at the data.", text_formula:"FINANCIAL DISASTER NUMBER + WHO. e.g. '$200K DEBT AT 23'.", color:"SPLIT — auditor face left (dark) + financial data right (clinical/red numbers).", composition:"Auditor pained face left-third + financial breakdown data right-two-thirds." },
    cliffhanger:         { name:"The Cliffhanger",          face_emotion:"TENSE ANTICIPATION: eyes slightly wide looking OFF-FRAME, jaw tensed, one hand mid-gesture, frozen at moment before everything changes. NOT at camera.", text_formula:"INCOMPLETE REVELATION + ellipsis. e.g. 'SHE LEFT EVERYTHING...'.", color:"WARM AMBER to DEEP ORANGE gradient + heavy sepia grade.", composition:"Subject in dramatic mid-action looking into negative space." },
    true_account:        { name:"The True Account",         face_emotion:"DOCUMENTARY SUBJECT: calm but haunted expression, slightly off-camera gaze.", text_formula:"TRUE STORY: [WHAT HAPPENED].", color:"DESATURATED muted tones + yellowed newspaper aesthetic.", composition:"Documentary aesthetic, file folder or newspaper texture." },
    cold_case_file:      { name:"The Cold Case File",       face_emotion:"HAUNTED: troubled expression, dark circles, looking down or away, residual fear.", text_formula:"THE [CRIME] THAT [OUTCOME]. e.g. 'THE MURDER NOBODY SOLVED'.", color:"NEAR BLACK + BLOOD RED accent + YELLOW evidence highlight.", composition:"Evidence board aesthetic: polaroids, red string, case stamps." },
    suspect_reveal:      { name:"The Suspect Reveal",       face_emotion:"HALF-SHADOWED AMBIGUITY: exactly half face in deep shadow, one eye visible with penetrating gaze.", text_formula:"ACCUSATORY WITHOUT CONFIRMING. e.g. 'SHE SMILED AT THE FUNERAL'.", color:"PURE BLACK + SINGLE harsh light + POLICE YELLOW tape.", composition:"50% deep shadow, 50% harsh revelation light." },
    heartbreak_headline: { name:"The Heartbreak Headline",  face_emotion:"RAW EMOTIONAL PAIN — NOT staged: eyes red-rimmed or glistening with real tears, lower lip trembling, shoulders slightly collapsed. ZERO performance.", text_formula:"UNRESOLVED PAINFUL MOMENT. Short and specific.", color:"DESATURATED dark blues + single warm light on face + heavy vignette.", composition:"Desaturated environment, face has only warmth." },
    relationship_red_flag:{ name:"The Relationship Red Flag",face_emotion:"PROTECTIVE WARNING: raised eyebrow skepticism + caring urgency. Stop gesture or crossed arms protectively.", text_formula:"DIRECT CHALLENGE. e.g. 'IF HE DOES THIS — RUN'.", color:"RED dominant + WHITE thick-outline text + red flag element.", composition:"Warning/protective pose with strong eye contact." },
    destination_wow:     { name:"The Destination Wow Shot", face_emotion:"AWESTRUCK JOY: jaw slightly dropped, eyes wide with genuine wonder, arms spread embracing view.", text_formula:"[PLACE] FOR $AMOUNT. e.g. 'MALDIVES FOR $800'.", color:"ULTRA-VIVID SATURATED landscape + golden hour light.", composition:"Wide cinematic shot, small human for SCALE, destination 75-80% of frame." },
    hidden_gem:          { name:"The Hidden Gem Reveal",    face_emotion:"DISCOVERER'S EXCITEMENT: genuine surprise-joy, pointing at discovery, breathless secret-sharing energy.", text_formula:"EXCLUSIVITY + PLACE. e.g. 'HIDDEN BEACH NOBODY KNOWS'.", color:"LUSH natural greens + crystal azure blues.", composition:"No tourist infrastructure. Sense of private discovery." },
    ai_takeover:         { name:"The AI Takeover Frame",    face_emotion:"ALARMED URGENCY: wide eyes of someone who saw the threat, raised hand in stop gesture, forward lean.", text_formula:"AI THREAT + PERSONAL IMPACT. e.g. 'AI JUST REPLACED 10K JOBS'.", color:"ELECTRIC NEON BLUE on NEAR BLACK + purple AI circuit aesthetic.", composition:"AI/robot element dominant and threatening." },
    cheat_code_reveal:   { name:"The Cheat Code Reveal",    face_emotion:"CONSPIRATORIAL SECRET SHARER: leaning forward, one eyebrow raised, half-smile of giving forbidden access.", text_formula:"TIME/EFFORT COMPRESSION. e.g. '10 HRS → 5 MINS'.", color:"DARK PURPLE + ELECTRIC CYAN + code/terminal aesthetic.", composition:"Tool/screen interface VISIBLE as proof." },
    tech_comparison:     { name:"The Tech Comparison",      face_emotion:"DECISIVE TESTING AUTHORITY: confident direct gaze, 'I've done the research' look.", text_formula:"[TOOL A] VS [TOOL B].", color:"SPLIT with tool brand colors on each side + bold VS center.", composition:"Logos/interfaces from each tool visible. VS divider center." },
    plot_twist_tease:    { name:"The Plot Twist Tease",     face_emotion:"MIND-BLOWN MAXIMUM: both hands on head, eyes at ABSOLUTE maximum width, mouth in O shape, leaning back from impact. NOT posed.", text_formula:"UNREVEALED MYSTERY. e.g. 'THE TWIST YOU MISSED'.", color:"CINEMATIC TEAL AND ORANGE + FILM GRAIN + GOLD highlight text.", composition:"SPLIT: reactor face 40% + cinematic scene 60%." },
    deep_lore_dive:      { name:"The Deep Lore Dive",       face_emotion:"DETECTIVE REVEAL: magnifying glass gesture, intensely focused, eureka single raised finger.", text_formula:"HIDDEN KNOWLEDGE. e.g. 'THE CLUE NOBODY NOTICED'.", color:"DARK mysterious tones + spotlight on key element + annotation arrows.", composition:"Icon/symbol from IP with dramatic spotlight." },
    reaction_recap:      { name:"The Reaction Recap",       face_emotion:"COMPLETELY AUTHENTIC UNFILTERED: real tears, genuine crinkle-eye laugh, or hand covering mouth in gasp. ZERO performance, ZERO posing.", text_formula:"EMOTIONAL REACTION + SUBJECT. e.g. 'I CRIED 3 TIMES'.", color:"SPLIT: warm natural lighting on face + content-matched grade.", composition:"40-50% authentic reaction face + 50-60% content being reacted to." },
    shorts_hook_frame:   { name:"The Shorts Hook Frame",    face_emotion:"EXTREME VERSION of video's core emotion amplified 200%.", text_formula:"1-2 LINES MAX. POV hook or shocking statement.", color:"SINGLE BOLD background + WHITE/NEON text top 30%.", composition:"VERTICAL 9:16. Text top 30%. Subject bottom 70%." },
  };

  return templateIds.map((id, i) => {
    const t = TEMPLATE_DNA[id];
    if (!t) return `TEMPLATE ${i+1}: ${id} (use its standard DNA)`;
    return `
TEMPLATE ${i+1} — "${t.name}" (ID: ${id})
FACE/EMOTION LAW: ${t.face_emotion}
TEXT FORMULA: ${t.text_formula}
COLOR SYSTEM: ${t.color}
COMPOSITION: ${t.composition}
RULE: Concept ${i+1} MUST use this template. All phase outputs for concept ${i+1} must implement this template's DNA exactly.`.trim();
  }).join('\n\n');
}

    await new Promise(r => setTimeout(r, 2000));

    // ──────────────────────────────────────────────────────────────
    // PHASE 1: TEXT ENGINE — template-driven copy generation
    // ──────────────────────────────────────────────────────────────
    console.log("Phase 1: Text engine");

    const shortsTextRules = isShorts ? `
=== SHORTS-SPECIFIC TEXT RULES ===
- This is a SHORT. Text must stop the scroll in 0.3 SECONDS.
- POV format preferred: "POV: They lied about money"
- Or shocking statement: "The $10 secret nobody tells you"
- Or cliffhanger: "Stop scrolling — this saves you $1000"
- VERTICAL frame: text fills top 30%, subject fills bottom 70%
- 1-2 lines MAXIMUM. Larger than you think necessary.
- First frame IS the thumbnail — no thumbnails in Shorts, first frame shown as preview
` : '';

    const p1 = await gemini(`You are an elite YouTube thumbnail copywriter achieving extremely high CTR. Every word is a psychological trigger.

${templateDNABlock}

=== TEMPLATE-DRIVEN TEXT RULES ===
PRIMARY TEMPLATE: "${primaryTemplate.name}"
TEXT FORMULA TO FOLLOW: ${primaryTemplate.text_formula}
COLOR SYSTEM TO USE: ${primaryTemplate.color}
PSYCHOLOGY TO TRIGGER: ${primaryTemplate.psychology}

=== UNIVERSAL TEXT RULES ===
- MAX 4 WORDS per option (at least 2 must be 3 words or fewer)
- ALL CAPS always
- Use POWER WORDS: secret, hidden, banned, exposed, deadly, shocking, impossible, truth, broke, revealed
- Each text MUST spark: curiosity, FOMO, surprise, urgency, or exclusivity
- NO generic phrases ("You Won't Believe", "Watch This", "Amazing")
- Text MUST reference THIS script's specific topic — not generic finance/crime/etc.
- Text COMPLEMENTS the video title, does NOT duplicate it

=== HIGH-CONTRAST COLOR PAIRS (MANDATORY — pick from these) ===
- Yellow (#FFD700) + Black → maximum attention
- White + Navy/Dark blue → clean professional  
- Electric Blue + Orange → strong professional
- Red (#FF3B30) + Cyan/Teal → energetic bright
- Green + White → fresh credible
- Orange + Indigo/Dark → warm bold
AVOID: red alone (blends with YouTube UI), similar-temperature colors side-by-side

=== TEXT STYLING ===
- Font: Impact or Montserrat Black ONLY — thick, bold, condensed
- ALL text needs thick dark outline (6px min) OR sits on contrasting block
- MUST be readable at 120px thumbnail width on mobile
- Position: upper-left or upper-center ONLY — NEVER bottom-right (YouTube timestamp zone)

${shortsTextRules}

VIDEO: "${topicTitle}" | TITLE: "${script.title}" | NICHE: "${project.niche}"${titleCtx}
SCRIPT ESSENCE: ${JSON.stringify(script_essence)}

Step 1: Extract script anchors:
- villain_object (the thing causing the problem)
- victim_object (what's being harmed)  
- trap_symbol (the mechanism of deception/danger)
- shock_data (specific number or statistic from script)
- contrast_pair: illusion vs reality
- niche_objects: 3-5 items viewers of this niche instantly recognize

Step 2: Generate 10 text options following the PRIMARY TEMPLATE formula.
- 4 using curiosity gap technique
- 3 using forbidden knowledge / secret revelation  
- 3 using shock / contradiction / identity challenge
At least 3 options must be 3 words or fewer.
At least 2 options must use a SPECIFIC number from the script.

Step 3: Score each for CTR potential 1-10. Pick top 3 winners.
MANDATORY: At least 1 winner must be 4 words or fewer.

JSON: {
  "script_anchors": {
    "villain_object": "", "victim_object": "", "trap_symbol": "",
    "shock_data": "", "contrast_pair": {"illusion":"","reality":""},
    "niche_objects": []
  },
  "script_climax": "",
  "curiosity_gap_identified": "",
  "text_options": [{
    "rank": 1, "text": "", "word_count": 2,
    "category": "curiosity_gap|forbidden_knowledge|shock_contradiction|identity_challenge",
    "text_color_name": "", "text_hex": "",
    "background_color_name": "", "background_hex": "",
    "contrast_pair_name": "e.g. Yellow & Black",
    "outline": "6px thick black outline",
    "shadow": "heavy drop shadow 3px offset",
    "container": "raw|box|pill|banner",
    "position": "upper-left|upper-center",
    "size": "massive",
    "font_style": "Impact",
    "template_alignment": "which template DNA rule this follows",
    "psychological_hook": "why this word combination triggers a click",
    "mobile_readable": true,
    "ctr_score": 9
  }],
  "top_3_winners": [1, 2, 3],
  "shorts_first_frame_text": "${isShorts ? "The exact text for the Shorts first frame" : "N/A"}"
}`, 0.95, 5000);

    const allTexts = p1.text_options || [];
    const top3 = p1.top_3_winners || [1, 2, 3];
    const winners = top3.map(r => allTexts.find(t => t.rank === r) || allTexts[r-1]).filter(Boolean).slice(0, 3);
    while (winners.length < 3 && allTexts.length > winners.length) {
      const n = allTexts.find(t => !winners.includes(t));
      if (n) winners.push(n); else break;
    }
    const anchors = p1.script_anchors || {};
    console.log("Phase 1 done: " + winners.length + " winners | " + winners.map(w=>'"'+w.text+'"').join(', '));
    await new Promise(r => setTimeout(r, 2000));

    // ──────────────────────────────────────────────────────────────
    // PHASE 2: VISUAL COMPOSITION — template-guided 3-element design
    // ──────────────────────────────────────────────────────────────
    console.log("Phase 2: Visual composition");

    const aspectNote = isShorts
      ? "SHORTS FORMAT: 9:16 VERTICAL aspect ratio. Compose for phone screen, vertical framing. Text top 30%, subject bottom 70%."
      : "STANDARD FORMAT: 16:9 LANDSCAPE. 1920x1080. Standard YouTube thumbnail dimensions.";

    const p2 = await gemini(`You are a world-class thumbnail visual architect. Design 3 concepts using THREE-ELEMENT COMPOSITION: Subject + Text + Background.

${templateDNABlock}

=== FORMAT ===
${aspectNote}

=== COMPOSITION RULES ===
RULE OF THIRDS: Key elements at grid intersections — never dead center.
FOCAL POINT: 1 dominant subject + 1 headline text block. Clarity beats complexity.
SUBJECT SEPARATION: Subject MUST pop from background — rim lighting, drop shadow, edge glow.
NEGATIVE SPACE: Breathing room around text. Never crowd.
DEAD ZONE: Bottom-right ALWAYS empty (YouTube timestamp badge).
TEXT PLACEMENT: Upper-left or upper-center ONLY.

=== FACE/EMOTION MANDATE ===
Primary template "${primaryTemplate.name}" specifies:
EXACT EXPRESSION REQUIRED: ${primaryTemplate.face_emotion}
Face required: ${primaryTemplate.face_required}
${primaryTemplate.face_required ? "This expression MUST be rendered accurately. The face expression IS the CTR driver. A wrong or flat expression = 2% CTR instead of 10%." : "This template is OBJECT/GRAPHIC driven. No face needed unless script strongly suggests one."}

=== BACKGROUND RULES ===
- Background DIRECTLY tied to video topic — no random generic backdrops
- Slightly blurred OR desaturated to make subject + text pop
- Heavy bokeh or atmospheric effects for depth separation

VIDEO: "${topicTitle}" | TITLE: "${script.title}" | STYLE: "${style}"${nicheCtx}
ANCHORS: ${JSON.stringify(anchors)}
WINNING TEXTS: ${JSON.stringify(winners)}
SCRIPT ESSENCE: ${JSON.stringify(script_essence)}
PRIMARY TEMPLATE: ${primaryTemplate.name} | ${primaryTemplate.composition}

Design EXACTLY 3 concepts — one per winning text. 300+ word description each.
All characters FICTIONAL. Bottom-right ALWAYS clear.

JSON: {"concepts":[{
  "rank": 1,
  "template_used": "${primaryTemplate.id}",
  "winning_text": "",
  "winning_text_design": {
    "color": "", "color_hex": "",
    "outline": "6px thick black outline",
    "shadow": "heavy drop shadow",
    "container": "raw|semi-transparent box|banner",
    "position": "upper-left|upper-center",
    "size": "massive — fills 20-25% of frame height",
    "font_style": "Impact",
    "mobile_readable": true
  },
  "element_1_subject": {
    "face_expression": "${primaryTemplate.face_emotion.substring(0,150)}",
    "hook_type": "emotion|object|data|comparison",
    "description": "300+ word description incorporating script visual element and exact face expression",
    "anchor_object": "",
    "position_on_grid": "rule-of-thirds intersection (left/right third)",
    "crop": "chest-up for face templates, full for object templates",
    "separation_method": "rim light + drop shadow OR object glow + separation lighting",
    "clothing_or_visual_details": "specific details from script niche"
  },
  "element_3_background": {
    "dominant_color": "",
    "blur_level": "heavy bokeh",
    "vignette": "heavy on all edges",
    "desaturation": "slight (20-30%)",
    "atmospheric_effects": "haze|particles|lens_flare|god_rays",
    "anchor_echo": "background element that reflects script's core conflict",
    "psychological_purpose": "what this background communicates emotionally"
  },
  "negative_space_zones": "where empty space is and why",
  "template_type": "${primaryTemplate.id}",
  "emotional_trigger": "${primaryTemplate.psychology}",
  "scroll_stop_reason": "specific reason this stops the scroll at 120px preview size",
  "forensic_description": "300+ word complete visual description"
}]}`, 0.9, 7000);

    await new Promise(r => setTimeout(r, 2000));

    // ──────────────────────────────────────────────────────────────
    // PHASE 3: IMAGE PROMPTS — Ideogram-optimized generation
    // ──────────────────────────────────────────────────────────────
    let p2concepts = [];
    if (Array.isArray(p2)) p2concepts = p2;
    else if (Array.isArray(p2?.concepts)) p2concepts = p2.concepts;
    else if (Array.isArray(p2?.thumbnails)) p2concepts = p2.thumbnails;
    else for (const val of Object.values(p2||{})) { if (Array.isArray(val) && val.length) { p2concepts = val; break; } }

    // Pad to 3 if needed
    while (p2concepts.length < 3) {
      const w = winners[p2concepts.length] || winners[0];
      p2concepts.push({
        rank: p2concepts.length + 1,
        template_used: primaryTemplate.id,
        winning_text: w?.text || '',
        element_1_subject: { description: script_essence.impactful_visual_element || 'dramatic subject', face_expression: primaryTemplate.face_emotion || '' },
        element_3_background: { dominant_color: 'dark', blur_level: 'heavy bokeh', vignette: 'heavy' },
        forensic_description: 'Auto-concept from: ' + (w?.text || '')
      });
    }

    console.log("Phase 3: Image prompts for " + p2concepts.length + " concepts");

    const styleDesc = style.includes('anime') ? 'anime style' : style.includes('oil') ? 'oil painting style' : style.includes('comic') ? 'comic book style' : 'cinematic photorealistic 4K HDR';
    const dimensionSpec = isShorts ? "1080x1920 Full HD 9:16 vertical YouTube Shorts thumbnail" : "1920x1080 Full HD 16:9 landscape YouTube thumbnail";

    const p3 = await gemini(`You are an elite Ideogram V3 prompt engineer specializing in viral YouTube thumbnails achieving 10M+ views.

${templateDNABlock}

=== IDEOGRAM TEXT RENDERING (CRITICAL) ===
Ideogram renders text ONLY when it appears in "DOUBLE QUOTATION MARKS" in the prompt.
ALL overlay text MUST be in quotation marks. Do NOT put text in backticks or single quotes.
Text must be MASSIVE, BOLD, Impact or Bebas Neue font.
Text MUST have high-contrast outline: white text → thick black outline; dark text → white/bright outline.

=== DIMENSION & COMPOSITION ===
${isShorts ? "FORMAT: 1080x1920 Full HD 9:16 VERTICAL YouTube Shorts. Text fills top 30% of vertical frame. Subject fills bottom 70%. NO horizontal composition." : "FORMAT: 1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail."}
RULE OF THIRDS: Subject at grid intersection, never dead center.
FOCAL POINT: ONE dominant subject + ONE text block.
DEAD ZONE: Bottom-right ALWAYS empty — YouTube timestamp badge zone.
SUBJECT SEPARATION: Rim lighting, drop shadow, or edge glow — subject must pop at tiny size.
BACKGROUND: Topic-relevant, slightly blurred/desaturated. Heavy bokeh or atmospheric depth.

=== FACE/EMOTION REQUIREMENTS FROM PRIMARY TEMPLATE ===
Template: ${primaryTemplate.name}
MANDATORY EXPRESSION: ${primaryTemplate.face_emotion}
${primaryTemplate.face_required ? `
FACE RENDERING QUALITY REQUIREMENTS:
- Pore-level skin detail, professional studio lighting
- Expression readable and impactful at 120px thumbnail width
- Rim light on face edge for separation from background
- Eye contact with viewer (unless template specifies off-frame gaze)
- NOT a stock photo expression — authentic visceral emotion
- ${primaryTemplate.ideogram}` : `
This template is OBJECT/GRAPHIC driven. Focus on the visual element quality.
${primaryTemplate.ideogram}`}

=== STYLE ===
VISUAL STYLE: ${styleDesc}. All characters FICTIONAL. No real people. No violence. No gore.
Quality: 4K detail, professional lighting, cinematic color grading.
Color modifiers: ${primaryTemplate.color}

VIDEO: "${topicTitle}" | NICHE: "${project.niche}"
ANCHORS: ${JSON.stringify(anchors)}
CONCEPTS: ${JSON.stringify(p2concepts)}
SCRIPT ESSENCE: ${JSON.stringify(script_essence)}

Generate EXACTLY 3 thumbnail image prompts — one per concept.

For each concept write a 400+ word Ideogram prompt:
1. Opening: "${dimensionSpec}, graphic design composition"
2. If photorealistic humans: "photorealistic photograph, DSLR camera quality, NOT illustration, NOT cartoon, NOT 3D render"
3. Text element: EXACT overlay text in "QUOTATION MARKS", massive bold Impact font, specific color + thick outline + shadow + position
4. Subject: with template face expression, rule-of-thirds placement, separation technique, ${primaryTemplate.ideogram}
5. Background: topic-relevant, blurred/desaturated, atmospheric depth
6. Style/quality: ${styleDesc}, 4K, professional cinematic lighting
7. NO hex codes in prompt — use color names only (crimson red, electric yellow, royal blue, etc.)
8. At VERY END: "Critical text overlays: [list each text in quotation marks]"

CRITICAL: Output EXACTLY 3 objects in the thumbnails array.

JSON: {"thumbnails":[{
  "rank": 1,
  "template_type": "${primaryTemplate.id}",
  "concept_description": "",
  "text_overlay": "",
  "text_design": {
    "color": "", "outline": "thick black outline 6px",
    "shadow": "heavy drop shadow", "container": "",
    "position": "upper-left|upper-center",
    "size": "massive", "font_style": "Impact"
  },
  "subject_design": {
    "hook_type": "",
    "face_expression": "${primaryTemplate.face_emotion.substring(0,100)}",
    "grid_position": "left-third rule-of-thirds|right-third rule-of-thirds",
    "anchor_object": "",
    "crop": "chest-up|waist-up|full-body",
    "separation": "rim light left + drop shadow"
  },
  "background_design": {
    "dominant_color": "", "atmosphere": "",
    "blur": "heavy bokeh", "desaturation": "slight 20%",
    "anchor_echo": ""
  },
  "emotional_hook": "${primaryTemplate.psychology}",
  "scroll_stop_reason": "",
  "color_scheme": "",
  "style_reference": "cinema",
  "ctr_score": 9,
  "negative_prompt": "blurry, low quality, pixelated, watermark, distorted text, small text, cluttered, text in bottom-right, text at bottom edge, low contrast text, muted colors, too many elements, flat lighting, stock photo expression, generic smile",
  "image_prompt": ""
},{
  "rank": 2,
  "template_type": "${selectedTemplates[1]?.id || primaryTemplate.id}",
  "concept_description": "", "text_overlay": "",
  "text_design": { "color": "", "outline": "thick black outline 6px", "shadow": "heavy drop shadow", "container": "", "position": "upper-center", "size": "massive", "font_style": "Impact" },
  "subject_design": { "hook_type": "", "face_expression": "", "grid_position": "", "anchor_object": "", "crop": "", "separation": "rim light + edge glow" },
  "background_design": { "dominant_color": "", "atmosphere": "", "blur": "heavy bokeh", "desaturation": "slight", "anchor_echo": "" },
  "emotional_hook": "", "scroll_stop_reason": "", "color_scheme": "", "style_reference": "cinema", "ctr_score": 9,
  "negative_prompt": "blurry, low quality, pixelated, watermark, distorted text, small text, text in bottom-right, flat expression, stock smile",
  "image_prompt": ""
},{
  "rank": 3,
  "template_type": "${selectedTemplates[2]?.id || primaryTemplate.id}",
  "concept_description": "", "text_overlay": "",
  "text_design": { "color": "", "outline": "thick black outline 6px", "shadow": "heavy drop shadow", "container": "", "position": "upper-left", "size": "massive", "font_style": "Impact" },
  "subject_design": { "hook_type": "", "face_expression": "", "grid_position": "", "anchor_object": "", "crop": "", "separation": "subject edge glow" },
  "background_design": { "dominant_color": "", "atmosphere": "", "blur": "heavy bokeh", "desaturation": "slight", "anchor_echo": "" },
  "emotional_hook": "", "scroll_stop_reason": "", "color_scheme": "", "style_reference": "cinema", "ctr_score": 9,
  "negative_prompt": "blurry, low quality, pixelated, watermark, distorted text, small text, text in bottom-right",
  "image_prompt": ""
}]}`, 0.85, 7000);

    // ──────────────────────────────────────────────────────────────
    // SAVE + GENERATE IMAGES
    // ──────────────────────────────────────────────────────────────
    try {
      const ex = await base44.entities.ThumbnailConcepts.filter({ project_id });
      await Promise.all(ex.map(e => base44.entities.ThumbnailConcepts.delete(e.id)));
    } catch (_) {}

    let thumbs = [];
    if (Array.isArray(p3)) thumbs = p3;
    else if (Array.isArray(p3?.thumbnails)) thumbs = p3.thumbnails;
    else if (Array.isArray(p3?.concepts)) thumbs = p3.concepts;
    else for (const val of Object.values(p3||{})) { if (Array.isArray(val) && val.length) { thumbs = val; break; } }

    console.log("Phase 3 returned " + thumbs.length + " thumbnails");

    const saved = await Promise.all(thumbs.map(async (t, i) => {
      let ip = t.image_prompt || '';
      const textToOverlay = t.text_overlay || '';

      // Force overlay text into Ideogram quotation marks
      if (textToOverlay && !ip.includes(`"${textToOverlay}"`)) {
        ip = `"${textToOverlay}" in massive bold Impact font with thick black outline and heavy drop shadow, positioned upper-${i===1?'center':'left'}. ` + ip;
      }

      // Force dimension spec
      if (!ip.includes('1920x1080') && !ip.includes('1080x1920') && !ip.includes('16:9') && !ip.includes('9:16')) {
        ip = dimensionSpec + ". " + ip;
      }

      // Reinforce text block at end for Ideogram
      if (textToOverlay) {
        ip += ` Critical text overlay that MUST appear clearly and legibly: "${textToOverlay}". Large bold Impact font, maximum contrast, thick outline.`;
      }

      const tmplUsed = TEMPLATE_DNA[t.template_type] || primaryTemplate;

      try {
        const rec = await base44.entities.ThumbnailConcepts.create({
          project_id, rank: t.rank || i + 1,
          concept_description: `[${t.template_type||''}] ${t.concept_description||''} | CTR Target: ${tmplUsed.ctr} | Template: ${tmplUsed.name}`.substring(0, 2000),
          visual_metaphor: t.template_type || '',
          color_scheme: `${t.color_scheme||''} | ${t.visual_effects||''}`.substring(0, 500),
          text_overlay: textToOverlay.substring(0, 200),
          style_reference: t.style_reference || 'cinema',
          ctr_score: t.ctr_score || 8,
          image_prompt: ip,
          is_selected: false
        });
        return { ok: true, rec, ip, neg: t.negative_prompt, isShorts };
      } catch (e) { console.error("Save err:", e.message); return { ok: false }; }
    }));

    const good = saved.filter(s => s.ok);
    console.log(`Saved: ${good.length} concepts. Generating ${good.length} images...`);

    const results = await Promise.all(good.map(async ({ rec, ip, neg, isShorts: shorts }) => {
      try {
        const { url, model } = await genImage(KIE_KEY, ip, neg, shorts);
        if (url) {
          await base44.asServiceRole.entities.ThumbnailConcepts.update(rec.id, { image_url: url });
          return { ...rec, image_url: url, model };
        }
        return { ...rec, image_url: null, model: 'failed' };
      } catch (e) { return { ...rec, image_url: null, model: 'error' }; }
    }));

    const imgCount = results.filter(r => r.image_url).length;
    console.log(`Done: ${imgCount}/${good.length} images | Templates: ${selectedTemplates.map(t=>t.name).join(' | ')}`);

    return Response.json({
      success: true, thumbnails: results,
      script_anchors: anchors, script_essence,
      template_selection: {
        detected_niche: project.niche || 'general',
        primary_template: primaryTemplate.name,
        all_templates: selectedTemplates.map(t => ({ id: t.id, name: t.name, ctr: t.ctr, power: t.power })),
        is_shorts: isShorts
      },
      text_engine: { script_climax: p1?.script_climax, all_text_options: allTexts, winning_texts: winners },
      meta: { total_concepts: good.length, total_images: imgCount, phases: 4, shorts_mode: isShorts }
    });

  } catch (error) {
    console.error("Error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});