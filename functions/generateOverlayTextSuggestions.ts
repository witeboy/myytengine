import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// generateOverlayTextSuggestions.js
// AI-Powered Overlay Text Generator — CTR Optimized
// ══════════════════════════════════════════════════════════════════

async function callOpenAI(apiKey, messages, maxTokens = 3000) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: maxTokens,
      temperature: 0.8
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

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

const OVERLAY_TEMPLATES = {
  shock_side: { layers: ['headline'], formula: 'MAX 4 WORDS. Shocking number or outcome.' },
  centered_massive: { layers: ['headline'], formula: 'MAX 3 WORDS. Single powerful statement.' },
  stacked_youtube: { layers: ['headline', 'subtext'], formula: 'Headline: 2-3 words. Subtext: 2-4 words.' },
  split_before_after: { layers: ['before_label', 'after_label'], formula: 'Transformation contrast.' },
  income_reveal: { layers: ['amount', 'timeframe'], formula: 'Dollar amount + time period.' },
  warning_alert: { layers: ['warning', 'consequence'], formula: 'STOP/WARNING + result.' },
  question_hook: { layers: ['question'], formula: 'Provocative question with "?"' },
  metric_cards: { layers: ['headline', 'metric1', 'metric2'], formula: 'Headline + 2 metrics.' },
  data_explosion: { layers: ['badge', 'main_stat', 'stat1', 'stat2'], formula: 'Badge + main + 2 stats.' },
  minimal_corner: { layers: ['text'], formula: 'Short subtle text.' }
};

