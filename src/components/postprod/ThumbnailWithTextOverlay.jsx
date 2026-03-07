// ══════════════════════════════════════════════════════════════════
// ThumbnailWithTextOverlay.jsx
// COMPLETE VERSION with Intelligent Image-Aware Text Positioning
// ══════════════════════════════════════════════════════════════════
// Place in: src/components/postprod/ThumbnailWithTextOverlay.jsx
// ══════════════════════════════════════════════════════════════════

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, RefreshCw, Edit3, Check, X, Wand2, RotateCcw } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// POSITION PRESETS
// ══════════════════════════════════════════════════════════════════

const POSITION_PRESETS = {
  'upper-left':    { x: 0.05, y: 0.12, align: 'left' },
  'upper-center':  { x: 0.50, y: 0.12, align: 'center' },
  'upper-right':   { x: 0.95, y: 0.12, align: 'right' },
  'center-left':   { x: 0.05, y: 0.50, align: 'left' },
  'center':        { x: 0.50, y: 0.50, align: 'center' },
  'center-right':  { x: 0.95, y: 0.50, align: 'right' },
  'lower-left':    { x: 0.05, y: 0.78, align: 'left' },
  'lower-center':  { x: 0.50, y: 0.78, align: 'center' }
  // Note: No lower-right — YouTube timestamp covers it
};

// ══════════════════════════════════════════════════════════════════
// INTELLIGENT IMAGE ANALYSIS
// Analyzes regions to find optimal text placement
// ══════════════════════════════════════════════════════════════════

/**
 * Analyzes a region of the image for text placement suitability
 */
function analyzeRegion(ctx, canvasWidth, canvasHeight, region) {
  const x = Math.floor(region.x * canvasWidth);
  const y = Math.floor(region.y * canvasHeight);
  const w = Math.max(1, Math.floor(region.w * canvasWidth));
  const h = Math.max(1, Math.floor(region.h * canvasHeight));

  let imageData;
  try {
    imageData = ctx.getImageData(x, y, w, h);
  } catch (e) {
    // CORS or other error — return neutral values
    return {
      avgBrightness: 128,
      variance: 1000,
      isUniform: false,
      isDark: false,
      isLight: false,
      dominantColor: { r: 128, g: 128, b: 128 }
    };
  }

  const pixels = imageData.data;
  let totalBrightness = 0;
  const brightnessValues = [];
  let brightPixels = 0;
  let darkPixels = 0;
  const colors = { r: 0, g: 0, b: 0 };

  // Sample every 4th pixel for performance (still accurate)
  for (let i = 0; i < pixels.length; i += 16) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    
    // Perceived brightness (human eye sensitivity weighted)
    const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
    brightnessValues.push(brightness);
    totalBrightness += brightness;
    
    if (brightness > 180) brightPixels++;
    if (brightness < 80) darkPixels++;
    
    colors.r += r;
    colors.g += g;
    colors.b += b;
  }

  const pixelCount = brightnessValues.length || 1;
  const avgBrightness = totalBrightness / pixelCount;
  
  // Calculate variance (low = uniform = good for text)
  const variance = brightnessValues.reduce((sum, b) => 
    sum + Math.pow(b - avgBrightness, 2), 0) / pixelCount;

  return {
    avgBrightness,
    variance,
    isUniform: variance < 1500,
    isDark: avgBrightness < 100,
    isLight: avgBrightness > 180,
    dominantColor: {
      r: Math.round(colors.r / pixelCount),
      g: Math.round(colors.g / pixelCount),
      b: Math.round(colors.b / pixelCount)
    }
  };
}

/**
 * Finds the best position for text by analyzing all candidate zones
 */
