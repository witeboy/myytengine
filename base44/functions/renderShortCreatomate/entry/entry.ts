// ══════════════════════════════════════════════════════════════════════
// CREATOMATE CLOUD RENDER — 9:16 Shorts with word-level captions
//
// Submits a render job to Creatomate's API using a dynamic JSON source
// (no template required). Returns a render ID the frontend polls.
//
// Input:
//   videoUrl     — publicly accessible source video URL
//   startSec     — clip start in source
//   endSec       — clip end in source
//   words        — [{word, start, end}] on source timeline (optional)
//   captionStyle — 'hormozi_pro' | 'beast' | 'tiktok' | 'minimal' | 'none'
//   title        — clip title (for logging)
//
// Output:
//   { id, status, url? } — poll via pollCreatomateRender
// ══════════════════════════════════════════════════════════════════════

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CREATOMATE_API = 'https://api.creatomate.com/v1/renders';

// Caption style presets → Creatomate text element settings
const CAPTION_STYLES = {
  hormozi_pro: {
    font_family: 'Montserrat',
    font_weight: '900',
    font_size: '9 vh',
    fill_color: '#FFFFFF',
    stroke_color: '#000000',
    stroke_width: '1.2 vh',
    background_color: 'rgba(0,0,0,0)',
    shadow_color: '#000000',
    shadow_blur: '0.5 vh',
    y_alignment: '75%',
    highlight_color: '#FFD700',
  },
  beast: {
    font_family: 'Bebas Neue',
    font_weight: '700',
    font_size: '10 vh',
    fill_color: '#FFFFFF',
    stroke_color: '#000000',
    stroke_width: '1.5 vh',
    background_color: 'rgba(0,0,0,0)',
    shadow_color: '#FF0000',
    shadow_blur: '1 vh',
    y_alignment: '70%',
    highlight_color: '#FF2D2D',
  },
  tiktok: {
    font_family: 'Inter',
    font_weight: '800',
    font_size: '7 vh',
    fill_color: '#FFFFFF',
    stroke_color: '#000000',
    stroke_width: '0.6 vh',
    background_color: 'rgba(0,0,0,0.4)',
    shadow_color: 'rgba(0,0,0,0)',
    shadow_blur: '0',
    y_alignment: '80%',
    highlight_color: '#00F2EA',
  },
  minimal: {
    font_family: 'Inter',
    font_weight: '600',
    font_size: '6 vh',
    fill_color: '#FFFFFF',
    stroke_color: '#000000',
    stroke_width: '0.4 vh',
    background_color: 'rgba(0,0,0,0)',
    shadow_color: 'rgba(0,0,0,0.5)',
    shadow_blur: '0.3 vh',
    y_alignment: '85%',
    highlight_color: '#FFFFFF',
  },
};

// Chunk words into short caption lines (max 4 words each) aligned to clip timeline
function buildCaptionElements(words, clipStart, clipEnd, style) {
  if (!words || !words.length || !style) return [];
  const preset = CAPTION_STYLES[style];
  if (!preset) return [];

  // Filter to words inside the clip range, normalize to clip-relative times
  const inClip = words
    .filter(w => w.end > clipStart && w.start < clipEnd)
    .map(w => ({
      word: w.word || w.text || '',
      start: Math.max(0, w.start - clipStart),
      end: Math.min(clipEnd - clipStart, w.end - clipStart),
    }))
    .filter(w => w.word && w.end > w.start);

  if (!inClip.length) return [];

  // Group into caption lines of max 3 words or 1.5 seconds
  const lines = [];
  let current = [];
  let lineStart = 0;

  for (const w of inClip) {
    if (current.length === 0) {
      lineStart = w.start;
      current.push(w);
    } else if (current.length >= 3 || (w.end - lineStart) > 1.5) {
      lines.push({
        text: current.map(x => x.word).join(' ').toUpperCase(),
        start: lineStart,
        end: current[current.length - 1].end,
      });
      lineStart = w.start;
      current = [w];
    } else {
      current.push(w);
    }
  }
  if (current.length > 0) {
    lines.push({
      text: current.map(x => x.word).join(' ').toUpperCase(),
      start: lineStart,
      end: current[current.length - 1].end,
    });
  }

  // Build Creatomate text elements, one per caption line
  return lines.map((line, i) => ({
    name: `Caption-${i}`,
    type: 'text',
    track: 2,
    time: line.start,
    duration: Math.max(0.3, line.end - line.start),
    text: line.text,
    font_family: preset.font_family,
    font_weight: preset.font_weight,
    font_size: preset.font_size,
    fill_color: preset.fill_color,
    stroke_color: preset.stroke_color,
    stroke_width: preset.stroke_width,
    background_color: preset.background_color,
    shadow_color: preset.shadow_color,
    shadow_blur: preset.shadow_blur,
    y_alignment: preset.y_alignment,
    x_alignment: '50%',
    width: '90%',
    height: '30%',
    x: '50%',
    y: preset.y_alignment,
    text_wrap: true,
    text_transform: 'uppercase',
    line_height: '110%',
    // Pop-in animation on each line
    animations: [
      {
        time: 'start',
        duration: 0.2,
        transition: true,
        type: 'scale',
        scope: 'element',
        easing: 'elastic-out',
        start_scale: '60%',
        end_scale: '100%',
      },
    ],
  }));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = Deno.env.get('CREATOMATE_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'CREATOMATE_API_KEY not configured' }, { status: 500 });
    }

    const body = await req.json();
    const {
      videoUrl,
      startSec = 0,
      endSec,
      words = [],
      captionStyle = 'hormozi_pro',
      title = 'short',
    } = body;

    if (!videoUrl || endSec == null) {
      return Response.json({ error: 'videoUrl and endSec are required' }, { status: 400 });
    }

    const duration = Number(endSec) - Number(startSec);
    if (duration <= 0 || duration > 180) {
      return Response.json({ error: 'Invalid clip duration (must be 1-180s)' }, { status: 400 });
    }

    // Build elements: video (9:16 cropped) + caption lines
    const elements = [
      {
        name: 'Background',
        type: 'video',
        track: 1,
        time: 0,
        duration,
        source: videoUrl,
        trim_start: Number(startSec),
        trim_duration: duration,
        fit: 'cover',
        // No explicit x/y/width/height → fills the 9:16 output frame
      },
      ...buildCaptionElements(words, Number(startSec), Number(endSec), captionStyle),
    ];

    const source = {
      output_format: 'mp4',
      width: 1080,
      height: 1920,
      frame_rate: 30,
      duration,
      elements,
    };

    console.log(`[Creatomate] Submitting render "${title}" (${duration.toFixed(1)}s, ${elements.length} elements)`);

    const response = await fetch(CREATOMATE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ source }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Creatomate] API error:', response.status, errText);
      return Response.json(
        { error: `Creatomate API returned ${response.status}: ${errText}` },
        { status: 500 }
      );
    }

    const result = await response.json();
    // API returns an array of renders (one per output)
    const render = Array.isArray(result) ? result[0] : result;

    console.log(`[Creatomate] Render queued: ${render.id} (status: ${render.status})`);

    return Response.json({
      id: render.id,
      status: render.status,
      url: render.url || null,
    });
  } catch (error) {
    console.error('[Creatomate] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});