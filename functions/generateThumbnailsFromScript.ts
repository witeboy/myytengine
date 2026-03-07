// ══════════════════════════════════════════════════════════════════
// generateThumbnailsFromScript.js — V6 COMPLETE
// ══════════════════════════════════════════════════════════════════
// Place in: Base44 Backend Functions
// Generates thumbnail concepts with text-free images + overlay config
// ══════════════════════════════════════════════════════════════════

import { base44 } from './base44Client.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ══════════════════════════════════════════════════════════════════
// EMOTION → COLOR PSYCHOLOGY SYSTEMS
// ══════════════════════════════════════════════════════════════════

const EMOTION_COLOR_SYSTEMS = {
  shock: {
    emotion: 'shock',
    background: 'deep purple to black gradient, dramatic shadows',
    accent: 'electric yellow, bright gold sparks',
    textColor: '#FFFFFF',
    textOutline: '#000000',
    mood: 'jaw-dropping revelation, mind-blown moment'
  },
  warning: {
    emotion: 'warning',
    background: 'dark crimson vignette, urgent red undertones',
    accent: 'white with red glow, warning symbols',
    textColor: '#FFFFFF',
    textOutline: '#CC0000',
    mood: 'urgent alert, stop-what-youre-doing energy'
  },
  success: {
    emotion: 'success',
    background: 'dark teal to emerald gradient, prosperity glow',
    accent: 'gold sparkles, mint green highlights',
    textColor: '#00FF88',
    textOutline: '#000000',
    mood: 'achievement unlocked, winning feeling'
  },
  money: {
    emotion: 'money',
    background: 'near black with gold particle dust, luxury dark',
    accent: 'neon green numbers, gold accents',
    textColor: '#00FF88',
    textOutline: '#000000',
    mood: 'wealth revelation, money mindset'
  },
  comparison: {
    emotion: 'comparison',
    background: 'split dark blue-gray and amber, glowing center divide',
    accent: 'white divider line, contrasting halves',
    textColor: '#FFFFFF',
    textOutline: '#000000',
    mood: 'clear contrast, decisive comparison'
  },
  curiosity: {
    emotion: 'curiosity',
    background: 'deep blue to purple gradient, mysterious shadows',
    accent: 'cyan glow, question mark energy',
    textColor: '#00FFFF',
    textOutline: '#000000',
    mood: 'must-know secret, forbidden knowledge'
  },
  fear: {
    emotion: 'fear',
    background: 'pure black with red vignette, horror undertones',
    accent: 'blood red accents, sharp shadows',
    textColor: '#FFFFFF',
    textOutline: '#000000',
    mood: 'danger lurking, scary truth'
  },
  inspiration: {
    emotion: 'inspiration',
    background: 'orange to amber sunrise gradient, warm glow',
    accent: 'warm yellow rays, hopeful light',
    textColor: '#FFFFFF',
    textOutline: '#000000',
    mood: 'motivational, you-can-do-this energy'
  }
};

// ══════════════════════════════════════════════════════════════════
// COMPOSITION TYPES (Layout Blueprints)
// ══════════════════════════════════════════════════════════════════

