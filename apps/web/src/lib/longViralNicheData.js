// ═══════════════════════════════════════════════════════════════
// LONG VIRAL NICHE STRUCTURES — User-defined Duration
// Same 5 viral storytelling structures as Shorts, scaled for long-form.
// Duration, word counts, and section timings scale proportionally.
// ═══════════════════════════════════════════════════════════════

// Helper: scale a section blueprint to a target total duration
function scaleSection(section, ratio) {
  const scaled = { ...section };
  scaled.seconds = Math.round(section.seconds * ratio);
  const wordRatio = ratio;
  const [minW, maxW] = (section.words || '0').split('–').map(s => parseInt(s) || 0);
  if (minW > 0) {
    scaled.words = `${Math.round(minW * wordRatio)}–${Math.round(maxW * wordRatio)} words`;
  }
  return scaled;
}

export function buildNicheForDuration(nicheId, durationMinutes) {
  const base = BASE_NICHES[nicheId];
  if (!base) return null;
  const totalSec = durationMinutes * 60;
  const ratio = totalSec / 90; // everything is based on 90s Shorts blueprint
  const wpm = 160; // natural speaking pace for long-form
  const totalWords = Math.round(durationMinutes * wpm);

  const sections = base.sections.map(s => {
    const scaled = scaleSection(s, ratio);
    // Recalculate time labels
    return scaled;
  });

  // Assign time labels
  let offset = 0;
  sections.forEach(s => {
    const start = offset;
    offset += s.seconds;
    const fmt = (sec) => {
      const m = Math.floor(sec / 60);
      const ss = Math.floor(sec % 60);
      return `${m}:${ss.toString().padStart(2, '0')}`;
    };
    s.time = `${fmt(start)} – ${fmt(offset)}`;
  });

  return {
    ...base,
    title: base.title.replace('SHORT', 'LONG-FORM').replace('short', 'long-form'),
    duration: `${durationMinutes} minutes`,
    wordCount: `${totalWords - 100}–${totalWords + 100} words`,
    pacing: `~${wpm} words/min (natural long-form pace)`,
    sections,
    _durationMinutes: durationMinutes,
    _totalSeconds: totalSec,
    _totalWords: totalWords,
  };
}

export const LONG_VIRAL_NICHE_IDS = [
  { id: 'finance', emoji: '💰', label: 'Finance / Wealth', structure: 'Hook → Tension → Pivot → 3 Rules → CTA' },
  { id: 'book', emoji: '📚', label: 'Book Summaries', structure: 'Hook → Context → 3 Lessons → Transformation → CTA' },
  { id: 'crime_story', emoji: '🔪', label: 'Crime Story', structure: 'Cold Open → Setup → Escalation → Twist → CTA' },
  { id: 'tech_explainer', emoji: '⚡', label: 'Tech Explainer', structure: 'WTF Hook → Context → 3 Steps → So What → CTA' },
  { id: 'side_hustle', emoji: '💸', label: 'Side Hustle', structure: 'Proof Hook → Myth Kill → 3 Steps → Proof → CTA' },
];