function findBestTextPosition(canvas, ctx, textLength) {
  const width = canvas.width;
  const height = canvas.height;
  
  // Define candidate zones with their analysis regions
  const zones = [
    { id: 'upper-left',   x: 0.05, y: 0.12, align: 'left',   region: { x: 0, y: 0, w: 0.45, h: 0.22 } },
    { id: 'upper-center', x: 0.50, y: 0.12, align: 'center', region: { x: 0.20, y: 0, w: 0.60, h: 0.22 } },
    { id: 'upper-right',  x: 0.95, y: 0.12, align: 'right',  region: { x: 0.55, y: 0, w: 0.45, h: 0.22 } },
    { id: 'center-left',  x: 0.05, y: 0.50, align: 'left',   region: { x: 0, y: 0.38, w: 0.35, h: 0.24 } },
    { id: 'center-right', x: 0.95, y: 0.50, align: 'right',  region: { x: 0.65, y: 0.38, w: 0.35, h: 0.24 } },
    { id: 'lower-left',   x: 0.05, y: 0.78, align: 'left',   region: { x: 0, y: 0.65, w: 0.45, h: 0.20 } },
    { id: 'lower-center', x: 0.50, y: 0.78, align: 'center', region: { x: 0.15, y: 0.65, w: 0.55, h: 0.20 } },
  ];

  const scored = zones.map(zone => {
    const data = analyzeRegion(ctx, width, height, zone.region);
    
    let score = 100;

    // REWARD: Uniform areas (low variance) — text is more readable
    if (data.isUniform) {
      score += 40;
    } else {
      score -= Math.min(50, data.variance / 80);
    }

    // REWARD: Dark areas — white/bright text pops better
    if (data.isDark) {
      score += 35;
    } else if (data.avgBrightness < 120) {
      score += 20;
    }

    // REWARD: Very dark + uniform = perfect zone
    if (data.isDark && data.isUniform) {
      score += 25;
    }

    // PENALIZE: Very light areas — hard to read any text color
    if (data.isLight) {
      score -= 30;
    }

    // PENALIZE: Mid-brightness with high variance (busy, detailed areas)
    if (!data.isDark && !data.isLight && !data.isUniform) {
      score -= 35;
    }

    // PREFER: Upper positions (standard thumbnail convention)
    if (zone.id.startsWith('upper')) {
      score += 12;
    }

    // PREFER: Left-aligned for longer text (easier to read)
    if (textLength > 20 && zone.align === 'left') {
      score += 8;
    }

    return { ...zone, score: Math.max(0, score), data };
  });

  // Sort by score (highest = best placement)
  scored.sort((a, b) => b.score - a.score);
  
  const best = scored[0];
  
  // Determine suggested text color based on region analysis
  let suggestedColor = { fill: '#FFFFFF', outline: '#000000' };
  
  if (best.data.avgBrightness > 180) {
    // Light background → dark text
    suggestedColor = { fill: '#000000', outline: '#FFFFFF' };
  } else if (best.data.avgBrightness > 140) {
    // Medium-light → dark text with white outline
    suggestedColor = { fill: '#1a1a1a', outline: '#FFFFFF' };
  } else if (best.data.dominantColor.b > best.data.dominantColor.r + 40) {
    // Blue-ish background → gold text
    suggestedColor = { fill: '#FFD700', outline: '#000000' };
  } else if (best.data.dominantColor.r > best.data.dominantColor.b + 40 && best.data.avgBrightness < 80) {
    // Dark red/warm → cyan or white
    suggestedColor = { fill: '#FFFFFF', outline: '#000000' };
  } else if (best.data.dominantColor.g > best.data.dominantColor.r + 20) {
    // Green-ish → white or gold
    suggestedColor = { fill: '#FFFFFF', outline: '#000000' };
  }

  return {
    position: best.id,
    x: best.x,
    y: best.y,
    align: best.align,
    score: best.score,
    brightness: best.data.avgBrightness,
    isUniform: best.data.isUniform,
    suggestedColor,
    allScores: scored.map(z => ({ id: z.id, score: z.score, brightness: z.data.avgBrightness }))
  };
}

// ══════════════════════════════════════════════════════════════════
// SMART FONT SIZE CALCULATOR
// ══════════════════════════════════════════════════════════════════

function calculateOptimalFontSize(text, canvasWidth, canvasHeight, maxWidthPercent = 0.85) {
  const words = text.split(' ').length;
  const chars = text.length;

  // Base size percentages based on word count
  let sizePercent;
  if (words <= 2) sizePercent = 0.12;      // Massive — 2 words or less
  else if (words <= 3) sizePercent = 0.095; // Large — 3 words
  else if (words <= 4) sizePercent = 0.075; // Medium — 4 words
  else if (words <= 5) sizePercent = 0.065; // Small-medium — 5 words
  else sizePercent = 0.055;                 // Small — 6+ words

  let fontSize = Math.round(canvasHeight * sizePercent);

  // Adjust if text would be too wide
  const estimatedWidth = chars * fontSize * 0.52;
  const maxWidth = canvasWidth * maxWidthPercent;

  if (estimatedWidth > maxWidth) {
    fontSize = Math.round((maxWidth / chars) / 0.52);
  }

  // Clamp to reasonable range
  return Math.max(40, Math.min(fontSize, canvasHeight * 0.15));
}

