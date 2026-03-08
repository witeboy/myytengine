// ══════════════════════════════════════════════════════════════════
// generateOverlayTextSuggestions.js
// AI-Powered Overlay Text Generator — CTR Optimized
// ══════════════════════════════════════════════════════════════════
// Place in: Base44 Backend Functions
// Returns overlay text suggestions for ALL templates based on content
// ══════════════════════════════════════════════════════════════════

import { base44 } from './base44Client.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ══════════════════════════════════════════════════════════════════
// TEXT OVERLAY TEMPLATES — Must match frontend
// ══════════════════════════════════════════════════════════════════

const OVERLAY_TEMPLATES = {
  shock_side: {
    id: 'shock_side',
    name: 'Shock Side Text',
    layers: ['headline'],
    formula: 'MAX 4 WORDS. Shocking number or painful outcome. Use "?" for questions.',
    examples: ['$10 A DAY?', 'I LOST $50K', 'HE QUIT?!', 'FIRED AT 25']
  },
  centered_massive: {
    id: 'centered_massive',
    name: 'Centered Massive',
    layers: ['headline'],
    formula: 'MAX 3 WORDS. Single powerful statement. All caps.',
    examples: ['NEVER AGAIN', 'IT HAPPENED', 'THE TRUTH', 'I WAS WRONG']
  },
  stacked_youtube: {
    id: 'stacked_youtube',
    name: 'YouTube Stacked',
    layers: ['headline', 'subtext'],
    formula: 'Headline: 2-3 words hook. Subtext: 2-4 words context.',
    examples: [
      { headline: 'YOUTUBE', subtext: 'EXPOSED' },
      { headline: 'I TESTED', subtext: 'EVERY AI TOOL' },
      { headline: 'THE REAL', subtext: 'REASON WHY' }
    ]
  },
  split_before_after: {
    id: 'split_before_after',
    name: 'Before/After Split',
    layers: ['before_label', 'after_label'],
    formula: 'Transformation contrast. Numbers work best.',
    examples: [
      { before_label: 'BROKE', after_label: '$200K' },
      { before_label: '0 SUBS', after_label: '1M SUBS' },
      { before_label: 'DAY 1', after_label: 'DAY 365' }
    ]
  },
  income_reveal: {
    id: 'income_reveal',
    name: 'Income Reveal',
    layers: ['amount', 'timeframe'],
    formula: 'Specific odd dollar amount + time period.',
    examples: [
      { amount: '$47,382', timeframe: 'IN 6 MONTHS' },
      { amount: '$12,847', timeframe: 'THIS WEEK' },
      { amount: '$156K', timeframe: 'AT 23' }
    ]
  },
  warning_alert: {
    id: 'warning_alert',
    name: 'Warning Alert',
    layers: ['warning', 'consequence'],
    formula: 'STOP/WARNING + what to avoid. Consequence optional.',
    examples: [
      { warning: 'STOP DOING THIS', consequence: "YOU'RE LOSING MONEY" },
      { warning: 'NEVER SAY THIS', consequence: 'TO YOUR BOSS' },
      { warning: "DON'T BUY", consequence: 'UNTIL YOU SEE THIS' }
    ]
  },
  question_hook: {
    id: 'question_hook',
    name: 'Question Hook',
    layers: ['question'],
    formula: 'Provocative question. Use "?" Must create curiosity gap.',
    examples: ['$10 A DAY?', 'IS HE LYING?', 'WORTH $500?', 'TOO LATE?']
  },
  metric_cards: {
    id: 'metric_cards',
    name: 'Metric Cards',
    layers: ['headline', 'metric1', 'metric2'],
    formula: 'Motivational headline + 2 impressive metrics.',
    examples: [
      { headline: 'YOU CAN DO IT', metric1: '300K Subscribers ↑', metric2: '$150K Revenue ↑' },
      { headline: 'IT WORKED', metric1: '10X Growth ↑', metric2: '500K Views ↑' }
    ]
  },
  data_explosion: {
    id: 'data_explosion',
    name: 'Data Explosion',
    layers: ['badge', 'main_stat', 'stat1', 'stat2'],
    formula: 'Badge label + main word + 2 impressive stats.',
    examples: [
      { badge: 'HIGH CTR', main_stat: 'THUMBNAIL', stat1: '10X VIEWS', stat2: '17% CTR' },
      { badge: 'VIRAL', main_stat: 'STRATEGY', stat1: '1M VIEWS', stat2: '48 HOURS' }
    ]
  },
  minimal_corner: {
    id: 'minimal_corner',
    name: 'Minimal Corner',
    layers: ['text'],
    formula: 'Short subtle text. Let image speak.',
    examples: ['the truth', 'watch this', 'part 2', 'finally']
  }
};

