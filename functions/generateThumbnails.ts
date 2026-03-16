import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ══════════════════════════════════════════════════════════════════
// THUMBNAIL CONCEPTS v5 — Single-Call + Template Auto-Select
// Template DNA Vault: 26 templates × 7 niches injected
// Face/Emotion Intelligence: per-template expression specs
// Shorts Detection: auto-switches to vertical 9:16 hook frame
// CTR Target: 8-12% | View Target: 10M+
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

async function kieCreateTask(apiKey, model, input) {
  const res = await fetch(`${KIE_BASE}/createTask`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input })
  });
  const result = await res.json();
  if (!res.ok || result.code !== 200) throw new Error(`Kie createTask (${model}): ${result.msg || JSON.stringify(result)}`);
  return result.data.taskId;
}

async function kiePollResult(apiKey, taskId, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, { headers: { "Authorization": `Bearer ${apiKey}` } });
    const poll = await res.json();
    if (poll.code !== 200) continue;
    const state = poll.data?.state;
    if (state === "success") {
      const rj = JSON.parse(poll.data.resultJson || "{}");
      return rj.resultUrls?.[0] || rj.url || rj.imageUrl || null;
    }
    if (state === "fail") throw new Error(poll.data?.failMsg || "Task failed");
  }
  throw new Error(`Task ${taskId} timed out`);
}

async function generateThumbnailImage(apiKey, imagePrompt, negativePrompt, isShorts = false) {
  const imageSize = isShorts ? "portrait_9_16" : "landscape_16_9";

  try {
    console.log(`[Ideogram V3 QUALITY] Generating...`);
    const taskId = await kieCreateTask(apiKey, "ideogram/v3-text-to-image", {
      prompt: `${imagePrompt}. Ultra high resolution, crisp sharp details, professional quality.`,
      image_size: imageSize, style: "DESIGN", rendering_speed: "QUALITY",
      expand_prompt: false,
       negative_prompt: "text, letters, numbers, typography, titles, labels, captions, watermark, signature, cluttered, text in bottom-right, flat lighting, stock photo expression"    });
    const url = await kiePollResult(apiKey, taskId);
    if (url) return { url, model: "ideogram/v3-quality" };
  } catch (e) { console.warn(`Ideogram V3 failed: ${e.message}`); }

  try {
    const taskId = await kieCreateTask(apiKey, "ideogram/v3-text-to-image", {
      prompt: `${imagePrompt.substring(0, 800)}. Professional YouTube thumbnail.`,
      image_size: imageSize, style: "DESIGN", rendering_speed: "BALANCED",
      expand_prompt: false, negative_prompt: negativePrompt || "blurry, low quality, watermark"
    });
    const url = await kiePollResult(apiKey, taskId);
    if (url) return { url, model: "ideogram/v3-balanced" };
  } catch (e) { console.warn(`Ideogram balanced failed: ${e.message}`); }

  try {
    console.log(`[Flux 2 Pro] Fallback...`);
    const taskId = await kieCreateTask(apiKey, "flux-2/pro-text-to-image", {
      prompt: `${imagePrompt}. Ultra high resolution.`,
      aspect_ratio: isShorts ? "9:16" : "16:9", resolution: "2K"
    });
    const url = await kiePollResult(apiKey, taskId);
    if (url) return { url, model: "flux-2/pro" };
  } catch (e) { console.warn(`Flux 2 failed: ${e.message}`); }

  return { url: null, model: "none" };
}

// ──────────────────────────────────────────────────────────────────
// GEMINI HELPER
// ──────────────────────────────────────────────────────────────────
function repairJSON(str) {
  return str
    .replace(/[\x00-\x1F\x7F]/g, c => c === '\n' || c === '\r' || c === '\t' ? c : ' ')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(["\w\d])\s*\n\s*"/g, '$1, "');
}

async function safeGeminiCall(prompt, temperature = 0.8) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: 8192, responseMimeType: "application/json" }
        })
      }
    );
    if (!response.ok) { const err = await response.json(); throw new Error(`Gemini ${response.status}: ${err.error?.message || "Unknown"}`); }
    const data = await response.json();
    if (!data.candidates?.length) throw new Error("No candidates from Gemini");
    const text = data.candidates[0].content.parts[0].text;
    try { return { success: true, data: JSON.parse(text) }; } catch (_) {}
    try { return { success: true, data: JSON.parse(repairJSON(text)) }; } catch (_) {}
    let jsonStr = text;
    if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
    else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();
    try { return { success: true, data: JSON.parse(repairJSON(jsonStr)) }; } catch (_) {}
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) return { success: true, data: JSON.parse(objMatch[0]) };
    throw new Error("Failed to parse Gemini JSON");
  } catch (error) {
    console.error("Gemini call failed:", error.message);
    return { success: false, error: error.message };
  }
}