const COMPOSITION_TYPES = {
  A: {
    name: 'Reaction + Floating Metrics',
    layout: 'Subject positioned left-center, glass morphism metric cards floating right side',
    textZone: 'upper-left',
    subjectPosition: 'left 40%'
  },
  B: {
    name: 'Before/After Split',
    layout: '50/50 vertical split with glowing divider line down center',
    textZone: 'upper-center',
    subjectPosition: 'split across both halves'
  },
  C: {
    name: 'Single Massive Element',
    layout: 'One dramatic object fills 60% of frame, subject smaller',
    textZone: 'upper-left',
    subjectPosition: 'corner or edge'
  },
  D: {
    name: 'Data Explosion',
    layout: 'Subject center with floating charts, numbers, graphs around them',
    textZone: 'upper-center',
    subjectPosition: 'center 50%'
  },
  E: {
    name: 'The Reveal Frame',
    layout: 'Curtain or door opening effect, light streaming through gap',
    textZone: 'upper-left',
    subjectPosition: 'emerging from gap'
  },
  F: {
    name: 'Confrontational Face',
    layout: 'Extreme close-up face filling right 60%, heavy negative space left',
    textZone: 'upper-left',
    subjectPosition: 'right side, cropped at edges'
  },
  G: {
    name: 'Lifestyle Proof',
    layout: 'Person with luxury item or proof element, aspirational setting',
    textZone: 'upper-left',
    subjectPosition: 'center with item'
  },
  H: {
    name: 'Audit/Reaction Split',
    layout: 'Face reacting on left, data/evidence on right',
    textZone: 'upper-center',
    subjectPosition: 'left 40%, content right 60%'
  }
};

// ══════════════════════════════════════════════════════════════════
// TEXT OVERLAY TEMPLATE MAPPING
// Maps thumbnail templates to text overlay templates
// ══════════════════════════════════════════════════════════════════

const TEXT_OVERLAY_MAPPING = {
  shock_face: 'shock_side',
  income_reveal: 'income_reveal',
  warning_alert: 'warning_alert',
  secret_hidden: 'question_hook',
  breaking_news: 'centered_massive',
  before_after: 'split_before_after',
  numbered_list: 'stacked_youtube',
  identity_challenge: 'shock_side',
  finance_versus: 'split_before_after',
  lifestyle_proof: 'income_reveal',
  finance_audit: 'data_explosion',
  cliffhanger: 'shock_side',
  true_account: 'centered_massive',
  cold_case_file: 'shock_side',
  suspect_reveal: 'shock_side',
  heartbreak_headline: 'shock_side',
  relationship_red_flag: 'warning_alert',
  destination_wow: 'centered_massive',
  hidden_gem: 'question_hook',
  ai_takeover: 'warning_alert',
  cheat_code_reveal: 'data_explosion',
  tech_comparison: 'split_before_after',
  plot_twist_tease: 'shock_side',
  deep_lore_dive: 'question_hook',
  reaction_recap: 'metric_cards',
  shorts_hook_frame: 'centered_massive'
};

// ══════════════════════════════════════════════════════════════════
// TEMPLATE DNA — ALL 26 TEMPLATES
// ══════════════════════════════════════════════════════════════════

