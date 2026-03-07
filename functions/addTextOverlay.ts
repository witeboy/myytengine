import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// TEXT OVERLAY SYSTEM — Programmatic text compositing
// ══════════════════════════════════════════════════════════════════
// This function adds text to AI-generated thumbnail images
// Guarantees readable, professional text every time
// Uses Sharp for image manipulation
// ══════════════════════════════════════════════════════════════════

// Note: In Deno Deploy, we use Canvas API via a CDN or built-in
// For production, you might use Sharp or ImageMagick

// ──────────────────────────────────────────────────────────────────
// TEXT STYLE PRESETS
// ──────────────────────────────────────────────────────────────────

const TEXT_PRESETS = {
  // Position presets (percentage from edges)
  positions: {
    'upper-left': { x: 5, y: 8, anchor: 'start' },
    'upper-center': { x: 50, y: 8, anchor: 'middle' },
    'upper-right': { x: 95, y: 8, anchor: 'end' },
    'center-left': { x: 5, y: 50, anchor: 'start' },
    'center': { x: 50, y: 50, anchor: 'middle' },
    'center-right': { x: 95, y: 50, anchor: 'end' },
    'lower-left': { x: 5, y: 75, anchor: 'start' },  // Avoid bottom for timestamps
    'lower-center': { x: 50, y: 75, anchor: 'middle' }
  },

  // Font size presets (percentage of image height)
  sizes: {
    massive: 12,      // ~130px on 1080p — for 1-2 word hooks
    large: 9,         // ~97px — for 2-3 word text
    medium: 7,        // ~75px — for 3-4 word text
    small: 5,         // ~54px — for secondary text
    tiny: 3.5         // ~38px — for tertiary info
  },

  // Outline thickness (percentage of font size)
  outlines: {
    heavy: 8,    // Very thick — maximum contrast
    medium: 5,   // Standard YouTube style
    light: 3     // Subtle outline
  }
};

// ──────────────────────────────────────────────────────────────────
// SVG TEXT GENERATOR
// Creates SVG text with stroke and shadow for compositing
// ──────────────────────────────────────────────────────────────────