// ══════════════════════════════════════════════════════════════════
// CANVAS TEXT RENDERER
// ══════════════════════════════════════════════════════════════════

function drawTextOnCanvas(ctx, config) {
  const {
    text,
    canvasWidth,
    canvasHeight,
    position = 'upper-left',
    color = '#FFFFFF',
    outlineColor = '#000000',
    fontSize = null,
    fontFamily = 'Impact, Arial Black, Helvetica, sans-serif'
  } = config;

  if (!text || !text.trim()) return;

  const pos = POSITION_PRESETS[position] || POSITION_PRESETS['upper-left'];
  const calculatedFontSize = fontSize || calculateOptimalFontSize(text, canvasWidth, canvasHeight);
  const outlineWidth = Math.max(3, Math.round(calculatedFontSize * 0.055));
  const shadowOffset = Math.max(2, Math.round(calculatedFontSize * 0.025));

  // Convert text to uppercase for impact
  const displayText = text.toUpperCase();

  // Calculate pixel position
  const x = canvasWidth * pos.x;
  const y = canvasHeight * pos.y;

  // Set font
  ctx.font = `900 ${calculatedFontSize}px ${fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = pos.align;

  // Layer 1: Shadow (depth effect)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillText(displayText, x + shadowOffset, y + shadowOffset);

  // Layer 2: Outline (stroke for contrast)
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeText(displayText, x, y);

  // Layer 3: Fill (main text color)
  ctx.fillStyle = color;
  ctx.fillText(displayText, x, y);
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

export default function ThumbnailWithTextOverlay({
  imageUrl,
  textConfig = {},
  concept = {},
  onTextChange,
  onDownload,
  editable = true,
  showAnalysis = false,
  className = ''
}) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  
  // State
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editPosition, setEditPosition] = useState('upper-left');
  const [editColor, setEditColor] = useState('#FFFFFF');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError] = useState(null);
  
  // Smart positioning state
  const [analysisResult, setAnalysisResult] = useState(null);
  const [useSmartPosition, setUseSmartPosition] = useState(true);

  // Parse text config from concept if not provided directly
  const parsedConfig = React.useMemo(() => {
    if (textConfig.primary_text) return textConfig;

    try {
      const styleData = JSON.parse(concept.text_style || '{}');
      return {
        primary_text: concept.text_overlay || styleData.primary_text || '',
        secondary_text: styleData.secondary_text || '',
        position: styleData.position || 'upper-left',
        color: styleData.color || '#FFFFFF',
        outline_color: styleData.outline_color || '#000000'
      };
    } catch (_) {
      return {
        primary_text: concept.text_overlay || '',
        position: 'upper-left',
        color: '#FFFFFF',
        outline_color: '#000000'
      };
    }
  }, [textConfig, concept]);

  // Initialize edit state when config changes
  useEffect(() => {
    setEditText(parsedConfig.primary_text || '');
    setEditPosition(parsedConfig.position || 'upper-left');
    setEditColor(parsedConfig.color || '#FFFFFF');
  }, [parsedConfig]);

  // ════════════════════════════════════════════════════════════════
  // MAIN RENDER FUNCTION
  // ════════════════════════════════════════════════════════════════
  
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Detect shorts vs standard
      const isShorts = concept.image_prompt?.includes('9:16') || 
                       concept.image_prompt?.includes('1080x1920') ||
                       img.height > img.width * 1.3;
      
      canvas.width = isShorts ? 1080 : 1920;
      canvas.height = isShorts ? 1920 : 1080;

      // Draw base image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      // Store image reference for re-rendering
      imageRef.current = img;

      // Get current text to render
      const currentText = isEditing ? editText : parsedConfig.primary_text;
      
      if (currentText && currentText.trim()) {
        let finalPosition;
        let finalColor;
        let finalOutlineColor;

        if (isEditing) {
          // User is editing — use their choices
          finalPosition = editPosition;
          finalColor = editColor;
          finalOutlineColor = parsedConfig.outline_color || '#000000';
        } else if (useSmartPosition) {
          // ════════════════════════════════════════════════════════
          // INTELLIGENT POSITIONING
          // ════════════════════════════════════════════════════════
          const analysis = findBestTextPosition(canvas, ctx, currentText.length);
          
          setAnalysisResult(analysis);
          
          console.log(`🎯 Smart Position: ${analysis.position}`);
          console.log(`   Score: ${analysis.score.toFixed(0)} | Brightness: ${analysis.brightness.toFixed(0)}`);
          console.log(`   Uniform: ${analysis.isUniform} | Color: ${analysis.suggestedColor.fill}`);

          finalPosition = analysis.position;
          finalColor = analysis.suggestedColor.fill;
          finalOutlineColor = analysis.suggestedColor.outline;

          // Redraw image since analysis read pixel data
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        } else {
          // Use stored config
          finalPosition = parsedConfig.position || 'upper-left';
          finalColor = parsedConfig.color || '#FFFFFF';
          finalOutlineColor = parsedConfig.outline_color || '#000000';
        }

        // Draw text overlay
        drawTextOnCanvas(ctx, {
          text: currentText,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          position: finalPosition,
          color: finalColor,
          outlineColor: finalOutlineColor
        });
      }

      setImageLoaded(true);
      setError(null);
    };

    img.onerror = () => {
      setError('Failed to load image');
      setImageLoaded(false);
    };

    img.src = imageUrl;
  }, [imageUrl, parsedConfig, isEditing, editText, editPosition, editColor, useSmartPosition, concept.image_prompt]);

  // Render on mount and dependency changes
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Re-render when editing changes (for live preview)
  useEffect(() => {
    if (isEditing && imageRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Redraw image
      ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
      
      // Draw text with current edit values
      if (editText && editText.trim()) {
        drawTextOnCanvas(ctx, {
          text: editText,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          position: editPosition,
          color: editColor,
          outlineColor: parsedConfig.outline_color || '#000000'
        });
      }
    }
  }, [editText, editPosition, editColor, isEditing, parsedConfig.outline_color]);

  // ════════════════════════════════════════════════════════════════
  // HANDLERS
  // ════════════════════════════════════════════════════════════════

  const handleSaveEdit = () => {
    if (onTextChange) {
      onTextChange({
        primary_text: editText,
        position: editPosition,
        color: editColor,
        outline_color: parsedConfig.outline_color || '#000000'
      });
    }
    setIsEditing(false);
    setUseSmartPosition(false); // User made manual choices
  };

  const handleCancelEdit = () => {
    setEditText(parsedConfig.primary_text || '');
    setEditPosition(parsedConfig.position || 'upper-left');
    setEditColor(parsedConfig.color || '#FFFFFF');
    setIsEditing(false);
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `thumbnail-${concept.rank || 1}.png`;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();

    if (onDownload) onDownload();
  };

  const handleReanalyze = () => {
    setUseSmartPosition(true);
    setTimeout(renderCanvas, 50);
  };

  // Color presets for quick selection
  const colorPresets = [
    { color: '#FFFFFF', label: 'White' },
    { color: '#FFD700', label: 'Gold' },
    { color: '#00FF88', label: 'Mint' },
    { color: '#00FFFF', label: 'Cyan' },
    { color: '#FF4444', label: 'Red' },
    { color: '#FF6B00', label: 'Orange' },
    { color: '#000000', label: 'Black' }
  ];

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════

  return (
    <div className={`relative ${className}`}>
      {/* Canvas Display */}
      <div className="relative rounded-lg overflow-hidden bg-gray-900">
        <canvas
          ref={canvasRef}
          className="w-full h-auto"
          style={{ 
            aspectRatio: concept.image_prompt?.includes('9:16') ? '9/16' : '16/9',
            display: 'block'
          }}
        />

        {/* Loading State */}
        {!imageLoaded && !error && imageUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/50">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* Action Buttons (when not editing) */}
        {imageLoaded && !isEditing && editable && (
          <div className="absolute top-2 right-2 flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white"
              onClick={handleReanalyze}
              title="Re-analyze for best position"
            >
              <Wand2 className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white"
              onClick={() => setIsEditing(true)}
              title="Edit text"
            >
              <Edit3 className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white"
              onClick={handleDownload}
              title="Download"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Smart Position Badge */}
        {imageLoaded && !isEditing && analysisResult && showAnalysis && (
          <div className="absolute bottom-2 left-2">
            <Badge className="bg-black/60 text-white text-[10px]">
              🎯 {analysisResult.position} • Score: {analysisResult.score.toFixed(0)}
            </Badge>
          </div>
        )}
      </div>

      {/* Edit Panel */}
      {isEditing && (
        <div className="mt-3 p-4 bg-gray-50 rounded-lg border space-y-4">
          {/* Text Input */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
              Overlay Text
            </label>
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border rounded-lg font-bold uppercase tracking-wide"
              placeholder="YOUR TEXT HERE"
              maxLength={35}
              autoFocus
            />
            <div className="flex justify-between mt-1.5">
              <p className="text-xs text-gray-400">
                {editText.split(' ').filter(w => w).length} words • {editText.length}/35 chars
              </p>
              {editText.split(' ').filter(w => w).length > 4 && (
                <p className="text-xs text-amber-600">⚠️ 4 words max recommended</p>
              )}
            </div>
          </div>

          {/* Position Selector */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
              Position
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {Object.keys(POSITION_PRESETS).map(pos => (
                <button
                  key={pos}
                  onClick={() => setEditPosition(pos)}
                  className={`text-[10px] px-2 py-1.5 rounded-md border transition-all ${
                    editPosition === pos
                      ? 'bg-purple-100 border-purple-500 text-purple-700 font-medium'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-purple-300 hover:bg-purple-50'
                  }`}
                >
                  {pos.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selector */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
              Text Color
            </label>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                {colorPresets.map(({ color, label }) => (
                  <button
                    key={color}
                    onClick={() => setEditColor(color)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      editColor.toLowerCase() === color.toLowerCase() 
                        ? 'border-purple-500 scale-110 shadow-md' 
                        : 'border-gray-300 hover:border-purple-300'
                    }`}
                    style={{ 
                      backgroundColor: color,
                      boxShadow: color === '#FFFFFF' ? 'inset 0 0 0 1px #ddd' : undefined
                    }}
                    title={label}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-xs text-gray-400">Custom:</span>
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                />
              </div>
            </div>
          </div>

          {/* Analysis Info */}
          {analysisResult && (
            <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
              <span className="font-medium">🎯 AI Suggestion:</span> {analysisResult.position} position 
              (brightness: {analysisResult.brightness.toFixed(0)}, 
              {analysisResult.isUniform ? ' uniform area' : ' mixed area'})
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9"
              onClick={handleCancelEdit}
            >
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={handleReanalyze}
              title="Re-analyze image"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              className="flex-1 h-9 bg-purple-600 hover:bg-purple-700"
              onClick={handleSaveEdit}
            >
              <Check className="w-4 h-4 mr-1.5" /> Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// BATCH DOWNLOAD UTILITY
// Downloads all thumbnails with text overlays baked in
// ══════════════════════════════════════════════════════════════════

export async function downloadAllThumbnails(concepts, prefix = 'thumbnail') {
  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];
    if (!concept.image_url) continue;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const isShorts = concept.image_prompt?.includes('9:16') || concept.image_prompt?.includes('1080x1920');
    canvas.width = isShorts ? 1080 : 1920;
    canvas.height = isShorts ? 1920 : 1080;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      img.onload = () => {
        // Draw image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Parse text config
        let text = concept.text_overlay || '';
        let position = 'upper-left';
        let color = '#FFFFFF';
        let outlineColor = '#000000';

        try {
          const textStyle = JSON.parse(concept.text_style || '{}');
          text = text || textStyle.primary_text || '';
          position = textStyle.position || position;
          color = textStyle.color || color;
          outlineColor = textStyle.outline_color || outlineColor;
        } catch (_) {}

        // If no position saved, use smart positioning
        if (text && (!concept.text_style || !JSON.parse(concept.text_style || '{}').position)) {
          const analysis = findBestTextPosition(canvas, ctx, text.length);
          position = analysis.position;
          color = analysis.suggestedColor.fill;
          outlineColor = analysis.suggestedColor.outline;
          
          // Redraw image after analysis
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }

        // Draw text
        if (text) {
          drawTextOnCanvas(ctx, {
            text,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            position,
            color,
            outlineColor
          });
        }

        // Download
        const link = document.createElement('a');
        link.download = `${prefix}-${concept.rank || i + 1}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();

        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to load image for concept ${concept.rank || i + 1}`));
      img.src = concept.image_url;
    });

    // Delay between downloads to prevent browser issues
    await new Promise(r => setTimeout(r, 600));
  }
}

// ══════════════════════════════════════════════════════════════════
// STANDALONE ANALYSIS FUNCTION (for debugging/testing)
// ══════════════════════════════════════════════════════════════════

export function analyzeImageForTextPlacement(imageUrl) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const analysis = findBestTextPosition(canvas, ctx, 20); // Assume medium-length text
      resolve(analysis);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}
