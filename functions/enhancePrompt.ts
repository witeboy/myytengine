import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const STYLE_DESCRIPTORS = {
  anime: {
    keywords: 'anime style, cell-shaded, vibrant colors, expressive eyes, manga aesthetic',
    details: '2D animation, soft shadows, dynamic poses'
  },
  photorealistic: {
    keywords: 'photorealistic, cinematic, 4K quality, detailed, natural lighting',
    details: 'high definition, sharp focus, professional photography, natural shadows'
  },
  cartoon: {
    keywords: 'cartoon style, bright colors, exaggerated features, playful',
    details: 'simple shapes, bold outlines, cheerful mood'
  },
  oil_colour: {
    keywords: 'oil painting style, brushstrokes, textured, fine art',
    details: 'classic painting technique, rich colors, gallery quality'
  },
  retro_classic: {
    keywords: 'retro vintage style, nostalgic, classic film aesthetic, warm tones',
    details: 'grain texture, color grading, classic composition'
  },
  black_and_white: {
    keywords: 'black and white, monochrome, high contrast, noir aesthetic',
    details: 'dramatic shadows, timeless, classic elegance'
  },
  '60s': {
    keywords: '1960s style, groovy, psychedelic, retro fashion, vibrant',
    details: 'mod design, bold patterns, era-appropriate details'
  },
  '90s': {
    keywords: '1990s style, Y2K aesthetic, grunge, neon, digital',
    details: 'retro tech, bold colors, era-specific design'
  },
  medieval: {
    keywords: 'medieval fantasy, castle, knights, historical, dark ages',
    details: 'period-accurate details, stone textures, torchlight'
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt, asset_style = 'photorealistic', scene_number = 1 } = await req.json();

    if (!prompt) {
      return Response.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const styleInfo = STYLE_DESCRIPTORS[asset_style] || STYLE_DESCRIPTORS.photorealistic;

    // Build enhanced prompt with style and quality descriptors
    const enhancedPrompt = `
Scene ${scene_number}. ${prompt}

Visual Style: ${styleInfo.keywords}
Details: ${styleInfo.details}

Quality requirements: Clear composition, proper framing, well-balanced lighting, professional production value.
Duration: Keep composition consistent for video clips.
`.trim();

    return Response.json({
      success: true,
      original_prompt: prompt,
      enhanced_prompt: enhancedPrompt,
      style: asset_style,
      style_descriptors: styleInfo
    });
  } catch (error) {
    console.error('Error enhancing prompt:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});