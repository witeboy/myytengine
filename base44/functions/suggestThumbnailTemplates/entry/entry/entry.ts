import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed

// ══════════════════════════════════════════════════════════════════
// SUGGEST THUMBNAIL TEMPLATES
// Analyzes script → returns top 5 best-fit templates with reasoning
// User picks 3 → passed back to generateThumbnailsFromScript
// ══════════════════════════════════════════════════════════════════

const TEMPLATE_DNA = {
  shock_face:          { name:"The Shock Face",           ctr:"8-12%", power:5, niches:["finance","business","make_money"], psychology:"Mirror neurons — viewer FEELS the shock before reading text", face_required:true,  example_text:"$130K STILL BROKE",     color:"Dark + Electric Yellow",    icon:"😱" },
  income_reveal:       { name:"The Income Reveal",        ctr:"7-11%", power:5, niches:["finance","make_money","side_hustle"], psychology:"Aspiration + social proof via specific dollar amount",   face_required:false, example_text:"$47,382 IN 6 MONTHS",  color:"Dark + Neon Green",         icon:"💰" },
  warning_alert:       { name:"The Warning / Alert",      ctr:"7-10%", power:4, niches:["finance","crypto","health","news"],   psychology:"Loss aversion — fear of losing beats desire to gain",    face_required:false, example_text:"STOP DOING THIS",      color:"Deep Red + White",          icon:"⚠️" },
  secret_hidden:       { name:"The Secret / Hidden Truth",ctr:"7-10%", power:4, niches:["finance","business","health"],        psychology:"Information gap + exclusivity trigger",                  face_required:false, example_text:"HIDDEN BANK SECRET",   color:"Near Black + Gold",         icon:"🤫" },
  breaking_news:       { name:"The Breaking News",        ctr:"7-11%", power:5, niches:["finance","crypto","stocks","news"],   psychology:"FOMO + urgency",                                         face_required:false, example_text:"BREAKING: IT CHANGED", color:"Red Banner + White",        icon:"📰" },
  before_after:        { name:"The Before / After Split", ctr:"6-10%", power:4, niches:["finance","fitness","mindset"],        psychology:"Transformation desire",                                  face_required:false, example_text:"BROKE → $200K",        color:"Dark Left + Bright Right",  icon:"🔄" },
  numbered_list:       { name:"The Numbered List Bomb",   ctr:"5-9%",  power:3, niches:["finance","productivity","health"],    psychology:"Listicle brain — feels completable",                     face_required:false, example_text:"7 HABITS OF RICH",     color:"Bold Bg + Accent Number",   icon:"🔢" },
  identity_challenge:  { name:"The Identity Challenge",   ctr:"6-8%",  power:3, niches:["finance","self_help","mindset"],      psychology:"Ego threat — click to defend your identity",             face_required:true,  example_text:"THIS HABIT = POOR",    color:"Dark Purple + White",       icon:"👆" },
  finance_versus:      { name:"The Finance Versus",       ctr:"6-9%",  power:4, niches:["finance","investing","real_estate"],  psychology:"Binary tribal loyalty — people pick a side and defend it", face_required:false, example_text:"RENTING VS BUYING",   color:"Split Blue + Amber",        icon:"⚔️" },
  lifestyle_proof:     { name:"The Lifestyle Proof",      ctr:"6-9%",  power:4, niches:["finance","make_money","youtube"],     psychology:"Social proof via result — the luxury item is evidence",  face_required:false, example_text:"MY LAMBO PAID BY YOUTUBE", color:"Dark + Gold",          icon:"🏎️" },
  finance_audit:       { name:"The Finance Audit",        ctr:"6-9%",  power:4, niches:["finance","budgeting","debt"],         psychology:"Vicarious rubbernecking — watching others' disasters feels safe", face_required:true, example_text:"$200K DEBT AT 23", color:"Split + Red Numbers",      icon:"📊" },
  cliffhanger:         { name:"The Cliffhanger",          ctr:"7-11%", power:5, niches:["storytelling","drama","documentary"], psychology:"Zeigarnik effect — open loop brain demands closure",     face_required:true,  example_text:"SHE LEFT EVERYTHING...", color:"Warm Amber + Dark",      icon:"😬" },
  true_account:        { name:"The True Account",         ctr:"6-9%",  power:3, niches:["storytelling","documentary","history"], psychology:"Reality anchoring — TRUE STORY = forbidden knowledge", face_required:false, example_text:"TRUE STORY: GONE",     color:"Desaturated + Sepia",       icon:"📜" },
  cold_case_file:      { name:"The Cold Case File",       ctr:"8-12%", power:5, niches:["true_crime","mystery","documentary"], psychology:"Justice obsession + morbid curiosity",                   face_required:false, example_text:"THE MURDER NOBODY SOLVED", color:"Black + Blood Red",    icon:"🔍" },
  suspect_reveal:      { name:"The Suspect Reveal",       ctr:"7-10%", power:4, niches:["true_crime","mystery","thriller"],    psychology:"Accusation trigger — wired to stare at the accused",     face_required:true,  example_text:"SHE SMILED AT THE FUNERAL", color:"Black + Harsh Light", icon:"🕵️" },
  heartbreak_headline: { name:"The Heartbreak Headline",  ctr:"7-10%", power:5, niches:["relationships","love","marriage"],    psychology:"Emotional contagion — pain is the most shared emotion",  face_required:true,  example_text:"HE LEFT WITHOUT A WORD", color:"Cold Blues + Warm Face",   icon:"💔" },
  relationship_red_flag:{ name:"The Relationship Red Flag",ctr:"6-9%", power:4, niches:["relationships","dating","self_help"], psychology:"Self-protection instinct",                               face_required:true,  example_text:"IF HE DOES THIS — RUN", color:"Red Dominant + White",     icon:"🚩" },
  destination_wow:     { name:"The Destination Wow Shot", ctr:"6-10%", power:5, niches:["travel","vacation","adventure"],      psychology:"Escapism pull — stunning scenery triggers desire to be there", face_required:false, example_text:"MALDIVES FOR $800",  color:"Ultra-Vivid + Golden Hour", icon:"✈️" },
  hidden_gem:          { name:"The Hidden Gem Reveal",    ctr:"7-9%",  power:4, niches:["travel","adventure","lifestyle"],     psychology:"Exclusivity + FOMO — nobody talks about this",           face_required:false, example_text:"HIDDEN BEACH NOBODY KNOWS", color:"Lush Greens + Azure", icon:"💎" },
  ai_takeover:         { name:"The AI Takeover Frame",    ctr:"7-11%", power:5, niches:["ai","tech","career","future"],        psychology:"Existential fear — AI threatens identity and career",    face_required:false, example_text:"AI JUST REPLACED 10K JOBS", color:"Neon Blue + Near Black", icon:"🤖" },
  cheat_code_reveal:   { name:"The Cheat Code Reveal",    ctr:"6-10%", power:4, niches:["ai","tech","productivity"],           psychology:"Shortcut psychology + unfair advantage desire",          face_required:false, example_text:"10 HRS → 5 MINS",      color:"Dark Purple + Cyan",        icon:"⚡" },
  tech_comparison:     { name:"The Tech Comparison",      ctr:"6-9%",  power:4, niches:["ai","tech","software","reviews"],     psychology:"Tribal tech loyalty — developers defend their tools",    face_required:false, example_text:"CHATGPT VS CLAUDE",    color:"Split Brand Colors + VS",   icon:"🆚" },
  plot_twist_tease:    { name:"The Plot Twist Tease",     ctr:"8-12%", power:5, niches:["movies","tv","entertainment","recap"], psychology:"Spoiler magnetism — seen it: validation, not seen: secret knowledge", face_required:true, example_text:"THE TWIST YOU MISSED", color:"Cinematic Teal + Orange", icon:"🎬" },
  deep_lore_dive:      { name:"The Deep Lore Dive",       ctr:"6-9%",  power:4, niches:["movies","gaming","anime","books"],    psychology:"Superfan identity — true fans NEED hidden knowledge",    face_required:false, example_text:"THE CLUE NOBODY NOTICED", color:"Dark + Spotlight",       icon:"🔮" },
  reaction_recap:      { name:"The Reaction Recap",       ctr:"7-10%", power:4, niches:["movies","entertainment","reaction"],  psychology:"Shared experience — reliving emotional moments",         face_required:true,  example_text:"I CRIED 3 TIMES",      color:"Natural Face + Cinematic",  icon:"😭" },
  shorts_hook_frame:   { name:"The Shorts Hook Frame",    ctr:"scroll-stop", power:5, niches:["all_niches"],                   psychology:"Pattern interrupt — stop scroll in under 0.3 seconds",  face_required:false, example_text:"STOP SCROLLING",       color:"Single Bold Color + Neon",  icon:"📱" },
};