const TEMPLATE_DNA = {
  // ─── FINANCE / MONEY ───────────────────────────────────────────
  shock_face: {
    id: "shock_face",
    name: "The Shock Face",
    emotion: "shock",
    composition: "F",
    face_required: true,
    face_expression: "EXTREME SHOCK: eyes wide, eyebrows raised, jaw dropped, hands on cheeks",
    text_formula: "MAX 4 WORDS. SHOCKING NUMBER or OUTCOME."
  },
  
  income_reveal: {
    id: "income_reveal",
    name: "The Income Reveal",
    emotion: "money",
    composition: "G",
    face_required: false,
    face_expression: "PROUD CONFIDENCE: chest out, calm knowing smile",
    text_formula: "SPECIFIC DOLLAR AMOUNT + TIME. e.g. '$47,382 IN 6 MONTHS'"
  },
  
  warning_alert: {
    id: "warning_alert",
    name: "The Warning/Alert",
    emotion: "warning",
    composition: "F",
    face_required: false,
    face_expression: "URGENT WARNING: intense stare, pointing finger",
    text_formula: "STOP [THIS] or WARNING: [OUTCOME]."
  },
  
  secret_hidden: {
    id: "secret_hidden",
    name: "The Secret/Hidden Truth",
    emotion: "curiosity",
    composition: "E",
    face_required: false,
    face_expression: "CONSPIRATORIAL: finger to lips, knowing half-smile",
    text_formula: "HIDDEN [TRUTH]. MAX 4 WORDS."
  },
  
  breaking_news: {
    id: "breaking_news",
    name: "The Breaking News",
    emotion: "warning",
    composition: "D",
    face_required: false,
    face_expression: "URGENT PRESENTER: pointing at chart, leaning forward",
    text_formula: "BREAKING: [WHAT CHANGED]."
  },
  
  before_after: {
    id: "before_after",
    name: "The Before/After Split",
    emotion: "comparison",
    composition: "B",
    face_required: false,
    face_expression: "LEFT: defeated. RIGHT: confident.",
    text_formula: "STATE_A → STATE_B. e.g. 'BROKE → $200K'"
  },
  
  numbered_list: {
    id: "numbered_list",
    name: "The Numbered List Bomb",
    emotion: "curiosity",
    composition: "C",
    face_required: false,
    face_expression: "KNOWLEDGEABLE: confident half-smile, one finger raised",
    text_formula: "ODD NUMBER + WHAT THEY WANT."
  },
  
  identity_challenge: {
    id: "identity_challenge",
    name: "The Identity Challenge",
    emotion: "warning",
    composition: "F",
    face_required: true,
    face_expression: "ACCUSATORY: raised eyebrow, pointing at camera",
    text_formula: "IF YOU [DO THIS] = [IDENTITY]."
  },
  
  finance_versus: {
    id: "finance_versus",
    name: "The Finance Versus",
    emotion: "comparison",
    composition: "B",
    face_required: false,
    face_expression: "DECISIVE: arms crossed, confident",
    text_formula: "[OPTION A] VS [OPTION B]."
  },
  
  lifestyle_proof: {
    id: "lifestyle_proof",
    name: "The Lifestyle Proof",
    emotion: "money",
    composition: "G",
    face_required: false,
    face_expression: "CASUAL ABUNDANCE: touching luxury item casually",
    text_formula: "LUXURY ITEM + SOURCE."
  },
  
  finance_audit: {
    id: "finance_audit",
    name: "The Finance Audit Reaction",
    emotion: "shock",
    composition: "H",
    face_required: true,
    face_expression: "AUDITOR HORROR: eyes wide squinting, hand to temple",
    text_formula: "FINANCIAL DISASTER NUMBER."
  },

  // ─── STORYTELLING / DOCUMENTARY ────────────────────────────────
  cliffhanger: {
    id: "cliffhanger",
    name: "The Cliffhanger Frame",
    emotion: "curiosity",
    composition: "F",
    face_required: true,
    face_expression: "TENSE: eyes wide looking OFF-FRAME, jaw tensed",
    text_formula: "INCOMPLETE REVELATION with ellipsis."
  },
  
  true_account: {
    id: "true_account",
    name: "The True Account Banner",
    emotion: "curiosity",
    composition: "C",
    face_required: false,
    face_expression: "DOCUMENTARY SUBJECT: calm haunted expression",
    text_formula: "TRUE STORY: [WHAT HAPPENED]."
  },

  // ─── TRUE CRIME ────────────────────────────────────────────────
  cold_case_file: {
    id: "cold_case_file",
    name: "The Cold Case File",
    emotion: "fear",
    composition: "C",
    face_required: false,
    face_expression: "HAUNTED: troubled expression, dark circles",
    text_formula: "THE [CRIME] THAT [UNSOLVED]."
  },
  
  suspect_reveal: {
    id: "suspect_reveal",
    name: "The Suspect Reveal",
    emotion: "fear",
    composition: "F",
    face_required: true,
    face_expression: "HALF-SHADOWED: half face in deep shadow",
    text_formula: "ACCUSATORY WITHOUT CONFIRMING."
  },

  // ─── RELATIONSHIPS ─────────────────────────────────────────────
  heartbreak_headline: {
    id: "heartbreak_headline",
    name: "The Heartbreak Headline",
    emotion: "fear",
    composition: "F",
    face_required: true,
    face_expression: "RAW PAIN: eyes glistening, lip trembling",
    text_formula: "UNRESOLVED PAINFUL MOMENT."
  },
  
  relationship_red_flag: {
    id: "relationship_red_flag",
    name: "The Relationship Red Flag",
    emotion: "warning",
    composition: "F",
    face_required: true,
    face_expression: "PROTECTIVE WARNING: raised eyebrow skepticism",
    text_formula: "IF HE DOES THIS — RUN."
  },

  // ─── TRAVEL ────────────────────────────────────────────────────
  destination_wow: {
    id: "destination_wow",
    name: "The Destination Wow Shot",
    emotion: "inspiration",
    composition: "C",
    face_required: false,
    face_expression: "AWESTRUCK: jaw dropped, arms spread",
    text_formula: "[PLACE] FOR $AMOUNT."
  },
  
  hidden_gem: {
    id: "hidden_gem",
    name: "The Hidden Gem Reveal",
    emotion: "curiosity",
    composition: "E",
    face_required: false,
    face_expression: "DISCOVERER EXCITEMENT: genuine surprise-joy",
    text_formula: "HIDDEN [PLACE] NOBODY KNOWS."
  },

  // ─── AI / TECH ─────────────────────────────────────────────────
  ai_takeover: {
    id: "ai_takeover",
    name: "The AI Takeover Frame",
    emotion: "warning",
    composition: "D",
    face_required: false,
    face_expression: "ALARMED: wide eyes, raised stop hand",
    text_formula: "AI THREAT + IMPACT."
  },
  
  cheat_code_reveal: {
    id: "cheat_code_reveal",
    name: "The Cheat Code Reveal",
    emotion: "curiosity",
    composition: "E",
    face_required: false,
    face_expression: "CONSPIRATORIAL: leaning forward, eyebrow raised",
    text_formula: "TIME COMPRESSION. e.g. '10 HRS → 5 MINS'"
  },
  
  tech_comparison: {
    id: "tech_comparison",
    name: "The Tech Comparison Bomb",
    emotion: "comparison",
    composition: "B",
    face_required: false,
    face_expression: "DECISIVE: confident direct gaze",
    text_formula: "[TOOL A] VS [TOOL B]."
  },

  // ─── MOVIES / ENTERTAINMENT ────────────────────────────────────
  plot_twist_tease: {
    id: "plot_twist_tease",
    name: "The Plot Twist Tease",
    emotion: "shock",
    composition: "F",
    face_required: true,
    face_expression: "MIND-BLOWN: hands on head, eyes maximum width",
    text_formula: "THE TWIST YOU MISSED."
  },
  
  deep_lore_dive: {
    id: "deep_lore_dive",
    name: "The Deep Lore Dive",
    emotion: "curiosity",
    composition: "E",
    face_required: false,
    face_expression: "DETECTIVE: magnifying glass gesture, focused",
    text_formula: "THE CLUE NOBODY NOTICED."
  },
  
  reaction_recap: {
    id: "reaction_recap",
    name: "The Reaction Recap",
    emotion: "shock",
    composition: "H",
    face_required: true,
    face_expression: "AUTHENTIC REACTION: real tears or genuine laugh",
    text_formula: "EMOTIONAL REACTION. e.g. 'I CRIED 3 TIMES'"
  },

  // ─── SHORTS ────────────────────────────────────────────────────
  shorts_hook_frame: {
    id: "shorts_hook_frame",
    name: "The Shorts Hook Frame",
    emotion: "shock",
    composition: "F",
    face_required: false,
    face_expression: "EXTREME emotion amplified 200%",
    text_formula: "1-2 LINES MASSIVE. POV hook."
  }
};