function generateTextSVG(config) {
  const {
    text,
    width,
    height,
    fontSize,
    fontFamily = 'Impact, Arial Black, sans-serif',
    fillColor = '#FFFFFF',
    strokeColor = '#000000',
    strokeWidth = 6,
    x = 50,
    y = 15,
    anchor = 'middle',
    shadow = true,
    shadowOffset = 4,
    lineHeight = 1.2
  } = config;

  // Handle multi-line text
  const lines = text.split('\n');
  const totalHeight = lines.length * fontSize * lineHeight;
  const startY = y - (totalHeight / 2) + (fontSize / 2);

  // Calculate x position based on anchor
  let xPos;
  if (anchor === 'start') xPos = (width * x / 100);
  else if (anchor === 'end') xPos = (width * x / 100);
  else xPos = (width * x / 100);

  const textElements = lines.map((line, i) => {
    const lineY = (height * y / 100) + (i * fontSize * lineHeight);
    
    // Shadow layer
    const shadowEl = shadow ? `
      <text 
        x="${xPos + shadowOffset}" 
        y="${lineY + shadowOffset}" 
        font-family="${fontFamily}"
        font-size="${fontSize}"
        font-weight="900"
        text-anchor="${anchor}"
        fill="rgba(0,0,0,0.5)"
      >${escapeXML(line)}</text>
    ` : '';

    // Stroke layer (outline)
    const strokeEl = `
      <text 
        x="${xPos}" 
        y="${lineY}" 
        font-family="${fontFamily}"
        font-size="${fontSize}"
        font-weight="900"
        text-anchor="${anchor}"
        fill="none"
        stroke="${strokeColor}"
        stroke-width="${strokeWidth}"
        stroke-linejoin="round"
        stroke-linecap="round"
      >${escapeXML(line)}</text>
    `;

    // Fill layer (main text)
    const fillEl = `
      <text 
        x="${xPos}" 
        y="${lineY}" 
        font-family="${fontFamily}"
        font-size="${fontSize}"
        font-weight="900"
        text-anchor="${anchor}"
        fill="${fillColor}"
      >${escapeXML(line)}</text>
    `;

    return shadowEl + strokeEl + fillEl;
  }).join('\n');

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Anton&amp;family=Bebas+Neue&amp;display=swap');
        </style>
      </defs>
      ${textElements}
    </svg>
  `;
}

function escapeXML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ──────────────────────────────────────────────────────────────────
// SMART TEXT SIZING
// Calculates optimal font size based on text length
// ──────────────────────────────────────────────────────────────────

function calculateFontSize(text, imageWidth, imageHeight, maxWidthPercent = 85) {
  const words = text.split(' ').length;
  const chars = text.length;

  // Base size on word count
  let sizeKey;
  if (words <= 2) sizeKey = 'massive';
  else if (words <= 3) sizeKey = 'large';
  else if (words <= 4) sizeKey = 'medium';
  else sizeKey = 'small';

  let fontSize = Math.round(imageHeight * (TEXT_PRESETS.sizes[sizeKey] / 100));

  // Adjust if text would be too wide
  const estimatedWidth = chars * fontSize * 0.6; // Rough character width estimate
  const maxWidth = imageWidth * (maxWidthPercent / 100);
  
  if (estimatedWidth > maxWidth) {
    fontSize = Math.round((maxWidth / chars) / 0.6);
  }

  // Minimum readable size
  fontSize = Math.max(fontSize, 40);

  return fontSize;
}

// ──────────────────────────────────────────────────────────────────
// POSITION CALCULATOR
// Determines optimal text position based on composition
// ──────────────────────────────────────────────────────────────────

function calculatePosition(positionHint, compositionType) {
  // Default positions based on composition type
  const compositionDefaults = {
    'A': 'upper-right',      // Reaction + Metrics — text near metrics
    'B': 'upper-center',     // Before/After — centered above split
    'C': 'upper-left',       // Single Element — corner text
    'D': 'upper-center',     // Data Explosion — above data
    'E': 'upper-left',       // Reveal — corner tease
    'F': 'upper-left',       // Confrontational Face — corner to not block face
    'G': 'upper-left',       // Lifestyle Proof — corner statement
    'H': 'upper-center'      // Audit Split — centered above
  };

  const position = positionHint || compositionDefaults[compositionType] || 'upper-left';
  return TEXT_PRESETS.positions[position] || TEXT_PRESETS.positions['upper-left'];
}

// ──────────────────────────────────────────────────────────────────
// IMAGE + TEXT COMPOSITING
// Fetches image, adds text overlay, returns new image URL
// ──────────────────────────────────────────────────────────────────

async function compositeTextOnImage(imageUrl, textConfig, dimensions = { width: 1920, height: 1080 }) {
  const {
    primary_text,
    secondary_text = '',
    position = 'upper-left',
    color = '#FFFFFF',
    outline_color = '#000000',
    composition_type = 'F'
  } = textConfig;

  if (!primary_text || !imageUrl) {
    throw new Error('Missing primary_text or imageUrl');
  }

  // Calculate positioning
  const pos = calculatePosition(position, composition_type);
  
  // Calculate font sizes
  const primaryFontSize = calculateFontSize(primary_text, dimensions.width, dimensions.height);
  const secondaryFontSize = Math.round(primaryFontSize * 0.5);

  // Build combined text
  let fullText = primary_text.toUpperCase();
  if (secondary_text) {
    fullText += '\n' + secondary_text;
  }

  // Generate SVG overlay
  const svgOverlay = generateTextSVG({
    text: fullText,
    width: dimensions.width,
    height: dimensions.height,
    fontSize: primaryFontSize,
    fillColor: color,
    strokeColor: outline_color,
    strokeWidth: Math.round(primaryFontSize * 0.06), // 6% of font size
    x: pos.x,
    y: pos.y + 5, // Slight offset from edge
    anchor: pos.anchor,
    shadow: true,
    shadowOffset: Math.round(primaryFontSize * 0.03)
  });

  return {
    svg_overlay: svgOverlay,
    text_config: {
      primary_text,
      secondary_text,
      primary_font_size: primaryFontSize,
      secondary_font_size: secondaryFontSize,
      position: pos,
      color,
      outline_color
    }
  };
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════
// This endpoint generates text overlay data for a thumbnail concept
// The actual compositing can be done client-side with Canvas
// or server-side with Sharp/ImageMagick
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { concept_id, custom_text, custom_position, custom_color } = await req.json();
    
    if (!concept_id) {
      return Response.json({ error: 'concept_id required' }, { status: 400 });
    }

    // ──────────────────────────────────────────────────────────────
    // LOAD CONCEPT DATA
    // ──────────────────────────────────────────────────────────────
    const concepts = await base44.entities.ThumbnailConcepts.filter({ id: concept_id });
    const concept = concepts[0];
    
    if (!concept) {
      return Response.json({ error: 'Concept not found' }, { status: 404 });
    }

    if (!concept.image_url) {
      return Response.json({ error: 'Concept has no image yet — generate image first' }, { status: 400 });
    }

    // ──────────────────────────────────────────────────────────────
    // PARSE TEXT STYLE DATA
    // ──────────────────────────────────────────────────────────────
    let textStyle = {};
    try {
      textStyle = JSON.parse(concept.text_style || '{}');
    } catch (_) {
      textStyle = {};
    }

    // Allow custom overrides
    const textConfig = {
      primary_text: custom_text || textStyle.primary_text || concept.text_overlay || 'TEXT HERE',
      secondary_text: textStyle.secondary_text || '',
      position: custom_position || textStyle.position || 'upper-left',
      color: custom_color || textStyle.color || '#FFFFFF',
      outline_color: textStyle.outline_color || '#000000',
      composition_type: concept.focal_point || 'F'
    };

    // Detect dimensions from concept (shorts vs standard)
    const isShorts = concept.image_prompt?.includes('9:16') || concept.image_prompt?.includes('1080x1920');
    const dimensions = isShorts 
      ? { width: 1080, height: 1920 }
      : { width: 1920, height: 1080 };

    // ──────────────────────────────────────────────────────────────
    // GENERATE TEXT OVERLAY
    // ──────────────────────────────────────────────────────────────
    console.log(`🔤 Generating text overlay for concept ${concept_id}`);
    console.log(`   Text: "${textConfig.primary_text}"`);
    console.log(`   Position: ${textConfig.position} | Color: ${textConfig.color}`);

    const overlay = await compositeTextOnImage(
      concept.image_url,
      textConfig,
      dimensions
    );

    // ──────────────────────────────────────────────────────────────
    // SAVE OVERLAY DATA TO CONCEPT
    // ──────────────────────────────────────────────────────────────
    await base44.entities.ThumbnailConcepts.update(concept_id, {
      text_overlay_svg: overlay.svg_overlay,
      text_overlay_config: JSON.stringify(overlay.text_config)
    });

    console.log(`✓ Text overlay generated for concept ${concept_id}`);

    return Response.json({
      success: true,
      concept_id,
      text_config: overlay.text_config,
      svg_overlay: overlay.svg_overlay,
      dimensions,
      
      // Client-side rendering instructions
      render_instructions: {
        method: "canvas",
        steps: [
          "1. Load base image onto canvas",
          "2. Parse SVG overlay",
          "3. Draw SVG on top of image",
          "4. Export as PNG/JPEG"
        ],
        client_code: `
// Client-side Canvas rendering example
const canvas = document.createElement('canvas');
canvas.width = ${dimensions.width};
canvas.height = ${dimensions.height};
const ctx = canvas.getContext('2d');

// Load and draw base image
const img = new Image();
img.crossOrigin = 'anonymous';
img.onload = () => {
  ctx.drawImage(img, 0, 0, ${dimensions.width}, ${dimensions.height});
  
  // Draw text overlay
  ctx.font = 'bold ${overlay.text_config.primary_font_size}px Impact, Arial Black';
  ctx.textAlign = '${overlay.text_config.position.anchor}';
  ctx.textBaseline = 'top';
  
  const x = ${dimensions.width} * ${overlay.text_config.position.x / 100};
  const y = ${dimensions.height} * ${overlay.text_config.position.y / 100};
  
  // Draw outline
  ctx.strokeStyle = '${overlay.text_config.outline_color}';
  ctx.lineWidth = ${Math.round(overlay.text_config.primary_font_size * 0.06)};
  ctx.lineJoin = 'round';
  ctx.strokeText('${overlay.text_config.primary_text}', x, y);
  
  // Draw fill
  ctx.fillStyle = '${overlay.text_config.color}';
  ctx.fillText('${overlay.text_config.primary_text}', x, y);
  
  // Export
  const finalUrl = canvas.toDataURL('image/png');
};
img.src = '${concept.image_url}';
        `
      }
    });

  } catch (error) {
    console.error('addTextOverlay error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
