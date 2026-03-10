import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// generateThumbnailsFromScript.js — V7 COMPLETE
// ══════════════════════════════════════════════════════════════════
// + Image style variations (demographics, professions, framing)
// + Niche-specific templates
// ══════════════════════════════════════════════════════════════════

const SUBJECT_DEMOGRAPHICS = {
  young_male: { prompt: 'young man in his early 20s, clean-shaven, modern casual style' },
  young_female: { prompt: 'young woman in her early 20s, modern casual style, natural makeup' },
  male_30s: { prompt: 'man in his 30s, professional appearance, light stubble optional' },
  female_30s: { prompt: 'woman in her 30s, professional appearance, confident posture' },
  mature_male: { prompt: 'mature man in his 40s-50s, distinguished look' },
  mature_female: { prompt: 'mature woman in her 40s-50s, elegant professional look' }
};

const SUBJECT_PROFESSIONS = {
  developer: { prompt: 'wearing casual tech startup attire, hoodie or t-shirt, glasses optional' },
  banker: { prompt: 'wearing formal business suit, tie, professional Wall Street look' },
  entrepreneur: { prompt: 'smart casual business attire, confident startup founder energy' },
  creator: { prompt: 'casual trendy style, ring light reflections in eyes, studio hints' },
  stay_at_home_parent: { prompt: 'comfortable casual home attire, warm authentic look' },
  student: { prompt: 'casual youthful style, backpack or books hints' },
  fitness: { prompt: 'athletic wear, fit physique, gym or outdoor hints' },
  corporate: { prompt: 'premium business attire, corner office hints, power pose' },
  creative: { prompt: 'artistic eclectic style, creative studio hints' },
  casual: { prompt: 'everyday casual clothes, relatable everyman/everywoman look' }
};

const SUBJECT_FRAMING = {
  face_closeup: { prompt: 'extreme close-up of face filling 60% of frame' },
  head_shoulders: { prompt: 'head and shoulders framing, upper torso visible' },
  upper_body: { prompt: 'upper body from waist up, hands can gesture' },
  full_body: { prompt: 'full body visible, environmental context' },
  side_profile: { prompt: 'dramatic side profile, silhouette potential' },
  over_shoulder: { prompt: 'over-the-shoulder view looking at something' }
};