// ══════════════════════════════════════════════════════════════════
// TEMPLATE DNA VAULT — 26 Templates × 7 Niches
// ══════════════════════════════════════════════════════════════════
const TEMPLATE_DNA = {
  shock_face: { id:"shock_face", name:"The Shock Face", niches:["finance","personal_finance","business","real_estate","make_money"], ctr:"8-12%", power:5, psychology:"Mirror neurons — viewer FEELS shock before processing text", face_required:true, face_emotion:"EXTREME SHOCK: eyes blown wide open to maximum, eyebrows raised at highest arch, jaw dropped open in O shape, both hands raised to cheeks or covering mouth, forehead creased with disbelief. Readable at 120px. Zero fakeness.", text_formula:"MAX 4 WORDS ALL CAPS. SHOCKING NUMBER or PAINFUL OUTCOME. e.g. '$130K STILL BROKE' or 'I LOST EVERYTHING'", color:"DARK background (#0a0a1a) + ELECTRIC YELLOW (#FFD700) or WHITE text + RED accent", signals:["money","income","salary","broke","budget","debt","invest","wealth","savings"], ideogram:"ultra-sharp facial features, pore-level skin detail, professional studio rim lighting, heavy background bokeh, cinematic color grade, face occupies 50% of frame" },
  income_reveal: { id:"income_reveal", name:"The Income Reveal", niches:["finance","make_money","side_hustle","investing","crypto","business"], ctr:"7-11%", power:5, psychology:"Aspiration + Social Proof", face_required:false, face_emotion:"PROUD CONFIDENCE: chest out, chin slightly raised, calm knowing smile. Genuine pride, not arrogance.", text_formula:"SPECIFIC ODD DOLLAR AMOUNT + TIME. e.g. '$47,382 IN 6 MONTHS'. Odd numbers = credibility.", color:"DARK background + NEON GREEN (#00C853) dollar amount + GOLD accent", signals:["income","made","earned","passive","per month","profit","revenue","side hustle"], ideogram:"money green color palette, neon dollar signs, financial success aesthetic, clean professional" },
  warning_alert: { id:"warning_alert", name:"The Warning/Alert", niches:["finance","health","crypto","news"], ctr:"7-10%", power:4, psychology:"Loss aversion — fear of losing beats desire to gain", face_required:false, face_emotion:"URGENT WARNING: intense stare into camera, eyebrows furrowed, jaw set, pointing finger at viewer.", text_formula:"STOP [THIS] or WARNING: [OUTCOME]. MAX 4 WORDS.", color:"DEEP RED dominant + WHITE/YELLOW text + thick black outline + ⚠️ symbol", signals:["stop","warning","danger","losing","mistake","avoid","wrong","trap","scam"], ideogram:"urgent red color scheme, high contrast warning aesthetic, bold typography" },
  secret_hidden: { id:"secret_hidden", name:"The Secret/Hidden Truth", niches:["finance","health","business"], ctr:"7-10%", power:4, psychology:"Information gap + exclusivity", face_required:false, face_emotion:"CONSPIRATORIAL: finger to lips, sideways glance, knowing half-smile, forbidden knowledge energy.", text_formula:"HIDDEN [TRUTH]. MAX 4 WORDS. e.g. 'HIDDEN BANK SECRET'", color:"NEAR BLACK + GOLD text + single dramatic spotlight", signals:["secret","hidden","truth","they","banks","nobody tells"], ideogram:"noir mystery lighting, single dramatic spotlight, dark atmospheric shadows" },
  breaking_news: { id:"breaking_news", name:"The Breaking News", niches:["finance","crypto","stocks","news"], ctr:"7-11%", power:5, psychology:"FOMO + urgency", face_required:false, face_emotion:"URGENT PRESENTER: pointing at chart, leaning toward camera, 'act now' energy.", text_formula:"BREAKING: [WHAT CHANGED]. MAX 5 WORDS.", color:"NEWS RED banner + WHITE text + DARK background + YELLOW accent", signals:["just","now","breaking","announced","changed","crashed","surged","today"], ideogram:"news broadcast aesthetic, red alert banner, urgent graphics" },
  before_after: { id:"before_after", name:"The Before/After Split", niches:["finance","fitness","transformation","budgeting"], ctr:"6-10%", power:4, psychology:"Transformation desire", face_required:false, face_emotion:"LEFT: defeated/stressed | RIGHT: confident/liberated with genuine relief smile", text_formula:"STATE_A → STATE_B. e.g. 'BROKE → $200K'", color:"LEFT: dark cold blues | RIGHT: warm bright gold/green | CENTER: sharp divider", signals:["before","after","transformation","went from","debt free","financial freedom"], ideogram:"split composition, warm vs cold contrast, transformation aesthetic" },
  numbered_list: { id:"numbered_list", name:"The Numbered List Bomb", niches:["finance","productivity","self_improvement"], ctr:"5-9%", power:3, psychology:"Listicle brain — feels completable", face_required:false, face_emotion:"KNOWLEDGEABLE AUTHORITY: head tilt, confident half-smile, one finger raised.", text_formula:"ODD NUMBER + WHAT THEY WANT. e.g. '7 HABITS OF RICH'", color:"Bold background + MASSIVE number in accent color + white text", signals:["habits","ways","things","tips","steps","rules","secrets"], ideogram:"bold graphic design, large number typography, clean modern aesthetic" },
  identity_challenge: { id:"identity_challenge", name:"The Identity Challenge", niches:["finance","self_help","mindset","relationships"], ctr:"6-8%", power:3, psychology:"Ego threat — click to defend identity", face_required:true, face_emotion:"DIRECT ACCUSATORY: eye contact + raised single eyebrow + pointing finger at lens + half-smirk. Friend calling you out.", text_formula:"IF YOU [DO THIS] = [IDENTITY]. MAX 5 WORDS. e.g. 'THIS HABIT = BROKE'", color:"DARK PURPLE/blue + WHITE accent text + pointing gesture", signals:["if you","you're","still doing","keeping you","poor mindset"], ideogram:"confrontational framing, purple dramatic background, pointing gesture" },
  finance_versus: { id:"finance_versus", name:"The Finance Versus", niches:["finance","real_estate","investing","personal_finance","make_money","crypto"], ctr:"6-9%", power:4, psychology:"Binary thinking + tribal loyalty — people are hardwired to pick a side and defend financial decisions that define their identity. Creates instant debate engagement.", face_required:false, face_emotion:"DECISIVE AUTHORITY: arms crossed with confident half-smile of someone who has tested BOTH sides and knows the answer. The trusted advisor who settles the debate. NOT smug.", text_formula:"[OPTION A] VS [OPTION B] — financial, personal, stakes-driven. e.g. 'RENTING VS BUYING' or 'STOCKS VS REAL ESTATE' or '401K VS ROTH IRA'. MAX 5 WORDS.", color:"SPLIT — LEFT bold color (deep blue) + RIGHT contrasting color (warm amber). VS center WHITE/YELLOW on dark. Each color IS the identity of its option.", composition:"Perfect 50/50 vertical split. Each half has its own color, icon/visual, mini label. VS divider center bold white or yellow. Winner side very slightly larger — teasing the answer.", signals:["vs","versus","renting","buying","stocks","bonds","real estate","401k","roth","crypto","index fund","etf","property","dividend","save","invest"], ideogram:"split composition design, bold color blocks each half, versus battle financial aesthetic, high contrast divider" },
  lifestyle_proof: { id:"lifestyle_proof", name:"The Lifestyle Proof", niches:["finance","make_money","side_hustle","business","youtube","creator_economy"], ctr:"6-9%", power:4, psychology:"Social proof + aspiration — showing the RESULT not the process creates instant credibility. The luxury item is evidence the strategy actually worked.", face_required:false, face_emotion:"CASUAL ABUNDANT CONFIDENCE: one hand casually touching luxury item (car/watch/house), other hand in pocket — body language of someone so comfortable with wealth it's ordinary now. NOT flexing. Just normal life that happens to include a Lamborghini.", text_formula:"LUXURY ITEM + HOW IT'S FUNDED or INCOME SOURCE. e.g. 'MY LAMBO PAID BY YOUTUBE' or '$12K/MONTH FROM MY PHONE' or 'HOW I BOUGHT THIS AT 24'. Specific dollar + specific method. MAX 5 WORDS.", color:"RICH dark background (navy/charcoal/black) + GOLD accent text (#FFD700) + luxury item's natural glamour. Aspirationally tasteful.", composition:"Luxury item occupies 50-60% of frame. Income number/source in large text. Person casually near item. Feels like evidence of success, not a flex.", signals:["lamborghini","lambo","ferrari","mansion","rolex","watch","passive income","youtube income","my car","bought","afford","paid for by","how i bought","at 24","at 25","makes me","pays for"], ideogram:"luxury lifestyle photography, high-end product cinematography, wealth aesthetic dark background, gold accent, aspirational composition" },
  finance_audit: { id:"finance_audit", name:"The Finance Audit Reaction", niches:["finance","personal_finance","budgeting","debt","make_money"], ctr:"6-9%", power:4, psychology:"Vicarious learning + rubbernecking — watching someone else's financial disaster feels safe and educational. Caleb Hammer built 2M subscribers purely on this psychology.", face_required:true, face_emotion:"AUDITOR'S HORROR-DISBELIEF: eyes wide and slightly squinting as if looking at something painful, head tilted slightly back or to the side, one hand raised to temple or jaw, mouth open in a grimace that says 'HOW did this happen' — pained disbelief mixed with dark humor. NOT angry. Genuinely pained by what they're seeing. The Caleb Hammer face. The face of a financial expert confronting a truly catastrophic budget.", face_position:"left-third, chest-up, gaze directed RIGHT toward the financial data — the gaze direction pulls the viewer's eye to the numbers.", text_formula:"FINANCIAL DISASTER NUMBER + WHO. e.g. '$200K DEBT AT 23' or 'REACTING TO $0 SAVINGS AT 40' or 'SHE MAKES $80K AND IS BROKE'. Specific number + specific person situation. MAX 5 WORDS.", color:"SPLIT — auditor face left (neutral/dark bg) + financial data right (clinical white or dark with red numbers). RED = debt. GREEN = income. The color-coded data IS the horror.", composition:"SPLIT — auditor's pained reaction face left-third + subject's financial breakdown data right-two-thirds. OR: large shocking financial number dominates frame with small auditor face corner-reacting. NUMBER + FACE = complete story at 120px.", signals:["budget","audit","reaction","reacting","debt","broke","financial disaster","savings","income","expenses","net worth","spending","paycheck","financial review","how they spend","financial roast"], ideogram:"financial data chart visualization, clinical split composition, pained auditor reaction face, red debt numbers, Caleb Hammer financial audit aesthetic" },
  cliffhanger: { id:"cliffhanger", name:"The Cliffhanger Frame", niches:["storytelling","documentary","narrative","drama"], ctr:"7-11%", power:5, psychology:"Zeigarnik effect — open loop brain demands closure", face_required:true, face_emotion:"TENSE ANTICIPATION: eyes slightly wide looking OFF-FRAME at something unseen, jaw tensed, one hand mid-gesture, frozen at moment before everything changes. NOT at camera.", text_formula:"INCOMPLETE REVELATION with ellipsis. e.g. 'SHE LEFT EVERYTHING...' or 'NOBODY KNEW UNTIL...'", color:"WARM AMBER to DEEP ORANGE gradient + heavy sepia grade + dark crushing vignette", signals:["story","happened","she","he","they","journey","night","discovered","found out"], ideogram:"cinematic amber warm color grade, dramatic vignette, storytelling aesthetic, mid-action frozen moment" },
  true_account: { id:"true_account", name:"The True Account Banner", niches:["storytelling","documentary","true_crime","history"], ctr:"6-9%", power:3, psychology:"Reality anchoring — 'TRUE STORY' = forbidden knowledge", face_required:false, face_emotion:"DOCUMENTARY SUBJECT: calm haunted expression, natural unstyled look, slightly off-camera gaze.", text_formula:"TRUE STORY: [WHAT HAPPENED]. 'TRUE STORY' label is massive trust signal.", color:"DESATURATED muted tones + yellowed newspaper aesthetic + muted ambers", signals:["true","real","based","actual","documented","happened","case"], ideogram:"documentary film aesthetic, desaturated vintage tones, case file newspaper texture" },
  cold_case_file: { id:"cold_case_file", name:"The Cold Case File", niches:["true_crime","documentary","mystery","crime"], ctr:"8-12%", power:5, psychology:"Justice obsession + morbid curiosity — hardwired to solve mysteries", face_required:false, face_emotion:"HAUNTED: troubled expression, dark circles, looking down or away, vulnerability mixed with fear — someone who witnessed something terrible.", text_formula:"THE [CRIME] THAT [UNSOLVED OUTCOME]. e.g. 'THE MURDER NOBODY SOLVED'", color:"NEAR BLACK + BLOOD RED accent + YELLOW evidence highlight", signals:["murder","crime","killer","suspect","case","investigation","disappeared","unsolved","confession"], ideogram:"crime investigation aesthetic, evidence board composition, noir lighting, red and black palette" },
  suspect_reveal: { id:"suspect_reveal", name:"The Suspect Reveal", niches:["true_crime","mystery","thriller"], ctr:"7-10%", power:4, psychology:"Accusation trigger — wired to stare at the accused", face_required:true, face_emotion:"HALF-SHADOWED AMBIGUITY: exactly half face in deep shadow, visible half shows either intense suspicious stare OR unsettling calm normalcy. One eye visible with penetrating gaze viewers cannot look away from.", text_formula:"ACCUSATORY WITHOUT CONFIRMING. e.g. 'SHE SMILED AT THE FUNERAL' or 'THE LAST PERSON SUSPECTED'", color:"PURE BLACK + SINGLE harsh light + POLICE YELLOW tape element", signals:["suspect","killer","guilty","innocent","confession","who did it"], ideogram:"chiaroscuro half-shadow lighting, dramatic single light source, crime thriller aesthetic" },
  heartbreak_headline: { id:"heartbreak_headline", name:"The Heartbreak Headline", niches:["relationships","love","dating","marriage"], ctr:"7-10%", power:5, psychology:"Emotional contagion — pain is most universally shared emotion", face_required:true, face_emotion:"RAW EMOTIONAL PAIN — NOT staged: eyes red-rimmed or glistening with real tears, lower lip slightly trembling, chin dimpled, shoulders slightly collapsed. Looking down OR into camera with soul-crushing vulnerability. Zero performance allowed.", text_formula:"UNRESOLVED PAINFUL MOMENT. Short, specific. e.g. 'HE LEFT WITHOUT A WORD' or 'SHE FOUND THE MESSAGES'", color:"DESATURATED dark blues and cold grays + single warm light on face + heavy vignette", signals:["love","relationship","broke up","cheated","left","heartbreak","marriage","toxic","ex","affair"], ideogram:"cold desaturated palette, emotional documentary lighting, single warm light on face, heavy vignette, raw vulnerability" },
  relationship_red_flag: { id:"relationship_red_flag", name:"The Relationship Red Flag", niches:["relationships","dating","self_help"], ctr:"6-9%", power:4, psychology:"Self-protection instinct — click to confirm or deny own situation", face_required:true, face_emotion:"PROTECTIVE WARNING: raised eyebrow skepticism + caring urgency. Trusted friend saying 'you need to hear this'. Stop gesture or crossed arms protectively.", text_formula:"DIRECT CHALLENGE. e.g. 'IF HE DOES THIS — RUN' or '5 SIGNS THEY DON'T LOVE YOU'", color:"RED warning dominant + WHITE thick-outline text + red flag visual", signals:["red flag","toxic","narcissist","signs","if he","if she","run","gaslighting"], ideogram:"urgent red warning palette, protective energy, red flag visual elements" },
  destination_wow: { id:"destination_wow", name:"The Destination Wow Shot", niches:["travel","vacation","lifestyle","adventure"], ctr:"6-10%", power:5, psychology:"Escapism pull — stunning scenery triggers immediate desire to be there", face_required:false, face_emotion:"AWESTRUCK JOY: jaw slightly dropped, eyes wide with genuine wonder, arms potentially spread wide embracing view. Authentic wanderlust.", text_formula:"[PLACE] FOR $AMOUNT. e.g. 'MALDIVES FOR $800'. Price makes dream accessible.", color:"ULTRA-VIVID SATURATED landscape colors + golden hour warm light + high saturation", signals:["travel","trip","vacation","country","beach","explore","destination","island","resort","paradise"], ideogram:"ultra-vivid landscape photography, golden hour lighting, travel photography aesthetic, wide cinematic" },
  hidden_gem: { id:"hidden_gem", name:"The Hidden Gem Reveal", niches:["travel","adventure","lifestyle"], ctr:"7-9%", power:4, psychology:"Exclusivity + FOMO — nobody talks about this", face_required:false, face_emotion:"DISCOVERER'S EXCITEMENT: genuine surprise-joy, pointing at discovery, breathless excitement of sharing a secret place.", text_formula:"EXCLUSIVITY + PLACE. e.g. 'HIDDEN BEACH NOBODY KNOWS'", color:"LUSH natural greens + crystal blues + golden discovery light", signals:["hidden","secret","nobody knows","undiscovered","gem","paradise","underrated"], ideogram:"pristine natural beauty, lush tropical photography, discovery lighting, unspoiled wilderness" },
  ai_takeover: { id:"ai_takeover", name:"The AI Takeover Frame", niches:["ai","tech","business","future","career"], ctr:"7-11%", power:5, psychology:"Existential fear + curiosity — AI threatens identity, job, and future", face_required:false, face_emotion:"ALARMED URGENCY: wide eyes of someone who saw the threat, raised stop/warning hand at camera, forward lean of 'you need to hear this NOW'.", text_formula:"AI THREAT + PERSONAL IMPACT. e.g. 'AI JUST REPLACED 10,000 JOBS' or 'YOUR JOB IS GONE'", color:"ELECTRIC NEON BLUE on NEAR BLACK + PURPLE AI circuit aesthetic + cold glow", signals:["AI","ChatGPT","Claude","automation","replaced","GPT","Gemini","artificial intelligence","robot"], ideogram:"neon blue AI technology aesthetic, circuit board patterns, futuristic cyberpunk lighting, data streams" },
  cheat_code_reveal: { id:"cheat_code_reveal", name:"The Cheat Code Reveal", niches:["ai","tech","productivity","make_money"], ctr:"6-10%", power:4, psychology:"Shortcut psychology + unfair advantage desire", face_required:false, face_emotion:"CONSPIRATORIAL: leaning forward, one eyebrow raised, half-smile of giving forbidden access. 'I shouldn't be telling you this...'", text_formula:"TIME/EFFORT COMPRESSION. e.g. '10 HRS → 5 MINS' or 'THE PROMPT THAT CHANGES EVERYTHING'", color:"DARK PURPLE/black + ELECTRIC CYAN or GREEN + code/terminal aesthetic", signals:["tool","hack","prompt","automation","workflow","faster","10x","AI tool","productivity"], ideogram:"dark hacker aesthetic, glowing screen interface, purple cyan neon palette" },
  tech_comparison: { id:"tech_comparison", name:"The Tech Comparison Bomb", niches:["ai","tech","software","reviews"], ctr:"6-9%", power:4, psychology:"Tribal loyalty — tech people are fanatically loyal to their tools", face_required:false, face_emotion:"DECISIVE AUTHORITY: confident direct gaze, hands on desk, 'I've tested both' energy.", text_formula:"[TOOL A] VS [TOOL B] or I TESTED EVERY [AI]. Bold VS center.", color:"SPLIT with tool colors on respective sides + bold VS center white", signals:["vs","versus","compared","better","tested","which","review","comparison"], ideogram:"head-to-head battle aesthetic, split composition, versus tournament energy" },
  plot_twist_tease: { id:"plot_twist_tease", name:"The Plot Twist Tease", niches:["movies","tv","entertainment","recap","reviews"], ctr:"8-12%", power:5, psychology:"Spoiler magnetism — seen it: validation; not seen it: secret knowledge", face_required:true, face_emotion:"MIND-BLOWN MAXIMUM: both hands on head OR face, eyes at ABSOLUTE MAXIMUM width, mouth open in O shape, visibly leaning back from impact. NOT posed. Authentic shattered worldview. This expression is EVERYTHING.", text_formula:"UNREVEALED MYSTERY. e.g. 'THE TWIST YOU MISSED' or 'WHAT THEY DIDN'T SHOW YOU'", color:"CINEMATIC TEAL AND ORANGE color grade + FILM GRAIN + GOLD highlight text", signals:["movie","film","show","series","ending","twist","explained","theory","review","recap","breakdown"], ideogram:"cinematic teal-orange color grade, film grain overlay, movie poster composition, Hollywood quality" },
  deep_lore_dive: { id:"deep_lore_dive", name:"The Deep Lore Dive", niches:["movies","gaming","anime","entertainment"], ctr:"6-9%", power:4, psychology:"Superfan identity — true fans NEED hidden knowledge", face_required:false, face_emotion:"DETECTIVE REVEAL: magnifying glass gesture, intensely focused, eureka single raised finger — found the hidden clue.", text_formula:"HIDDEN KNOWLEDGE. e.g. 'THE CLUE NOBODY NOTICED'", color:"DARK mysterious tones + spotlight on key element + annotation arrows", signals:["lore","hidden","detail","nobody noticed","theory","easter egg","secret","symbolism"], ideogram:"dark mysterious atmosphere, magnifying spotlight effect, detective investigation aesthetic" },
  reaction_recap: { id:"reaction_recap", name:"The Reaction Recap", niches:["movies","entertainment","reaction","tv","anime"], ctr:"7-10%", power:4, psychology:"Shared experience — reliving emotional peaks through someone else", face_required:true, face_emotion:"COMPLETELY AUTHENTIC UNFILTERED REACTION: real tears on cheeks, genuine open-mouth laugh with crinkled eyes, OR hand covering mouth in gasp. ZERO performance. ZERO posing. The authenticity IS the hook.", text_formula:"EMOTIONAL REACTION + SUBJECT. e.g. 'I CRIED 3 TIMES' or 'WATCHING [MOVIE] FOR FIRST TIME'", color:"SPLIT: warm natural on face (left) + content-matched grade (right). Natural vs cinematic.", signals:["reaction","reacting","watched","first time","cried","shocked","first watch"], ideogram:"authentic emotional photography, natural candid lighting, cinema split composition, genuine raw emotion" },
  shorts_hook_frame: { id:"shorts_hook_frame", name:"The Shorts Hook Frame", niches:["all_niches"], ctr:"3-sec scroll-stop", power:5, psychology:"Pattern interrupt — stop scroll in under 0.3 seconds", face_required:false, face_emotion:"EXTREME VERSION of video's core emotion amplified 200%. Fills 80%+ of vertical 9:16 frame.", text_formula:"1-2 LINES MAXIMUM. POV hook / shocking statement / cliffhanger. ALL CAPS MASSIVE.", color:"SINGLE BOLD background color + WHITE or NEON text top 30%. Zero complexity.", signals:["shorts","short","#shorts","pov","quick","60 seconds"], ideogram:"vertical 9:16 composition, bold single color background, massive readable text" }
};