async function gemini(prompt, temp, maxTok) {
  const key = Deno.env.get("GEMINI_API_KEY");
  for (let i = 0; i < 3; i++) {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + key, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTok,
          temperature: temp,
          responseMimeType: "application/json"
        }
      })
    });
    
    if (r.status === 429) { await new Promise(w => setTimeout(w, (i + 1) * 10000)); continue; }
    if (!r.ok) { const e = await r.json(); throw new Error("Gemini " + r.status + ": " + (e.error?.message || "")); }
    
    const d = await r.json();
    if (!d.candidates?.length) throw new Error("No candidates");
    
    const textOutput = d.candidates[0].content.parts[0].text;
    
    try { 
      return JSON.parse(textOutput); 
    } catch (e) {
      console.error("Failed to parse output:", textOutput);
      throw new Error("JSON Parse failed on Gemini output");
    }
  }
  throw new Error("Rate limited after 3 attempts");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

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
    const scriptPreview = fullScript.substring(0, 2000);

    // Build template catalog for Gemini
    const templateCatalog = Object.entries(TEMPLATE_DNA).map(([id, t]) => ({
      id,
      name: t.name,
      ctr: t.ctr,
      power: t.power,
      psychology: t.psychology,
      niches: t.niches,
      example_text: t.example_text,
      face_required: t.face_required
    }));

    console.log(`Suggesting templates for: ${topicTitle} | Niche: ${project.niche}`);

    const result = await gemini(`You are a world-class YouTube thumbnail strategist. You have studied every viral thumbnail from MrBeast, Graham Stephan, Caleb Hammer, Veritasium, and every top creator in every niche. You understand the EXACT psychology that forces clicks.

Analyze this video and select the TOP 5 thumbnail templates that will achieve the highest possible CTR for this SPECIFIC content.

═══ VIDEO INFO ═══
Title: "${topicTitle}"
Script Title: "${script.title}"
Niche: "${project.niche}"

═══ SCRIPT (first 4000 chars) ═══
${scriptPreview}

═══ ALL 26 AVAILABLE TEMPLATES ═══
${JSON.stringify(templateCatalog, null, 2)}

═══ YOUR TASK ═══
1. Read the script carefully — understand what HAPPENS, what EMOTION it triggers, what SECRET or REVELATION it contains
2. For each of the 5 best templates, explain WHY it fits THIS specific script — be specific, not generic
3. Generate a custom example text for each template — pulled from THIS script's content, not a generic example
4. Rank them 1-5 (1 = highest CTR potential for this specific video)

RULES:
- Reason from the SCRIPT CONTENT — not just the niche. A finance video about a cheating scandal might score highest on heartbreak_headline not income_reveal.
- The example_text_for_this_video must be script-specific. e.g. if the script is about someone losing $200K in crypto, the shock_face example is "$200K GONE IN 1 DAY" not "MONEY GONE"
- If the script has a strong revelation, cliffhanger scores high. If it has specific numbers, income_reveal or shock_face scores high.
- Be honest — some templates truly don't fit certain scripts

Respond in this exact JSON:
{
  "video_analysis": {
    "core_emotion": "The single dominant emotion this video triggers (be specific)",
    "strongest_hook": "The most powerful single moment or revelation in the script",
    "has_specific_numbers": true,
    "has_personal_story": true,
    "has_revelation_or_twist": false,
    "niche_detected": "finance"
  },
  "top_5": [
    {
      "rank": 1,
      "template_id": "shock_face",
      "fit_score": 95,
      "why_it_fits": "2-3 sentence explanation specific to THIS script — not generic",
      "example_text_for_this_video": "SCRIPT-SPECIFIC TEXT IN ALL CAPS MAX 5 WORDS",
      "ctr_prediction": "9-11%",
      "face_required": true,
      "key_visual_element": "What the main image should show — specific to this script"
    }
  ]
}`, 0.7, 2048);

    // Enrich with full template DNA
    const enriched = (result.top_5 || []).map(item => {
      const dna = TEMPLATE_DNA[item.template_id] || {};
      return {
        ...item,
        name: dna.name || item.template_id,
        icon: dna.icon || '🎯',
        ctr_range: dna.ctr || '6-10%',
        power: dna.power || 3,
        psychology: dna.psychology || '',
        color_system: dna.color || '',
        face_required: dna.face_required ?? item.face_required ?? false,
      };
    });

    console.log(`Top 5 templates: ${enriched.map(t => t.template_id).join(', ')}`);

    return Response.json({
      success: true,
      video_analysis: result.video_analysis || {},
      top_5: enriched,
      project_niche: project.niche,
      video_title: topicTitle,
    });

  } catch (error) {
    console.error('suggestThumbnailTemplates error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});