// ══════════════════════════════════════════════════════════════════
// NICHE-SPECIFIC PSYCHOLOGY
// ══════════════════════════════════════════════════════════════════

const NICHE_PSYCHOLOGY = {
  finance: {
    triggers: ['money', 'loss aversion', 'aspiration', 'fear of missing out'],
    words: ['$', 'K', 'M', 'FREE', 'PASSIVE', 'QUIT', 'FIRED', 'RICH', 'BROKE'],
    emotions: ['shock', 'fear', 'aspiration', 'urgency']
  },
  true_crime: {
    triggers: ['mystery', 'justice', 'danger', 'forbidden knowledge'],
    words: ['MURDER', 'MISSING', 'FOUND', 'TRUTH', 'LIES', 'CAUGHT', 'ESCAPED', 'DARK'],
    emotions: ['fear', 'curiosity', 'suspense', 'shock']
  },
  love_story: {
    triggers: ['emotional connection', 'heartbreak', 'hope', 'betrayal'],
    words: ['LOVE', 'HEART', 'LEFT', 'CHEATED', 'FOREVER', 'GOODBYE', 'WEDDING', 'DIVORCE'],
    emotions: ['sadness', 'hope', 'shock', 'romance']
  },
  technology: {
    triggers: ['innovation', 'efficiency', 'fear of obsolescence', 'power'],
    words: ['AI', 'NEW', 'BETTER', 'FASTER', '10X', 'REPLACED', 'HACK', 'SECRET'],
    emotions: ['curiosity', 'fear', 'excitement', 'superiority']
  },
  explainer: {
    triggers: ['understanding', 'simplification', 'expertise', 'revelation'],
    words: ['WHY', 'HOW', 'TRUTH', 'REALLY', 'ACTUALLY', 'NEVER', 'ALWAYS', 'SECRET'],
    emotions: ['curiosity', 'surprise', 'satisfaction']
  },
  diy: {
    triggers: ['accomplishment', 'savings', 'creativity', 'transformation'],
    words: ['EASY', 'CHEAP', '$0', 'HACK', 'TRANSFORM', 'BEFORE', 'AFTER', 'WOW'],
    emotions: ['inspiration', 'satisfaction', 'surprise']
  },
  vlog: {
    triggers: ['connection', 'authenticity', 'drama', 'lifestyle'],
    words: ['DAY', 'LIFE', 'REAL', 'HONEST', 'FINALLY', 'HAPPENED', 'GONE', 'BACK'],
    emotions: ['connection', 'curiosity', 'empathy']
  },
  events: {
    triggers: ['exclusivity', 'timeliness', 'FOMO', 'spectacle'],
    words: ['LIVE', 'NOW', 'BREAKING', 'FIRST', 'EXCLUSIVE', 'INSIDE', 'BEHIND', 'LEAKED'],
    emotions: ['urgency', 'excitement', 'exclusivity']
  },
  travel: {
    triggers: ['escapism', 'discovery', 'beauty', 'adventure'],
    words: ['HIDDEN', 'SECRET', 'PARADISE', 'CHEAP', 'BEST', 'WORST', 'NEVER', 'MUST'],
    emotions: ['wanderlust', 'curiosity', 'aspiration']
  }
};

// ══════════════════════════════════════════════════════════════════
// FAST JSON PARSER
// ══════════════════════════════════════════════════════════════════