// ──────────────────────────────────────────────────────────────────
// TEMPLATE SELECTOR
// ──────────────────────────────────────────────────────────────────
function selectTemplates(title = "", script = "", projectNiche = "", isShorts = false) {
  if (isShorts) return [TEMPLATE_DNA.shorts_hook_frame, TEMPLATE_DNA.shock_face, TEMPLATE_DNA.warning_alert];

  const text = (title + " " + script + " " + projectNiche).toLowerCase();
  const signals = {
    finance: ["money","income","budget","debt","invest","broke","salary","wealth","savings","financial","rich","poor","lambo","lamborghini","real estate","renting","buying","audit","vs","versus","passive","401k","roth","dividend","etf","index fund","lifestyle"],
    true_crime: ["murder","crime","killer","suspect","case","investigation","disappeared","evidence","unsolved","confession"],
    storytelling: ["story","happened","she","he","they","journey","night","everything changed","discovered","true story"],
    relationships: ["love","relationship","broke up","cheated","partner","marriage","heartbreak","toxic","dating","ex","affair"],
    travel: ["travel","trip","vacation","country","flight","hotel","beach","explore","destination","island","resort","paradise"],
    ai: ["AI","ChatGPT","Claude","automation","replaced","GPT","Gemini","artificial intelligence","robot"],
    movies: ["movie","film","show","series","scene","ending","twist","explained","theory","review","recap","cinema"],
    make_money: ["income","side hustle","passive","earn online","make money","revenue"],
    crypto: ["bitcoin","crypto","ethereum","blockchain","trading"],
    self_help: ["mindset","motivation","success","goal","discipline","confidence","growth"]
  };

  const scores = {};
  for (const [niche, kws] of Object.entries(signals)) {
    scores[niche] = kws.filter(kw => text.includes(kw.toLowerCase())).length;
  }
  const pn = projectNiche.toLowerCase();
  if (pn.includes("finance")||pn.includes("money")||pn.includes("budget")) scores.finance=(scores.finance||0)+5;
  if (pn.includes("crime")) scores.true_crime=(scores.true_crime||0)+5;
  if (pn.includes("travel")) scores.travel=(scores.travel||0)+5;
  if (pn.includes("ai")||pn.includes("tech")) scores.ai=(scores.ai||0)+5;
  if (pn.includes("movie")||pn.includes("recap")) scores.movies=(scores.movies||0)+5;
  if (pn.includes("relationship")||pn.includes("love")) scores.relationships=(scores.relationships||0)+5;
  if (pn.includes("story")||pn.includes("documentary")) scores.storytelling=(scores.storytelling||0)+5;

  const topNiche = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0]?.[0]||"finance";

  const ranked = Object.values(TEMPLATE_DNA)
    .filter(t => t.id !== "shorts_hook_frame")
    .map(t => {
      let score = 0;
      if (t.niches.some(n=>n===topNiche||n.includes(topNiche.split("_")[0]))) score+=40;
      score += (t.signals||[]).filter(kw=>text.includes(kw.toLowerCase())).length * 8;
      score += (t.power||3) * 5;
      return { ...t, _score: score };
    })
    .sort((a,b)=>b._score-a._score);

  return ranked.slice(0, 3);
}