// ══════════════════════════════════════════════════════════════════
// DETECT EMOTION FROM CONTENT
// ══════════════════════════════════════════════════════════════════

function detectEmotionFromContent(title, script, niche) {
  const text = `${title} ${script}`.toLowerCase();
  
  // Warning triggers
  if (/stop|warning|don't|never|avoid|mistake|wrong|danger|scam|fraud/.test(text)) {
    return 'warning';
  }
  
  // Money triggers
  if (/\$[\d,]+|income|revenue|profit|money|rich|wealth|earning|salary/.test(text)) {
    return 'money';
  }
  
  // Comparison triggers
  if (/vs\.?|versus|compared|better|worse|before.*after|transformation/.test(text)) {
    return 'comparison';
  }
  
  // Fear triggers
  if (/murder|death|crime|scary|horror|creepy|dark|mystery|disappear/.test(text)) {
    return 'fear';
  }
  
  // Curiosity triggers
  if (/secret|hidden|truth|reveal|discover|unknown|why|how/.test(text)) {
    return 'curiosity';
  }
  
  // Inspiration triggers  
  if (/success|achieve|goal|dream|inspire|motivat|can do|possible/.test(text)) {
    return 'inspiration';
  }
  
  // Default to shock for engagement
  return 'shock';
}

// ══════════════════════════════════════════════════════════════════
// GENERATE OVERLAY TEXT FROM TITLE
// ══════════════════════════════════════════════════════════════════