function parseOpenAIJson(text) {
  if (!text || typeof text !== 'string') return null;
  
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  
  if (start === -1 || end === -1 || end <= start) return null;
  
  let jsonStr = text.slice(start, end + 1);
  jsonStr = jsonStr
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/,\s*([}\]])/g, '$1');
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

export default async function handler(req) {
  try {
    const body = await req.json();
    const { project_id, video_title, script_excerpt, niche } = body;

    if (!project_id && !video_title) {
      return new Response(JSON.stringify({ error: 'Missing project_id or video_title' }), { status: 400 });
    }

    let effectiveTitle = video_title || '';
    let effectiveScript = script_excerpt || '';
    let effectiveNiche = niche || 'general';

    // Load from project if ID provided
    if (project_id) {
      const project = await base44.entities.Projects.get(project_id);
      if (project) {
        effectiveTitle = video_title || project.working_title || project.topic || '';
        effectiveNiche = niche || project.niche || 'general';
        
        const scripts = await base44.entities.Scripts.filter({ project_id });
        effectiveScript = script_excerpt || (scripts[0]?.content || '').slice(0, 1500);
      }
    }

    // Get niche psychology
    const nichePsych = NICHE_PSYCHOLOGY[effectiveNiche] || NICHE_PSYCHOLOGY.explainer;

    // Build template requirements string
    const templateRequirements = Object.values(OVERLAY_TEMPLATES).map(t => {
      const exampleStr = Array.isArray(t.examples) 
        ? t.examples.map(e => typeof e === 'string' ? e : JSON.stringify(e)).join(' | ')
        : '';
      return `${t.id}: Layers: [${t.layers.join(', ')}]. Formula: ${t.formula}. Examples: ${exampleStr}`;
    }).join('\n');

    // ════════════════════════════════════════════════════════════════
    // AI PROMPT — Generate overlay text for ALL templates
    // ════════════════════════════════════════════════════════════════

    const systemPrompt = `You are a YouTube thumbnail text expert with 10+ years experience optimizing CTR.
You know exactly what text makes viewers click. You understand psychological triggers.
Your text suggestions consistently achieve 15%+ CTR.
Return ONLY valid JSON.`;

    const userPrompt = `Generate HIGH-CTR overlay text for this video, optimized for each template:

VIDEO TITLE: ${effectiveTitle}
NICHE: ${effectiveNiche}
SCRIPT EXCERPT: ${effectiveScript.slice(0, 800)}

NICHE PSYCHOLOGY:
- Triggers: ${nichePsych.triggers.join(', ')}
- Power words: ${nichePsych.words.join(', ')}
- Emotions: ${nichePsych.emotions.join(', ')}

TEMPLATE REQUIREMENTS:
${templateRequirements}

Generate JSON with this EXACT structure (3 options per template):
{
  "suggestions": {
    "shock_side": [
      { "headline": "TEXT HERE", "ctr_score": 9, "psychology": "why it works" },
      { "headline": "ALT TEXT", "ctr_score": 8, "psychology": "reason" },
      { "headline": "THIRD OPTION", "ctr_score": 8, "psychology": "reason" }
    ],
    "centered_massive": [
      { "headline": "TEXT", "ctr_score": 9, "psychology": "reason" },
      { "headline": "ALT", "ctr_score": 8, "psychology": "reason" },
      { "headline": "THIRD", "ctr_score": 8, "psychology": "reason" }
    ],
    "stacked_youtube": [
      { "headline": "TOP", "subtext": "BOTTOM", "ctr_score": 9, "psychology": "reason" },
      { "headline": "ALT TOP", "subtext": "ALT BOTTOM", "ctr_score": 8, "psychology": "reason" },
      { "headline": "THIRD", "subtext": "OPTION", "ctr_score": 8, "psychology": "reason" }
    ],
    "split_before_after": [
      { "before_label": "BEFORE", "after_label": "AFTER", "ctr_score": 9, "psychology": "reason" },
      { "before_label": "ALT", "after_label": "ALT", "ctr_score": 8, "psychology": "reason" },
      { "before_label": "THIRD", "after_label": "OPTION", "ctr_score": 8, "psychology": "reason" }
    ],
    "income_reveal": [
      { "amount": "$XX,XXX", "timeframe": "TIME", "ctr_score": 9, "psychology": "reason" },
      { "amount": "$XX,XXX", "timeframe": "TIME", "ctr_score": 8, "psychology": "reason" },
      { "amount": "$XX,XXX", "timeframe": "TIME", "ctr_score": 8, "psychology": "reason" }
    ],
    "warning_alert": [
      { "warning": "STOP/WARNING", "consequence": "RESULT", "ctr_score": 9, "psychology": "reason" },
      { "warning": "ALT", "consequence": "ALT", "ctr_score": 8, "psychology": "reason" },
      { "warning": "THIRD", "consequence": "OPTION", "ctr_score": 8, "psychology": "reason" }
    ],
    "question_hook": [
      { "question": "QUESTION?", "ctr_score": 9, "psychology": "reason" },
      { "question": "ALT?", "ctr_score": 8, "psychology": "reason" },
      { "question": "THIRD?", "ctr_score": 8, "psychology": "reason" }
    ],
    "metric_cards": [
      { "headline": "MOTIVATION", "metric1": "STAT ↑", "metric2": "STAT ↑", "ctr_score": 9, "psychology": "reason" },
      { "headline": "ALT", "metric1": "ALT ↑", "metric2": "ALT ↑", "ctr_score": 8, "psychology": "reason" },
      { "headline": "THIRD", "metric1": "THIRD ↑", "metric2": "THIRD ↑", "ctr_score": 8, "psychology": "reason" }
    ],
    "data_explosion": [
      { "badge": "LABEL", "main_stat": "WORD", "stat1": "STAT1", "stat2": "STAT2", "ctr_score": 9, "psychology": "reason" },
      { "badge": "ALT", "main_stat": "ALT", "stat1": "ALT", "stat2": "ALT", "ctr_score": 8, "psychology": "reason" },
      { "badge": "THIRD", "main_stat": "THIRD", "stat1": "THIRD", "stat2": "THIRD", "ctr_score": 8, "psychology": "reason" }
    ],
    "minimal_corner": [
      { "text": "subtle text", "ctr_score": 7, "psychology": "reason" },
      { "text": "alt text", "ctr_score": 7, "psychology": "reason" },
      { "text": "third", "ctr_score": 7, "psychology": "reason" }
    ]
  },
  "best_overall": {
    "template_id": "which template works best for this video",
    "reason": "why this template is optimal"
  },
  "title_analysis": {
    "primary_emotion": "main emotion to trigger",
    "hook_type": "shock/curiosity/fear/aspiration",
    "target_audience": "who will click"
  }
}

RULES:
- ALL TEXT MUST BE UPPERCASE except minimal_corner
- Text must be SHORT (2-4 words per layer)
- Use specific numbers when relevant (odd numbers work better)
- Create curiosity gaps — don't give everything away
- Each suggestion must be psychologically justified
- ctr_score from 1-10 based on expected click rate
- Return ONLY the JSON object`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 3000,
      temperature: 0.8
    });

    const responseText = completion.choices[0]?.message?.content || '';
    const parsed = parseOpenAIJson(responseText);

    if (!parsed || !parsed.suggestions) {
      return new Response(JSON.stringify({ 
        error: 'Failed to generate suggestions',
        raw: responseText.slice(0, 500)
      }), { status: 500 });
    }

    // ════════════════════════════════════════════════════════════════
    // RETURN RESPONSE
    // ════════════════════════════════════════════════════════════════

    return new Response(JSON.stringify({
      success: true,
      suggestions: parsed.suggestions,
      best_overall: parsed.best_overall,
      title_analysis: parsed.title_analysis,
      niche: effectiveNiche,
      niche_psychology: nichePsych
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Overlay text generation error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Generation failed'
    }), { status: 500 });
  }
}