function templateContextBlock(templates) {
  return `
═══════════════════════════════════════════════════════════════
SMART TEMPLATE DNA — AI-SELECTED FOR MAXIMUM CTR
These templates are calibrated for 8-12% CTR and 10M+ views.
FOLLOW THESE EXACTLY — they are the difference between 2% and 12% CTR.
═══════════════════════════════════════════════════════════════

${templates.map((t,i) => `
▶ TEMPLATE ${i+1} (${i===0?"PRIMARY — MUST USE FOR CONCEPTS 1 & 2":"ALTERNATE — USE FOR CONCEPT"+(i+2)})
  Name: ${t.name} | CTR: ${t.ctr} | Viral Power: ${"★".repeat(t.power||3)}
  Psychology: ${t.psychology}
  
  👁 FACE/EMOTION REQUIREMENT (NON-NEGOTIABLE):
  ${t.face_emotion}
  Face Required: ${t.face_required?"YES — THE FACE IS THE PRIMARY CTR DRIVER. Wrong expression = 2% CTR.":"NO — object/graphic driven. Focus on visual impact."}
  
  💬 Text Formula: ${t.text_formula}
  🎨 Color System: ${t.color}
  🤖 Image Quality: ${t.ideogram}
`).join('\n')}

═══════════════════════════════════════════════════════════════
FACE/EMOTION LAW: The face expression specs above are not suggestions.
Every pixel of the expression — eyebrow height, jaw position, eye width — 
determines whether a viewer's thumb stops or keeps scrolling.
Execute them with precision.
═══════════════════════════════════════════════════════════════`;
}