function generateOverlayText(title, template) {
  // Extract key elements from title
  const words = title.split(' ');
  
  // Look for numbers/money
  const moneyMatch = title.match(/\$[\d,]+/);
  const numberMatch = title.match(/\d+/);
  
  // Template-specific text generation
  switch (template.id) {
    case 'income_reveal':
    case 'lifestyle_proof':
      return moneyMatch ? moneyMatch[0] : (numberMatch ? `$${numberMatch[0]}` : words.slice(0, 3).join(' ').toUpperCase());
    
    case 'before_after':
    case 'finance_versus':
    case 'tech_comparison':
      return 'BEFORE|AFTER'; // Special marker for split text
    
    case 'warning_alert':
    case 'relationship_red_flag':
      return `STOP ${words.slice(0, 2).join(' ')}`.toUpperCase();
    
    case 'numbered_list':
      return numberMatch ? `${numberMatch[0]} SECRETS` : '7 SECRETS';
    
    default:
      // Take first 4 impactful words
      const impactWords = words.filter(w => w.length > 3).slice(0, 4);
      return impactWords.join(' ').toUpperCase() || words.slice(0, 4).join(' ').toUpperCase();
  }
}

// ══════════════════════════════════════════════════════════════════
// SELECT TEMPLATES
// ══════════════════════════════════════════════════════════════════

function selectTemplates(title, script, niche, selectedTemplateIds = null) {
  // If user selected specific templates, use those
  if (selectedTemplateIds && selectedTemplateIds.length === 3) {
    return selectedTemplateIds.map(id => TEMPLATE_DNA[id] || TEMPLATE_DNA.shock_face);
  }
  
  // Auto-select based on content
  const emotion = detectEmotionFromContent(title, script, niche);
  
  // Find templates matching this emotion
  const matchingTemplates = Object.values(TEMPLATE_DNA).filter(t => t.emotion === emotion);
  
  // If not enough, add some universal ones
  const universalTemplates = [
    TEMPLATE_DNA.shock_face,
    TEMPLATE_DNA.curiosity,
    TEMPLATE_DNA.numbered_list
  ];
  
  const pool = [...matchingTemplates, ...universalTemplates];
  
  // Select 3 unique templates
  const selected = [];
  for (const template of pool) {
    if (selected.length >= 3) break;
    if (!selected.find(t => t.id === template.id)) {
      selected.push(template);
    }
  }
  
  return selected;
}

// ══════════════════════════════════════════════════════════════════
// BUILD IMAGE PROMPT
// ══════════════════════════════════════════════════════════════════