const NICHE_TEMPLATES = {
  finance: {
    primary: ['shock_face', 'income_reveal', 'warning_alert'],
    secondary: ['before_after', 'finance_audit', 'lifestyle_proof'],
    colors: { bg: 'dark teal to black', accent: 'gold, neon green', text: '#00FF88' },
    props: ['money stacks', 'laptop with charts', 'luxury items'],
    expressions: ['shock at numbers', 'proud confidence', 'worried concern']
  },
  true_crime: {
    primary: ['cold_case_file', 'suspect_reveal', 'cliffhanger'],
    secondary: ['warning_alert', 'secret_hidden', 'true_account'],
    colors: { bg: 'pure black with red vignette', accent: 'blood red', text: '#FFFFFF' },
    props: ['police tape', 'evidence files', 'dark shadows'],
    expressions: ['haunted stare', 'fearful eyes', 'suspicious glance']
  },
  love_story: {
    primary: ['heartbreak_headline', 'before_after', 'cliffhanger'],
    secondary: ['secret_hidden', 'true_account', 'relationship_red_flag'],
    colors: { bg: 'deep red to black gradient', accent: 'pink, gold', text: '#FFFFFF' },
    props: ['wedding ring', 'torn photo', 'roses'],
    expressions: ['heartbroken tears', 'hopeful smile', 'longing gaze']
  },
  technology: {
    primary: ['ai_takeover', 'cheat_code_reveal', 'tech_comparison'],
    secondary: ['breaking_news', 'numbered_list', 'warning_alert'],
    colors: { bg: 'dark blue to purple', accent: 'cyan, electric blue', text: '#00FFFF' },
    props: ['glowing screens', 'holographic UI', 'futuristic devices'],
    expressions: ['amazed discovery', 'intense focus', 'worried about AI']
  },
  explainer: {
    primary: ['numbered_list', 'secret_hidden', 'question_hook'],
    secondary: ['warning_alert', 'before_after', 'cheat_code_reveal'],
    colors: { bg: 'deep blue gradient', accent: 'yellow, white', text: '#FFD700' },
    props: ['lightbulb', 'pointing gesture', 'diagrams'],
    expressions: ['eureka moment', 'knowledgeable nod', 'curious raised eyebrow']
  },
  diy: {
    primary: ['before_after', 'cheat_code_reveal', 'numbered_list'],
    secondary: ['income_reveal', 'warning_alert', 'lifestyle_proof'],
    colors: { bg: 'warm orange to brown', accent: 'yellow, white', text: '#FFFFFF' },
    props: ['tools', 'raw materials', 'finished project'],
    expressions: ['proud accomplishment', 'focused concentration']
  },
  vlog: {
    primary: ['cliffhanger', 'reaction_recap', 'lifestyle_proof'],
    secondary: ['breaking_news', 'heartbreak_headline', 'secret_hidden'],
    colors: { bg: 'natural lighting tones', accent: 'warm sunlight', text: '#FFFFFF' },
    props: ['camera', 'daily life items', 'location landmarks'],
    expressions: ['genuine surprise', 'candid laughter', 'emotional moment']
  },
  events: {
    primary: ['breaking_news', 'reaction_recap', 'cliffhanger'],
    secondary: ['shock_face', 'plot_twist_tease', 'secret_hidden'],
    colors: { bg: 'dramatic dark with spotlights', accent: 'red, gold', text: '#FFFFFF' },
    props: ['event venue', 'crowd hints', 'stage lights'],
    expressions: ['amazed audience reaction', 'excited anticipation']
  },
  travel: {
    primary: ['destination_wow', 'hidden_gem', 'before_after'],
    secondary: ['numbered_list', 'income_reveal', 'secret_hidden'],
    colors: { bg: 'destination-specific colors', accent: 'golden hour', text: '#FFFFFF' },
    props: ['stunning scenery', 'passport', 'airplane'],
    expressions: ['awestruck wonder', 'excited explorer']
  }
};

const EMOTION_COLOR_SYSTEMS = {
  shock: { background: 'deep purple to black', accent: 'electric yellow', textColor: '#FFFFFF', textOutline: '#000000' },
  warning: { background: 'dark crimson vignette', accent: 'white with red glow', textColor: '#FFFFFF', textOutline: '#CC0000' },
  success: { background: 'dark teal to emerald', accent: 'gold sparkles', textColor: '#00FF88', textOutline: '#000000' },
  money: { background: 'near black with gold dust', accent: 'neon green', textColor: '#00FF88', textOutline: '#000000' },
  comparison: { background: 'split blue-gray and amber', accent: 'white divider', textColor: '#FFFFFF', textOutline: '#000000' },
  curiosity: { background: 'deep blue to purple', accent: 'cyan glow', textColor: '#00FFFF', textOutline: '#000000' },
  fear: { background: 'pure black with red vignette', accent: 'blood red', textColor: '#FFFFFF', textOutline: '#000000' },
  inspiration: { background: 'orange to amber sunrise', accent: 'warm yellow rays', textColor: '#FFFFFF', textOutline: '#000000' }
};