// Base 90-second blueprints (same structure as Shorts)
const BASE_NICHES = {
  finance: {
    id: 'finance',
    emoji: '💰',
    color: '#22c55e',
    title: 'FINANCE / WEALTH',
    rpm: '$15-30 RPM',
    sections: [
      { id: 'hook', label: 'HOOK', seconds: 5, words: '12–18', color: '#dc2626', purpose: 'Pattern interrupt. Stop the scroll. Create an information gap.', rules: ['First frame = bold text on screen + voice', 'NO intro, NO logo', 'Must contain a number, a contradiction, or a "you" statement'], visualSpec: 'Full-screen kinetic text. Dramatic zoom.', audioSpec: 'Confident, slightly fast. Low tension drone.' },
      { id: 'tension', label: 'TENSION / PROBLEM', seconds: 15, words: '35–45', color: '#f59e0b', purpose: 'Establish the pain point personally.', rules: ['Use "you" language', 'Include specific stat', 'Create urgency'], visualSpec: 'Stressed person, bills, declining graphs.', audioSpec: 'Lower energy, concerned tone.' },
      { id: 'pivot', label: 'PIVOT / REVEAL', seconds: 5, words: '12–16', color: '#8b5cf6', purpose: 'The "BUT" moment. Flip the script.', rules: ['Single sentence reversal', 'Must feel like a secret unlocked'], visualSpec: 'HARD CUT. Color shift dark→bright.', audioSpec: 'Energy shifts UP.' },
      { id: 'value', label: 'VALUE DELIVERY — 3 RULES', seconds: 45, words: '100–130', color: '#22c55e', purpose: 'Deliver 3 concrete rules.', rules: ['Exactly 3 rules', 'Each rule: setup + proof', '1 specific number per rule'], visualSpec: '3 segments with rule headers. Numbers highlighted.', audioSpec: 'Teaching mode, energy builds per rule.' },
      { id: 'cta', label: 'CTA', seconds: 15, words: '30–40', color: '#06b6d4', purpose: 'Drive action.', rules: ['Callback to hook', '"Save this" trigger', 'Tease next video'], visualSpec: 'Return to hook style. Key takeaway card.', audioSpec: 'Warm authoritative wrap-up.' },
      { id: 'outro', label: 'OUTRO', seconds: 5, words: '0', color: '#525252', purpose: 'End card or loop.', rules: ['Simple channel card'], visualSpec: 'Dark card with branding.', audioSpec: 'Music fades.' },
    ],
  },
  book: {
    id: 'book',
    emoji: '📚',
    color: '#8b5cf6',
    title: 'BOOK SUMMARY',
    rpm: '$8-15 RPM',
    sections: [
      { id: 'hook', label: 'HOOK', seconds: 5, words: '12–18', color: '#dc2626', purpose: 'Make the viewer NEED to know what the book says.', rules: ['Lead with the RESULT, not the title', 'Use a number or bold claim'], visualSpec: 'Book cover with cinematic zoom.', audioSpec: 'Confident, intriguing.' },
      { id: 'context', label: 'BOOK CONTEXT', seconds: 10, words: '25–30', color: '#f59e0b', purpose: 'Establish credibility.', rules: ['Author + credibility marker', 'Core problem in 1 sentence'], visualSpec: 'Author photo, sales number.', audioSpec: 'Informational, authoritative.' },
      { id: 'lessons', label: '3 KEY LESSONS', seconds: 50, words: '120–145', color: '#22c55e', purpose: 'Three lessons that make the viewer feel like they read the book.', rules: ['Exactly 3 lessons', 'Concept + Example per lesson', 'Make each actionable'], visualSpec: 'Bold lesson numbers. Concept visualizations.', audioSpec: 'Teaching energy, warm, builds.' },
      { id: 'transformation', label: 'TRANSFORMATION', seconds: 10, words: '25–30', color: '#8b5cf6', purpose: 'Synthesize all 3 lessons into one powerful sentence.', rules: ['One sentence synthesis', 'Before/after contrast', 'Shareable moment'], visualSpec: 'Bold quote-style text on dark bg.', audioSpec: 'Slower, deliberate, mic-drop.' },
      { id: 'cta', label: 'CTA', seconds: 10, words: '20–28', color: '#06b6d4', purpose: 'Drive saves and tease next video.', rules: ['"Save this"', 'Tease next book', 'Reflection question'], visualSpec: 'Book cover + save text.', audioSpec: 'Warm, direct.' },
      { id: 'outro', label: 'OUTRO', seconds: 5, words: '0', color: '#525252', purpose: 'End card.', rules: ['Loop or branded end card'], visualSpec: 'Dark branded card.', audioSpec: 'Music fades.' },
    ],
  },
  crime_story: {
    id: 'crime_story',
    emoji: '🔪',
    color: '#dc2626',
    title: 'CRIME STORY / TRUE CRIME',
    rpm: '$5-12 RPM',
    sections: [
      { id: 'cold_open', label: 'COLD OPEN', seconds: 5, words: '12–18', color: '#dc2626', purpose: 'Drop viewer INTO the crime. Most shocking detail first.', rules: ['Present tense', 'Specific detail (date, city, amount)', 'No preamble'], visualSpec: 'Dark moody establishing. Red/blue accents.', audioSpec: 'Low, measured, whispering.' },
      { id: 'setup', label: 'THE SETUP', seconds: 15, words: '35–45', color: '#f59e0b', purpose: 'WHO is this person? Make viewer care.', rules: ['Normal person first', 'Relatable detail', 'First sign something is wrong'], visualSpec: '"Normal life" imagery, warm → cool shift.', audioSpec: 'Conversational → drops lower at turn.' },
      { id: 'escalation', label: 'THE ESCALATION', seconds: 35, words: '85–100', color: '#ef4444', purpose: 'Crime unfolds. Stack details rapidly.', rules: ['Rapid-fire facts', 'Use timestamps', '"But it gets worse"', 'At least one near-miss'], visualSpec: 'Rapid montage: evidence, messages, money.', audioSpec: 'Energy rises steadily. Tension builds.' },
      { id: 'twist', label: 'THE TWIST', seconds: 15, words: '35–40', color: '#8b5cf6', purpose: 'The payoff. Must surprise.', rules: ['Ending must SURPRISE', 'Reframe everything'], visualSpec: 'HARD CUT to resolution image.', audioSpec: 'Slow, deliberate, heavy.' },
      { id: 'cta', label: 'CTA / CLIFFHANGER', seconds: 15, words: '30–35', color: '#06b6d4', purpose: 'Drive follows and tease next story.', rules: ['Moral question', '"Save this"', 'Tease Part 2'], visualSpec: 'Branded end card. Teaser image.', audioSpec: 'Direct, personal.' },
      { id: 'loop', label: 'OUTRO', seconds: 5, words: '0', color: '#525252', purpose: 'Loop or end.', rules: ['Loop back to cold open'], visualSpec: 'Seamless loop.', audioSpec: 'Silence.' },
    ],
  },
  tech_explainer: {
    id: 'tech_explainer',
    emoji: '⚡',
    color: '#06b6d4',
    title: 'TECH EXPLAINER',
    rpm: '$8-30 RPM',
    sections: [
      { id: 'wtf_hook', label: 'WTF HOOK', seconds: 5, words: '12–18', color: '#dc2626', purpose: 'Make tech feel URGENT and PERSONAL.', rules: ['Lead with consequence or absurdity', 'Use "you"', 'Exaggeration OK'], visualSpec: 'Bold kinetic text. Glitch effect.', audioSpec: 'Fast, confident, amused.' },
      { id: 'context_bomb', label: 'CONTEXT BOMB', seconds: 15, words: '35–45', color: '#f59e0b', purpose: 'Just enough background.', rules: ['Origin in 1-2 sentences', 'Surprising scale fact', 'No jargon'], visualSpec: 'Timeline graphic. Key number animated.', audioSpec: 'Informational, slightly awed.' },
      { id: 'the_mechanic', label: 'THE MECHANIC — 3 STEPS', seconds: 35, words: '85–100', color: '#22c55e', purpose: 'Break tech into 3 steps with analogies.', rules: ['Exactly 3 steps', 'Analogy per step', 'Simple → clever → mind-blowing'], visualSpec: 'Step headers. Simple animated diagrams.', audioSpec: 'Building excitement per step.' },
      { id: 'so_what', label: 'SO WHAT', seconds: 15, words: '35–40', color: '#8b5cf6', purpose: 'Connect to real life.', rules: ['Daily life examples', 'Forward-looking prediction'], visualSpec: 'Real-world application montage.', audioSpec: 'Confident, forward-looking.' },
      { id: 'cta', label: 'CTA', seconds: 15, words: '30–35', color: '#06b6d4', purpose: 'Drive saves.', rules: ['"Save this"', 'Tease next tech topic', '"Which step blew your mind?"'], visualSpec: '"SAVE THIS" text. Next topic teaser.', audioSpec: 'Warm wrap-up.' },
      { id: 'loop', label: 'OUTRO', seconds: 5, words: '0', color: '#525252', purpose: 'Loop.', rules: ['Loop back to hook'], visualSpec: 'Loop to opening frame.', audioSpec: 'Silence.' },
    ],
  },
  side_hustle: {
    id: 'side_hustle',
    emoji: '💸',
    color: '#22c55e',
    title: 'SIDE HUSTLE / MONEY',
    rpm: '$15-40 RPM',
    sections: [
      { id: 'proof_hook', label: 'PROOF HOOK', seconds: 5, words: '12–18', color: '#dc2626', purpose: 'Show the RESULT first.', rules: ['Specific dollar + timeframe', 'Constraint ("no experience")', 'NEVER "I\'m going to show you"'], visualSpec: 'Income dashboard. Dollar as HUGE text.', audioSpec: 'Casual, direct, calm confidence.' },
      { id: 'myth_kill', label: 'MYTH KILL', seconds: 10, words: '25–30', color: '#f59e0b', purpose: 'Destroy excuses before they think them.', rules: ['Address #1 objection', '"You don\'t need X, Y, Z"'], visualSpec: 'Objections with red X.', audioSpec: 'Empathetic but firm.' },
      { id: 'the_method', label: 'THE METHOD — 3 STEPS', seconds: 45, words: '110–130', color: '#22c55e', purpose: '3 clear actionable steps.', rules: ['Step 1: setup', 'Step 2: the work', 'Step 3: the scale', 'Name SPECIFIC tools'], visualSpec: 'Step title cards. Screen recordings.', audioSpec: 'Instructional, energy builds.' },
      { id: 'proof_again', label: 'PROOF AGAIN', seconds: 10, words: '25–30', color: '#8b5cf6', purpose: 'Loop back to proof.', rules: ['Income + timeframe', 'One "not perfect" moment', 'Growth trajectory'], visualSpec: 'Income growth timeline.', audioSpec: 'Honest, then proud.' },
      { id: 'cta', label: 'CTA', seconds: 15, words: '30–35', color: '#06b6d4', purpose: 'Drive saves.', rules: ['"Save this"', '"Try Step 1 tonight"', 'Tease next method'], visualSpec: '"SAVE THIS" text.', audioSpec: 'Energized, direct.' },
      { id: 'loop', label: 'OUTRO', seconds: 5, words: '0', color: '#525252', purpose: 'Loop.', rules: ['Loop to income proof'], visualSpec: 'Seamless loop.', audioSpec: 'Silence.' },
    ],
  },
};

// Script examples scaled for ~10 min reference
export const LONG_VIRAL_SCRIPT_EXAMPLES = {
  finance: { title: '3 Money Rules Rich People Follow (10 Min Deep Dive)', note: 'Same viral structure as the Short, expanded with deeper examples, more data, and richer storytelling per rule.' },
  book: { title: 'Atomic Habits — Full Breakdown (15 Min)', note: 'Same Hook → Context → 3 Lessons → Transformation → CTA structure, each lesson expanded with author stories and real-world case studies.' },
  crime_story: { title: 'She Married 7 Men (20 Min Documentary)', note: 'Same Cold Open → Setup → Escalation → Twist → CTA, each beat expanded into a mini-chapter with more victims, more detail, more tension.' },
  tech_explainer: { title: 'WiFi Is Lying to You (12 Min Deep Dive)', note: 'Same WTF Hook → Context → 3 Steps → So What → CTA, each step expanded with diagrams, history, and real-world implications.' },
  side_hustle: { title: 'AI Thumbnails $3,800/Month (8 Min Tutorial)', note: 'Same Proof → Myth Kill → 3 Steps → Proof → CTA, each step expanded with screen walkthroughs and specific numbers.' },
};