const NICHE_PSYCHOLOGY = {
  finance: {
    triggers: ['money', 'loss aversion', 'aspiration', 'FOMO'],
    words: ['$', 'K', 'M', 'FREE', 'PASSIVE', 'QUIT', 'FIRED', 'RICH', 'BROKE'],
    emotions: ['shock', 'fear', 'aspiration', 'urgency']
  },
  true_crime: {
    triggers: ['mystery', 'justice', 'danger', 'forbidden knowledge'],
    words: ['MURDER', 'MISSING', 'FOUND', 'TRUTH', 'LIES', 'CAUGHT', 'DARK'],
    emotions: ['fear', 'curiosity', 'suspense', 'shock']
  },
  love_story: {
    triggers: ['emotional connection', 'heartbreak', 'hope', 'betrayal'],
    words: ['LOVE', 'HEART', 'LEFT', 'CHEATED', 'FOREVER', 'GOODBYE', 'DIVORCE'],
    emotions: ['sadness', 'hope', 'shock', 'romance']
  },
  technology: {
    triggers: ['innovation', 'efficiency', 'fear of obsolescence', 'power'],
    words: ['AI', 'NEW', 'BETTER', 'FASTER', '10X', 'REPLACED', 'HACK', 'SECRET'],
    emotions: ['curiosity', 'fear', 'excitement', 'superiority']
  },
  explainer: {
    triggers: ['understanding', 'simplification', 'expertise', 'revelation'],
    words: ['WHY', 'HOW', 'TRUTH', 'REALLY', 'ACTUALLY', 'NEVER', 'ALWAYS'],
    emotions: ['curiosity', 'surprise', 'satisfaction']
  },
  diy: {
    triggers: ['accomplishment', 'savings', 'creativity', 'transformation'],
    words: ['EASY', 'CHEAP', '$0', 'HACK', 'TRANSFORM', 'BEFORE', 'AFTER', 'WOW'],
    emotions: ['inspiration', 'satisfaction', 'surprise']
  },
  vlog: {
    triggers: ['connection', 'authenticity', 'drama', 'lifestyle'],
    words: ['DAY', 'LIFE', 'REAL', 'HONEST', 'FINALLY', 'HAPPENED', 'GONE'],
    emotions: ['connection', 'curiosity', 'empathy']
  },
  events: {
    triggers: ['exclusivity', 'timeliness', 'FOMO', 'spectacle'],
    words: ['LIVE', 'NOW', 'BREAKING', 'FIRST', 'EXCLUSIVE', 'INSIDE', 'LEAKED'],
    emotions: ['urgency', 'excitement', 'exclusivity']
  },
  travel: {
    triggers: ['escapism', 'discovery', 'beauty', 'adventure'],
    words: ['HIDDEN', 'SECRET', 'PARADISE', 'CHEAP', 'BEST', 'WORST', 'NEVER'],
    emotions: ['wanderlust', 'curiosity', 'aspiration']
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { project_id, video_title, script_excerpt, niche } = body;

    if (!project_id && !video_title) {
      return Response.json({ error: 'Missing project_id or video_title' }, { status: 400 });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return Response.json({ error: 'OPENAI_API_KEY missing' }, { status: 500 });
    }

    let effectiveTitle = video_title || '';
    let effectiveScript = script_excerpt || '';
    let effectiveNiche = niche || 'explainer';

    if (project_id) {
      const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
      const project = projects[0];
      if (project) {
        effectiveTitle = video_title || project.working_title || project.topic || '';
        effectiveNiche = niche || project.niche || 'explainer';
        
        const scripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
        effectiveScript = script_excerpt || (scripts[0]?.content || '').slice(0, 1500);
      }
    }

    const nichePsych = NICHE_PSYCHOLOGY[effectiveNiche] || NICHE_PSYCHOLOGY.explainer;

    const templateRequirements = Object.entries(OVERLAY_TEMPLATES).map(([id, t]) => {
      return `${id}: Layers: [${t.layers.join(', ')}]. Formula: ${t.formula}`;
    }).join('\n');

    const systemPrompt = `You are a YouTube thumbnail text expert with 10+ years experience optimizing CTR.
You know exactly what text makes viewers click. Return ONLY valid JSON.`;

    const userPrompt = `Generate HIGH-CTR overlay text for this video:

VIDEO TITLE: ${effectiveTitle}
NICHE: ${effectiveNiche}
SCRIPT EXCERPT: ${effectiveScript.slice(0, 800)}

NICHE PSYCHOLOGY:
- Triggers: ${nichePsych.triggers.join(', ')}
- Power words: ${nichePsych.words.join(', ')}
- Emotions: ${nichePsych.emotions.join(', ')}

TEMPLATE REQUIREMENTS:
${templateRequirements}

Generate JSON with this structure (3 options per template):
{
  "suggestions": {
    "shock_side": [
      { "headline": "TEXT", "ctr_score": 9, "psychology": "why it works" },
      { "headline": "ALT", "ctr_score": 8, "psychology": "reason" },
      { "headline": "THIRD", "ctr_score": 8, "psychology": "reason" }
    ],
    "centered_massive": [
      { "headline": "TEXT", "ctr_score": 9, "psychology": "reason" },
      { "headline": "ALT", "ctr_score": 8, "psychology": "reason" },
      { "headline": "THIRD", "ctr_score": 8, "psychology": "reason" }
    ],
    "stacked_youtube": [
      { "headline": "TOP", "subtext": "BOTTOM", "ctr_score": 9, "psychology": "reason" },
      { "headline": "ALT", "subtext": "ALT", "ctr_score": 8, "psychology": "reason" },
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
      { "warning": "STOP TEXT", "consequence": "RESULT", "ctr_score": 9, "psychology": "reason" },
      { "warning": "ALT", "consequence": "ALT", "ctr_score": 8, "psychology": "reason" },
      { "warning": "THIRD", "consequence": "OPTION", "ctr_score": 8, "psychology": "reason" }
    ],
    "question_hook": [
      { "question": "QUESTION?", "ctr_score": 9, "psychology": "reason" },
      { "question": "ALT?", "ctr_score": 8, "psychology": "reason" },
      { "question": "THIRD?", "ctr_score": 8, "psychology": "reason" }
    ],
    "metric_cards": [
      { "headline": "TEXT", "metric1": "STAT ↑", "metric2": "STAT ↑", "ctr_score": 9, "psychology": "reason" },
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
    "template_id": "which template is best",
    "reason": "why"
  },
  "title_analysis": {
    "primary_emotion": "main emotion",
    "hook_type": "type",
    "target_audience": "who"
  }
}

RULES:
- ALL TEXT UPPERCASE except minimal_corner
- Text SHORT (2-4 words per layer)
- Use specific numbers when relevant
- Create curiosity gaps
- Return ONLY JSON`;

    const responseText = await callOpenAI(OPENAI_API_KEY, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], 3000);

    const parsed = parseOpenAIJson(responseText);

    if (!parsed || !parsed.suggestions) {
      return Response.json({ 
        error: 'Failed to generate suggestions',
        raw: responseText.slice(0, 500)
      }, { status: 500 });
    }

    return Response.json({
      success: true,
      suggestions: parsed.suggestions,
      best_overall: parsed.best_overall,
      title_analysis: parsed.title_analysis,
      niche: effectiveNiche,
      niche_psychology: nichePsych
    });

  } catch (error) {
    console.error('Overlay text generation error:', error);
    return Response.json({ 
      error: error.message || 'Generation failed'
    }, { status: 500 });
  }
});