const TEMPLATE_DNA = {
  shock_face: { emotion: 'shock', composition: 'F' },
  income_reveal: { emotion: 'money', composition: 'G' },
  warning_alert: { emotion: 'warning', composition: 'F' },
  secret_hidden: { emotion: 'curiosity', composition: 'E' },
  breaking_news: { emotion: 'warning', composition: 'D' },
  before_after: { emotion: 'comparison', composition: 'B' },
  numbered_list: { emotion: 'curiosity', composition: 'C' },
  identity_challenge: { emotion: 'warning', composition: 'F' },
  finance_versus: { emotion: 'comparison', composition: 'B' },
  lifestyle_proof: { emotion: 'money', composition: 'G' },
  finance_audit: { emotion: 'shock', composition: 'H' },
  cliffhanger: { emotion: 'curiosity', composition: 'F' },
  true_account: { emotion: 'curiosity', composition: 'C' },
  cold_case_file: { emotion: 'fear', composition: 'C' },
  suspect_reveal: { emotion: 'fear', composition: 'F' },
  heartbreak_headline: { emotion: 'fear', composition: 'F' },
  relationship_red_flag: { emotion: 'warning', composition: 'F' },
  destination_wow: { emotion: 'inspiration', composition: 'C' },
  hidden_gem: { emotion: 'curiosity', composition: 'E' },
  ai_takeover: { emotion: 'warning', composition: 'D' },
  cheat_code_reveal: { emotion: 'curiosity', composition: 'E' },
  tech_comparison: { emotion: 'comparison', composition: 'B' },
  plot_twist_tease: { emotion: 'shock', composition: 'F' },
  deep_lore_dive: { emotion: 'curiosity', composition: 'E' },
  reaction_recap: { emotion: 'shock', composition: 'H' },
  shorts_hook_frame: { emotion: 'shock', composition: 'F' },
  question_hook: { emotion: 'curiosity', composition: 'F' }
};

const TEXT_OVERLAY_MAPPING = {
  shock_face: 'shock_side',
  income_reveal: 'income_reveal',
  warning_alert: 'warning_alert',
  before_after: 'split_before_after',
  finance_versus: 'split_before_after',
  tech_comparison: 'split_before_after',
  finance_audit: 'data_explosion',
  reaction_recap: 'metric_cards',
  numbered_list: 'stacked_youtube',
  breaking_news: 'centered_massive',
  destination_wow: 'centered_massive',
  secret_hidden: 'question_hook',
  hidden_gem: 'question_hook',
  cheat_code_reveal: 'data_explosion',
  cold_case_file: 'shock_side',
  suspect_reveal: 'shock_side',
  heartbreak_headline: 'shock_side',
  cliffhanger: 'shock_side',
  lifestyle_proof: 'income_reveal',
  question_hook: 'question_hook'
};

const COMPOSITION_TYPES = {
  A: { name: 'Reaction + Metrics', textZone: 'upper-left' },
  B: { name: 'Before/After Split', textZone: 'upper-center' },
  C: { name: 'Single Massive Element', textZone: 'upper-left' },
  D: { name: 'Data Explosion', textZone: 'upper-center' },
  E: { name: 'The Reveal Frame', textZone: 'upper-left' },
  F: { name: 'Confrontational Face', textZone: 'upper-left' },
  G: { name: 'Lifestyle Proof', textZone: 'upper-left' },
  H: { name: 'Audit/Reaction Split', textZone: 'upper-center' }
};

function buildImagePrompt(template, niche, imageStyle, title) {
  const templateData = TEMPLATE_DNA[template] || TEMPLATE_DNA.shock_face;
  const emotion = templateData.emotion;
  const colorSystem = EMOTION_COLOR_SYSTEMS[emotion] || EMOTION_COLOR_SYSTEMS.shock;
  const composition = COMPOSITION_TYPES[templateData.composition] || COMPOSITION_TYPES.F;
  const nicheData = NICHE_TEMPLATES[niche] || NICHE_TEMPLATES.explainer;

  const demographic = SUBJECT_DEMOGRAPHICS[imageStyle.demographic] || SUBJECT_DEMOGRAPHICS.young_male;
  const profession = SUBJECT_PROFESSIONS[imageStyle.profession] || SUBJECT_PROFESSIONS.casual;
  const framing = SUBJECT_FRAMING[imageStyle.framing] || SUBJECT_FRAMING.head_shoulders;

  const expression = nicheData.expressions[Math.floor(Math.random() * nicheData.expressions.length)];
  const prop = nicheData.props[Math.floor(Math.random() * nicheData.props.length)];

  return `YOUTUBE THUMBNAIL IMAGE. CINEMATIC QUALITY. 16:9 ASPECT RATIO.

SUBJECT: ${demographic.prompt}, ${profession.prompt}
FRAMING: ${framing.prompt}
EXPRESSION: ${expression}

COMPOSITION: ${composition.name}

COLOR PALETTE:
- Background: ${nicheData.colors.bg || colorSystem.background}
- Accents: ${nicheData.colors.accent || colorSystem.accent}

PROPS/ELEMENTS: ${prop}

LIGHTING: Dramatic three-point lighting, strong key light, moody fill, rim light.

CRITICAL REQUIREMENTS:
- NO TEXT, NO WORDS, NO LETTERS, NO NUMBERS IN THE IMAGE
- Leave clean negative space in ${composition.textZone} for text overlay
- Expression must be READABLE at 120px thumbnail size
- Photorealistic, high contrast, saturated colors`;
}

