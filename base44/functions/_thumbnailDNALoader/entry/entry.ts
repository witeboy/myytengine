import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ══════════════════════════════════════════════════════════════════
// THUMBNAIL DNA LOADER — utility endpoint
//
// Given a project_id, returns the merged ChannelThumbnailDNA for that
// project's channel, with safe defaults and pre-parsed JSON arrays.
//
// This is the single source of truth used by:
//   - generateThumbnails       (concept phase)
//   - generateThumbnailImage   (render phase)
//   - generateNewThumbnailImage (face-swap render)
//
// Response shape:
// {
//   success: true,
//   has_dna: boolean,
//   dna: {
//     channel_id, face_reference_urls:[], face_descriptions:[],
//     primary_color, secondary_color, background_color, text_color,
//     font_family, text_style_preset, mood_bias, emotion_bias,
//     preferred_templates:[], banned_templates:[],
//     composition_style, visual_style_lock, logo_url, style_notes,
//     is_active
//   } | null
// }
// ══════════════════════════════════════════════════════════════════

function safeParseArr(s) {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; }
  catch (_) { return []; }
}

export async function loadChannelDNA(base44, project_id) {
  if (!project_id) return { has_dna: false, dna: null, channel_id: null };

  const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
  const project = projects[0];
  const channel_id = project?.channel_id;
  if (!channel_id) return { has_dna: false, dna: null, channel_id: null };

  const dnaList = await base44.asServiceRole.entities.ChannelThumbnailDNA.filter({ channel_id });
  const dna = dnaList[0];

  if (!dna || dna.is_active === false) {
    return { has_dna: false, dna: null, channel_id };
  }

  return {
    has_dna: true,
    channel_id,
    dna: {
      id: dna.id,
      channel_id,
      face_reference_urls: safeParseArr(dna.face_reference_urls),
      face_descriptions: safeParseArr(dna.face_descriptions),
      primary_color: dna.primary_color || '',
      secondary_color: dna.secondary_color || '',
      background_color: dna.background_color || '',
      text_color: dna.text_color || '#FFFFFF',
      font_family: dna.font_family || 'Impact',
      text_style_preset: dna.text_style_preset || 'mrbeast',
      mood_bias: dna.mood_bias || 'drama',
      emotion_bias: dna.emotion_bias || 'auto',
      preferred_templates: safeParseArr(dna.preferred_templates),
      banned_templates: safeParseArr(dna.banned_templates),
      composition_style: dna.composition_style || 'auto',
      visual_style_lock: dna.visual_style_lock || '',
      logo_url: dna.logo_url || '',
      style_notes: dna.style_notes || '',
      is_active: dna.is_active !== false,
    }
  };
}

// Build a concise text block to inject into Gemini concept prompts
export function dnaPromptBlock(dna) {
  if (!dna) return '';
  const lines = [];
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('🔒 CHANNEL THUMBNAIL DNA — MANDATORY BRAND LOCK');
  lines.push('Every concept you generate MUST obey these channel-wide rules.');
  lines.push('These override any conflicting template defaults.');
  lines.push('═══════════════════════════════════════════════════════════════');

  if (dna.face_reference_urls.length > 0) {
    lines.push(`👤 LOCKED CHARACTER(S): ${dna.face_reference_urls.length} reference face(s) will be injected at render time. Compose every concept so the main character is clearly framed (rule-of-thirds, waist-up to face-closeup) and the face expression is the PRIMARY focal point.`);
    dna.face_descriptions.forEach((d, i) => {
      if (d && d.trim()) lines.push(`   • Character ${i + 1}: ${d.trim()}`);
    });
  } else {
    lines.push('👤 No locked character — you may describe any human/object subject.');
  }

  const colors = [
    dna.primary_color && `primary ${dna.primary_color}`,
    dna.secondary_color && `secondary ${dna.secondary_color}`,
    dna.background_color && `background ${dna.background_color}`,
    dna.text_color && `text ${dna.text_color}`,
  ].filter(Boolean).join(', ');
  if (colors) lines.push(`🎨 LOCKED PALETTE: ${colors}. Every concept color_scheme MUST use these.`);

  if (dna.font_family) lines.push(`🔤 LOCKED FONT: ${dna.font_family} (text overlay is composited separately — just respect the aesthetic in your prompts).`);
  if (dna.mood_bias && dna.mood_bias !== 'drama') lines.push(`🎭 MOOD BIAS: ${dna.mood_bias} — lean color grade toward this mood.`);
  if (dna.emotion_bias && dna.emotion_bias !== 'auto') lines.push(`💥 EMOTION BIAS: Lead with "${dna.emotion_bias}" as the primary click trigger wherever possible.`);

  if (dna.preferred_templates.length > 0) {
    lines.push(`✅ PREFERRED TEMPLATES (use these first): ${dna.preferred_templates.join(', ')}`);
  }
  if (dna.banned_templates.length > 0) {
    lines.push(`🚫 BANNED TEMPLATES (never use): ${dna.banned_templates.join(', ')}`);
  }

  if (dna.composition_style && dna.composition_style !== 'auto') {
    lines.push(`📐 LOCKED COMPOSITION: ${dna.composition_style.replace(/_/g, ' ')}`);
  }
  if (dna.visual_style_lock) {
    lines.push(`🎬 LOCKED VISUAL STYLE: ${dna.visual_style_lock} — overrides the project's visual style.`);
  }
  if (dna.style_notes) {
    lines.push(`📝 CHANNEL DIRECTIVES: ${dna.style_notes}`);
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  return lines.join('\n');
}

// Main HTTP handler — used by frontend to read DNA for a project
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, channel_id } = await req.json();

    let resolved;
    if (channel_id) {
      const dnaList = await base44.asServiceRole.entities.ChannelThumbnailDNA.filter({ channel_id });
      const dna = dnaList[0];
      if (!dna) {
        resolved = { has_dna: false, dna: null, channel_id };
      } else {
        resolved = {
          has_dna: dna.is_active !== false,
          channel_id,
          dna: {
            id: dna.id,
            channel_id,
            face_reference_urls: safeParseArr(dna.face_reference_urls),
            face_descriptions: safeParseArr(dna.face_descriptions),
            primary_color: dna.primary_color || '',
            secondary_color: dna.secondary_color || '',
            background_color: dna.background_color || '',
            text_color: dna.text_color || '#FFFFFF',
            font_family: dna.font_family || 'Impact',
            text_style_preset: dna.text_style_preset || 'mrbeast',
            mood_bias: dna.mood_bias || 'drama',
            emotion_bias: dna.emotion_bias || 'auto',
            preferred_templates: safeParseArr(dna.preferred_templates),
            banned_templates: safeParseArr(dna.banned_templates),
            composition_style: dna.composition_style || 'auto',
            visual_style_lock: dna.visual_style_lock || '',
            logo_url: dna.logo_url || '',
            style_notes: dna.style_notes || '',
            is_active: dna.is_active !== false,
          }
        };
      }
    } else {
      resolved = await loadChannelDNA(base44, project_id);
    }

    return Response.json({ success: true, ...resolved });
  } catch (error) {
    console.error('_thumbnailDNALoader error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});