// ══════════════════════════════════════════════════════════════════
// VALIDATION
// ══════════════════════════════════════════════════════════════════
function validateThumbnail(thumbnail) {
  const issues = [];
  if (!thumbnail.image_prompt || thumbnail.image_prompt.length < 100) issues.push('Prompt too short');
  if (!thumbnail.text_overlay || !thumbnail.text_overlay.trim()) issues.push('Missing text');
  if (thumbnail.text_overlay && thumbnail.text_overlay.split(' ').length > 6) issues.push('Text exceeds 6 words');
  if (!thumbnail.ctr_score || thumbnail.ctr_score < 1 || thumbnail.ctr_score > 10) issues.push('Invalid CTR score');
  return { valid: issues.length === 0, issues };
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { project_id, video_title } = body;
    if (!project_id || !video_title) return Response.json({ error: 'Missing required fields: project_id, video_title' }, { status: 400 });

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    // ──────────────────────────────────────────────────────────────
    // LOAD DATA
    // ──────────────────────────────────────────────────────────────
    const [brandResult, topicResult, scriptResult, projectResult] = await Promise.allSettled([
      base44.entities.BrandIdentities.list(),
      base44.entities.Topics.filter({ project_id }),
      base44.entities.Scripts.filter({ project_id }),
      base44.asServiceRole.entities.Projects.filter({ id: project_id })
    ]);

    let visualStyle = 'cinematic_realistic', projectNiche = '';
    if (projectResult.status === 'fulfilled' && projectResult.value[0]) {
      visualStyle = projectResult.value[0].visual_style || 'cinematic_realistic';
      projectNiche = projectResult.value[0].niche || '';
    }

    let thumbTone = 'cinematic documentary', brandColors = '', brandStyle = '';
    if (brandResult.status === 'fulfilled') {
      const brand = brandResult.value.find(b => b.project_id === project_id);
      if (brand) { thumbTone = brand.thumbnail_tone || thumbTone; brandColors = brand.color_palette || ''; }
    }

    let topicContext = '';
    if (topicResult.status === 'fulfilled') {
      const topic = topicResult.value.find(t => t.is_selected === true);
      topicContext = topic?.description || '';
    }

    let scriptContext = '';
    if (scriptResult.status === 'fulfilled' && scriptResult.value.length > 0) {
      const script = scriptResult.value.find(s => s.version === 'final_aggregated') || scriptResult.value[0];
      const content = script.full_script || [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro].filter(Boolean).join('\n\n');
      scriptContext = content.substring(0, 3000);
    }

    // ──────────────────────────────────────────────────────────────
    // SHORTS DETECTION + TEMPLATE AUTO-SELECT
    // ──────────────────────────────────────────────────────────────
    const isShorts = video_title.toLowerCase().includes('#short') ||
      video_title.toLowerCase().includes('short:') ||
      video_title.toLowerCase().startsWith('short ') ||
      (scriptContext.length > 0 && scriptContext.length < 600);

    const selectedTemplates = selectTemplates(video_title, scriptContext, projectNiche, isShorts);
    const primaryTemplate = selectedTemplates[0];
    const tmplBlock = templateContextBlock(selectedTemplates);
    const dimensionSpec = isShorts ? "1080x1920 Full HD 9:16 vertical YouTube Shorts" : "1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail";

    console.log('══════════════════════════════════════════════════════');
    console.log('THUMBNAIL CONCEPTS v5 — Template-DNA Auto-Select');
    console.log(`Video: ${video_title}`);
    console.log(`Templates: ${selectedTemplates.map(t=>t.name).join(' | ')}`);
    console.log(`Shorts: ${isShorts} | Niche: ${projectNiche} | Style: ${visualStyle}`);
    console.log('══════════════════════════════════════════════════════');

    // ──────────────────────────────────────────────────────────────
    // VISUAL STYLE BLOCK
    // ──────────────────────────────────────────────────────────────
    const visualStyleBlock = ({
      skeleton_protagonist: `SKELETON PROTAGONIST STYLE: The transparent glass skeleton with ivory bones and expressive brown/amber eyeballs. Show skeleton interacting with the topic. Full body or waist-up, always with expressive amber eyeballs. Combine with bold text and photorealistic environments. Other characters = photorealistic humans contrasting with skeleton.`,
      cinematic_realistic: `CINEMATIC REALISTIC: Photorealistic Hollywood-grade cinematic lighting. Dramatic three-point lighting, rim light separation, volumetric atmosphere. Characters look like real people in movie stills. Moody color grading: teal-orange, warm amber, cool blue.`,
      anime: `ANIME STYLE: Studio Ghibli meets modern anime. Vibrant colors, expressive eyes, clean linework. Bold colorful text matching anime energy. Vivid saturated palette.`,
      cinematic_anime: `CINEMATIC ANIME: Makoto Shinkai quality. Dramatic god rays, ultra-detailed backgrounds. Widescreen epic compositions. Anime movie poster energy.`,
      cartoon_2d: `2D CARTOON STYLE: Bold clean outlines, vibrant flat colors. Big expressive faces, dynamic poses. Playful simplified backgrounds.`,
      '3d_whiteboard_cartoon': `3D WHITEBOARD CARTOON: Clean bold outlines, flat cheerful fills, YouTube explainer aesthetic. Friendly proportions, clean isometric environments.`,
      low_poly_3d_cartoon: `LOW-POLY 3D CARTOON: Visible flat-shaded polygons, exaggerated proportions, oversized heads. Bright saturated colors, matte clay-toy quality.`,
      comic_book: `COMIC BOOK STYLE: Bold black ink outlines, halftone shading, vibrant saturated Marvel/DC quality. Dynamic action poses.`,
      oil_painting: `OIL PAINTING STYLE: Thick impasto brushstrokes, rich pigment, Rembrandt chiaroscuro lighting. Museum masterpiece quality.`,
      photorealistic_4k: `PHOTOREALISTIC 4K: DSLR photograph quality, razor sharp, editorial National Geographic feel. Natural color palette.`
    })[visualStyle] || `CINEMATIC REALISTIC: Professional photorealistic, dramatic lighting, movie-quality feel.`;

    // ──────────────────────────────────────────────────────────────
    // MEGA GEMINI PROMPT — Everything in one call
    // ──────────────────────────────────────────────────────────────
    const scriptSection = scriptContext ? `\n═══ SCRIPT CONTENT (extract anchors) ═══\n${scriptContext}` : '';
    const shortsNote = isShorts ? `\n⚡ SHORTS MODE ACTIVE: ${dimensionSpec}. First frame = thumbnail. Text fills top 30%, subject fills bottom 70%. Hook must stop scroll in 0.3 seconds.` : '';

    const prompt = `You are the world's #1 YouTube thumbnail designer with 10+ billion combined views across client channels. You study MrBeast, Veritasium, The Futur, Graham Stephan, Caleb Hammer, and every viral creator in every niche.

VIDEO TITLE: "${video_title}"
VIDEO NICHE: ${projectNiche || 'general'}
VISUAL STYLE: ${visualStyle}
BRAND TONE: ${thumbTone}
${brandColors ? `BRAND COLORS: ${brandColors}` : ''}
${topicContext ? `VIDEO CONTEXT: ${topicContext}` : ''}
${shortsNote}
${scriptSection}

${tmplBlock}

${visualStyleBlock}

═══════════════════════════════════════════════════════════════
THUMBNAIL FORMAT TYPES — USE VARIETY ACROSS 10 CONCEPTS
═══════════════════════════════════════════════════════════════

FORMAT A — BOLD TEXT + OBJECT (Veritasium style: "ASBESTOS", "$400,000,000"):
  One powerful word or number dominates 40-60% of frame. Relevant object fills background. Text IS the thumbnail.

FORMAT B — BEFORE/AFTER CONTRAST (split screen transformation):
  Left: before state (dark). Right: after state (bright). Arrow or divider between. Contrasting colors.

FORMAT C — CHARACTER + BOLD OVERLAY (The Futur: "PACKAGE IT RIGHT"):
  Character prominently placed (using ${visualStyle} style). 2-4 word bold text captures main point.

FORMAT D — DATA/NUMBER SHOCK ("$50,000 RULE", "100K TO 1M"):
  Specific number dominates. Supporting visual (chart, money) provides context. Number from script or title.

FORMAT E — QUESTION/CHALLENGE ("WHY BUY?", "Am I Retiring?"):
  Provocative question from title/script. Character looking puzzled/reacting. Clean background, large text.

FORMAT F — SCENE SNAPSHOT (key dramatic moment from script):
  Most dramatic visual moment, rendered in ${visualStyle} style. Minimal text. Cinematic composition.

FORMAT G — SYMBOLIC OBJECT (glowing key, mousetrap, cracking foundation):
  One powerful symbolic object fills frame. Dramatic lighting. 1-2 words if needed.

FORMAT H — REACTION SPLIT (face reacting to content):
  50% authentic reaction face + 50% content being reacted to. Emotion must be genuine/extreme.

═══════════════════════════════════════════════════════════════
WORLD-CLASS TEXT RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════════════
1. MAX 4 WORDS (ideal: 2-3). ALL CAPS. 
2. Text MUST directly reference video title keywords — NO generic outrage words
3. BANNED: "THEY LIED", "IT'S OVER", "SHOCKING" (unless in actual title)
4. Text font: Impact or Bebas Neue ONLY
5. ALL text needs thick 6px+ black outline AND heavy drop shadow
6. Text position: upper-left or upper-center ONLY. NEVER bottom-right (YouTube timestamp zone)
7. Text readable at 120px mobile thumbnail preview — test for this mentally

BANNED generic text (these appear on thousands of channels already):
"YOU WON'T BELIEVE", "WATCH THIS NOW", "MUST WATCH", "INCREDIBLE", "AMAZING", "MIND BLOWN"
(These are dead phrases. Use content-specific power words instead.)

═══════════════════════════════════════════════════════════════
COMPOSITION RULES
═══════════════════════════════════════════════════════════════
- Maximum 3 visual elements: subject + text + background
- DEAD ZONE: bottom-right ALWAYS empty (YouTube timestamp badge)
- Subject at rule-of-thirds intersection — never dead center
- Text and subject in OPPOSING areas of frame (visual tension)
- Background: simple, supports mood, slightly desaturated/blurred to pop subject
- NO hex codes in image prompts — use color names only

PHOTOREALISM LAW: If thumbnail has real-looking humans, image_prompt MUST include:
"photorealistic photograph, DSLR camera shot, real human skin with visible pores, NOT illustration, NOT cartoon, NOT 3D render, NOT anime"

═══════════════════════════════════════════════════════════════
${isShorts ? `SHORTS-SPECIFIC RULES:
- FORMAT: 9:16 vertical, 1080x1920
- Image prompt MUST start with: "1080x1920 Full HD 9:16 vertical YouTube Shorts, graphic design composition"
- Text fills top 30% of vertical frame
- Subject fills bottom 70%
- First frame IS the thumbnail — no separate thumbnail exists for Shorts
- Maximum 2 lines of text. Largest possible font.
- Color: SINGLE bold background, no gradients` : `STANDARD FORMAT:
- Image prompt MUST start with: "1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail, graphic design composition"
- Standard horizontal composition`}

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════
{
  "video_analysis": {
    "core_subject": "5-word summary",
    "key_visual_moment": "most powerful scene from script",
    "emotional_core": "primary emotion",
    "niche_objects": ["obj1","obj2","obj3"],
    "title_keywords": ["word1","word2"],
    "detected_primary_template": "${primaryTemplate.id}",
    "shorts_mode": ${isShorts}
  },
  "thumbnails": [
    {
      "rank": 1,
      "format": "A/B/C/D/E/F/G/H",
      "template_dna_used": "${primaryTemplate.id}",
      "concept_description": "What this shows and exactly why it achieves 10%+ CTR",
      "text_overlay": "MAX 4 WORDS CAPS — follows ${primaryTemplate.name} text formula",
      "title_connection": "How text connects to video title keywords",
      "face_expression_implemented": "How you implemented the template's face/emotion requirement EXACTLY",
      "text_design": {
        "color": "vivid color name",
        "outline": "thick 6px black outline",
        "shadow": "heavy drop shadow 3px offset",
        "position": "upper-left or upper-center",
        "size": "massive — 20-25% of frame height",
        "font_style": "Impact"
      },
      "subject_design": {
        "description": "Subject using ${visualStyle} style with exact face expression from template DNA",
        "face_expression": "Exact expression implemented, muscle by muscle",
        "position": "rule-of-thirds grid position",
        "separation": "rim light + drop shadow separation technique"
      },
      "background_design": {
        "color": "complementary to text",
        "style": "gradient/solid/scene/blurred",
        "mood": "what it communicates emotionally"
      },
      "color_scheme": "text color + accent + background",
      "style_reference": "cinematic/minimal/bold",
      "ctr_score": 9,
      "why_it_achieves_10M_views": "Specific psychological mechanism that makes this irresistible",
      "script_anchor_used": "specific element from script that anchors this thumbnail",
      "image_prompt": "400+ word Ideogram prompt. Starts with '${dimensionSpec}, graphic design composition.' Uses named colors only. Describes complete scene in ${visualStyle} style. CRITICAL: Do NOT include any text, words, letters, or numbers in the image. Leave clean empty space for text overlay to be added separately.",      "negative_prompt": "blurry, low quality, pixelated, watermark, distorted text, misspelled text, small text, cluttered, text in bottom-right, text at bottom edge, low contrast text, muted colors, flat expression, stock photo smile, generic pose"
    }
  ]
}

REQUIREMENTS:
- Generate EXACTLY 10 thumbnails using at least 5 DIFFERENT format types
- Concepts 1 AND 2 MUST implement the PRIMARY template (${primaryTemplate.name}) — this is mandatory
- Concept 3 implements Template 2 (${selectedTemplates[1]?.name || 'secondary'})
- Remaining concepts can mix all templates and formats creatively
- EVERY face/emotion spec from the selected templates MUST be implemented exactly
- EVERY thumbnail in ${visualStyle} visual style
- EVERY text overlay connects to video title keywords
- Dead zone (bottom-right) clear on ALL concepts
- Include: at least 2 data/number formats, at least 1 question format, at least 1 scene snapshot
- All prompts 400+ words with complete visual instruction

Generate 10 thumbnails now.`;

    const result = await safeGeminiCall(prompt, 0.9);
    if (!result.success) return Response.json({ error: result.error }, { status: 500 });
    if (!result.data?.thumbnails || !Array.isArray(result.data.thumbnails)) return Response.json({ error: 'Invalid response format from Gemini' }, { status: 500 });

    // ──────────────────────────────────────────────────────────────
    // DELETE EXISTING
    // ──────────────────────────────────────────────────────────────
    try {
      const existing = await base44.entities.ThumbnailConcepts.filter({ project_id });
      await Promise.all(existing.map(e => base44.entities.ThumbnailConcepts.delete(e.id)));
    } catch (delErr) { console.warn('Delete existing failed:', delErr.message); }

    // ──────────────────────────────────────────────────────────────
    // SAVE CONCEPTS
    // ──────────────────────────────────────────────────────────────
    const thumbnails = [];
    const skipped = [];
    let qualityWarnings = 0;

    const savePromises = result.data.thumbnails.map(async (t, i) => {
      const validation = validateThumbnail(t);
      if (!validation.valid) { qualityWarnings++; console.warn(`Thumbnail ${t.rank} issues: ${validation.issues.join(', ')}`); }

      let imagePrompt = t.image_prompt || '';

      // Ensure correct dimension spec
      if (!imagePrompt.includes('1920x1080') && !imagePrompt.includes('1080x1920') && !imagePrompt.includes('16:9') && !imagePrompt.includes('9:16')) {
        imagePrompt = `${dimensionSpec}, graphic design composition. ${imagePrompt}`;
      }

      // Store text overlay for later compositing (NOT in image prompt — causes text to render in image)
      const textOverlay = t.text_overlay || '';
      // Text will be composited separately — do NOT inject into image prompt

      // Add quality markers
      if (!imagePrompt.toLowerCase().includes('crisp') && !imagePrompt.toLowerCase().includes('sharp')) {
        imagePrompt += '. Ultra high resolution, crisp sharp details, professional quality.';
      }

      // Photorealism enforcement for human faces
      const hasHumanCues = /\b(person|man|woman|face|expression|skin|portrait|character)\b/i.test(imagePrompt);
      const alreadyPhoto = /photorealistic|DSLR|real human/i.test(imagePrompt);
      if (hasHumanCues && !alreadyPhoto && !['anime','cartoon_2d','comic_book','oil_painting'].includes(visualStyle)) {
        imagePrompt = imagePrompt.replace('graphic design composition.', 'graphic design composition. Photorealistic photograph, DSLR camera shot, real human skin with visible pores and texture, professional portrait photography, NOT illustration, NOT cartoon, NOT 3D render, NOT anime.');
      }

      const tmplUsed = TEMPLATE_DNA[t.template_dna_used || primaryTemplate.id] || primaryTemplate;

      try {
        const record = await base44.entities.ThumbnailConcepts.create({
          project_id,
          rank: t.rank || i + 1,
          concept_type: t.template_dna_used || 'revelation',
          psychological_trigger: tmplUsed.psychology || 'curiosity_gap',
          concept_description: `[${tmplUsed.name}] ${t.concept_description || ''}\n\n🎯 CTR Target: ${tmplUsed.ctr}\n🧠 Psychology: ${tmplUsed.psychology}\n👁 Face: ${t.face_expression_implemented || 'N/A'}\n📌 Anchor: ${t.script_anchor_used || 'none'}\n⚡ 10M View Reason: ${t.why_it_achieves_10M_views || ''}`,
          focal_point: t.format || '',
          visual_metaphor: t.template_dna_used || '',
          color_scheme: `${t.color_scheme || ''} | Template: ${tmplUsed.name}`,
          text_overlay: textOverlay,
          text_style: `${t.text_design?.color||'white'} | ${t.text_design?.outline||'thick black outline'} | ${t.text_design?.position||'upper-left'} | ${t.text_design?.font_style||'Impact'}`,
          style_reference: t.style_reference || 'cinematic',
          ctr_score: t.ctr_score || 7,
          why_it_stops_scrolling: t.why_it_achieves_10M_views || '',
          faceless_adaptation: `Format ${t.format} | Template: ${tmplUsed.name}`,
          image_prompt: imagePrompt,
          quality_valid: validation.valid,
          is_selected: false
        });

        console.log(`✓ Concept ${t.rank}: [${tmplUsed.name}] Format:${t.format} "${textOverlay}" | CTR:${t.ctr_score}`);
        return {
          success: true, record, imagePrompt, isShorts,
          negativePrompt: t.negative_prompt || "blurry, low quality, pixelated, watermark, distorted text, misspelled text, small text, cluttered, text in bottom-right, low contrast, flat expression, stock photo smile"
        };
      } catch (saveErr) {
        console.error(`✗ Save failed ${t.rank}:`, saveErr.message);
        skipped.push({ rank: t.rank, error: saveErr.message });
        return { success: false };
      }
    });

    const savedResults = await Promise.all(savePromises);
    const successfullySaved = savedResults.filter(r => r.success);
    // ──────────────────────────────────────────────────────────────
    // RETURN CONCEPTS — Images generated separately by frontend
    // (Generating 10 images here would timeout at 60s)
    // ──────────────────────────────────────────────────────────────
    const conceptIds = successfullySaved.map(s => s.record.id);

    try { await base44.entities.Projects.update(project_id, { current_step: 12 }); } catch (_) {}

    console.log('══════════════════════════════════════════════════════');
    console.log(`Templates: ${selectedTemplates.map(t=>t.name).join(' | ')}`);
    console.log(`Shorts: ${isShorts} | Concepts saved: ${successfullySaved.length}`);
    console.log(`Skipped: ${skipped.length} | Quality Warnings: ${qualityWarnings}`);
    console.log('Images will be generated separately per-concept by frontend');
    console.log('══════════════════════════════════════════════════════');

    return Response.json({
      success: true,
      concepts_saved: successfullySaved.length,
      concept_ids: conceptIds,
      template_selection: {
        is_shorts: isShorts,
        primary_template: primaryTemplate.name,
        primary_ctr_target: primaryTemplate.ctr,
        all_templates: selectedTemplates.map(t=>({ id:t.id, name:t.name, ctr:t.ctr, power:t.power })),
        detected_niche: projectNiche || 'general'
      },
      meta: {
        total_generated: result.data.thumbnails.length,
        total_saved: successfullySaved.length,
        total_skipped: skipped.length,
        quality_warnings: qualityWarnings,
        dimensions: isShorts ? "1080x1920" : "1920x1080",
        skipped_details: skipped
      }
    });
  } catch (error) {
    console.error('generateThumbnailConcepts v5 error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});