function selectTemplatesForNiche(niche, selectedTemplateIds = null) {
  if (selectedTemplateIds && selectedTemplateIds.length === 3) {
    return selectedTemplateIds;
  }
  
  const nicheData = NICHE_TEMPLATES[niche] || NICHE_TEMPLATES.explainer;
  const primary = [...nicheData.primary];
  const secondary = [...nicheData.secondary];
  
  for (let i = primary.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [primary[i], primary[j]] = [primary[j], primary[i]];
  }
  
  return [primary[0], primary[1], secondary[Math.floor(Math.random() * secondary.length)]];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { 
      project_id, 
      video_title, 
      selected_templates,
      image_style = {},
      custom_prompt 
    } = body;

    if (!project_id) {
      return Response.json({ error: 'Missing project_id' }, { status: 400 });
    }

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const scripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const effectiveTitle = video_title || project.working_title || project.topic || 'Untitled';
    const projectNiche = project.niche || 'explainer';

    const finalImageStyle = {
      demographic: image_style.demographic || 'young_male',
      profession: image_style.profession || 'casual',
      framing: image_style.framing || 'head_shoulders'
    };

    const templateIds = selectTemplatesForNiche(projectNiche, selected_templates);

    // Delete existing concepts
    const existing = await base44.asServiceRole.entities.ThumbnailConcepts.filter({ project_id });
    for (const concept of existing) {
      await base44.asServiceRole.entities.ThumbnailConcepts.delete(concept.id);
    }

    const concepts = [];
    
    for (let i = 0; i < templateIds.length; i++) {
      const templateId = templateIds[i];
      const templateData = TEMPLATE_DNA[templateId] || TEMPLATE_DNA.shock_face;
      const emotion = templateData.emotion;
      const colorSystem = EMOTION_COLOR_SYSTEMS[emotion];
      
      const imagePrompt = custom_prompt || buildImagePrompt(
        templateId, 
        projectNiche, 
        finalImageStyle, 
        effectiveTitle
      );
      
      const textTemplateId = TEXT_OVERLAY_MAPPING[templateId] || 'shock_side';
      const overlayText = effectiveTitle.split(' ').slice(0, 4).join(' ').toUpperCase();
      
      const textStyle = {
        templateId: textTemplateId,
        layerTexts: { headline: overlayText },
        layerColors: { headline: colorSystem?.textColor || '#FFFFFF' },
        sizeMultiplier: 1.0
      };

      const concept = await base44.asServiceRole.entities.ThumbnailConcepts.create({
        project_id,
        rank: i + 1,
        concept_type: templateId,
        concept_description: `${templateId.replace(/_/g, ' ')} — ${projectNiche} style`,
        image_prompt: imagePrompt,
        text_overlay: overlayText,
        text_style: JSON.stringify(textStyle),
        color_scheme: JSON.stringify({ emotion, ...colorSystem, niche: projectNiche }),
        image_style: JSON.stringify(finalImageStyle),
        ctr_score: 7 + Math.floor(Math.random() * 3),
        is_selected: i === 0,
        status: 'pending_image'
      });
      
      concepts.push(concept);
    }

    return Response.json({
      success: true,
      concepts,
      image_style: finalImageStyle,
      niche: projectNiche,
      message: `Generated ${concepts.length} thumbnail concepts`
    });

  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return Response.json({ 
      error: error.message || 'Thumbnail generation failed'
    }, { status: 500 });
  }
});