function buildImagePrompt(template, title, niche) {
  const emotion = template.emotion;
  const colorSystem = EMOTION_COLOR_SYSTEMS[emotion] || EMOTION_COLOR_SYSTEMS.shock;
  const composition = COMPOSITION_TYPES[template.composition] || COMPOSITION_TYPES.F;
  
  return `THUMBNAIL IMAGE FOR YOUTUBE. CINEMATIC QUALITY.

COMPOSITION: ${composition.name} — ${composition.layout}

SUBJECT/EXPRESSION: ${template.face_expression}

COLOR PALETTE:
- Background: ${colorSystem.background}
- Accents: ${colorSystem.accent}
- Mood: ${colorSystem.mood}

LIGHTING: Dramatic three-point lighting with strong key light, moody fill, and rim light for depth.

CRITICAL REQUIREMENTS:
- NO TEXT, NO WORDS, NO LETTERS, NO NUMBERS IN THE IMAGE
- Leave clean negative space in ${composition.textZone} for text overlay
- Subject positioned at ${composition.subjectPosition}
- 16:9 aspect ratio, 1920x1080
- Photorealistic, high contrast, saturated colors
- Professional studio quality

NICHE CONTEXT: ${niche}
VIDEO TOPIC: ${title}`;
}

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
    const { 
      project_id, 
      video_title, 
      selected_templates,
      custom_prompt 
    } = body;

    if (!project_id) {
      return new Response(JSON.stringify({ error: 'Missing project_id' }), { status: 400 });
    }

    // Load project data
    const project = await base44.entities.Projects.get(project_id);
    if (!project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404 });
    }

    // Load script
    const scripts = await base44.entities.Scripts.filter({ project_id });
    const scriptContent = scripts[0]?.content || '';
    
    const effectiveTitle = video_title || project.working_title || project.topic || 'Untitled Video';
    const projectNiche = project.niche || 'general';

    // Select 3 templates
    const templates = selectTemplates(
      effectiveTitle, 
      scriptContent, 
      projectNiche, 
      selected_templates
    );

    // Delete existing concepts for this project
    const existing = await base44.entities.ThumbnailConcepts.filter({ project_id });
    for (const concept of existing) {
      await base44.entities.ThumbnailConcepts.delete(concept.id);
    }

    // Generate concepts for each template
    const concepts = [];
    
    for (let i = 0; i < templates.length; i++) {
      const template = templates[i];
      const emotion = template.emotion;
      const colorSystem = EMOTION_COLOR_SYSTEMS[emotion] || EMOTION_COLOR_SYSTEMS.shock;
      
      // Generate image prompt (text-free)
      const imagePrompt = custom_prompt || buildImagePrompt(template, effectiveTitle, projectNiche);
      
      // Generate overlay text
      const overlayText = generateOverlayText(effectiveTitle, template);
      
      // Get text overlay template ID
      const textTemplateId = TEXT_OVERLAY_MAPPING[template.id] || 'shock_side';
      
      // Build text style config
      const textStyle = {
        templateId: textTemplateId,
        layerTexts: {
          headline: overlayText,
          subtext: '',
          before_label: 'BEFORE',
          after_label: 'AFTER'
        },
        layerColors: {
          headline: colorSystem.textColor,
          subtext: '#FFFFFF'
        }
      };
      
      // Create concept in database
      const concept = await base44.entities.ThumbnailConcepts.create({
        project_id,
        rank: i + 1,
        concept_type: template.id,
        concept_description: `${template.name}: ${template.text_formula}`,
        image_prompt: imagePrompt,
        text_overlay: overlayText,
        text_style: JSON.stringify(textStyle),
        color_scheme: JSON.stringify({
          emotion: emotion,
          background: colorSystem.background,
          accent: colorSystem.accent,
          textColor: colorSystem.textColor
        }),
        ctr_score: 7 + Math.floor(Math.random() * 3), // 7-9
        is_selected: i === 0,
        status: 'pending_image'
      });
      
      concepts.push(concept);
    }

    return new Response(JSON.stringify({
      success: true,
      concepts,
      message: `Generated ${concepts.length} thumbnail concepts`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Thumbnail generation failed'
    }), { status: 500 });
  }
}
