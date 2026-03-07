// ══════════════════════════════════════════════════════════════════
// ThumbnailWithTextOverlay.jsx
// Client-side text rendering component for thumbnail previews
// ══════════════════════════════════════════════════════════════════
// Usage: Place this in components/postprod/ThumbnailWithTextOverlay.jsx
// Import and use in ThumbnailGrid.jsx to replace static image display
// ══════════════════════════════════════════════════════════════════

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw, Edit3, Check, X } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────
// TEXT POSITION PRESETS
// ──────────────────────────────────────────────────────────────────

const POSITION_PRESETS = {
  'upper-left': { x: 0.05, y: 0.12, align: 'left' },
  'upper-center': { x: 0.5, y: 0.12, align: 'center' },
  'upper-right': { x: 0.95, y: 0.12, align: 'right' },
  'center-left': { x: 0.05, y: 0.5, align: 'left' },
  'center': { x: 0.5, y: 0.5, align: 'center' },
  'center-right': { x: 0.95, y: 0.5, align: 'right' },
  'lower-left': { x: 0.05, y: 0.75, align: 'left' },
  'lower-center': { x: 0.5, y: 0.75, align: 'center' }
};

// ──────────────────────────────────────────────────────────────────
// SMART FONT SIZE CALCULATOR
// ──────────────────────────────────────────────────────────────────

function calculateOptimalFontSize(text, canvasWidth, canvasHeight, maxWidthPercent = 0.85) {
  const words = text.split(' ').length;
  const chars = text.length;

  // Base size percentages based on word count
  let sizePercent;
  if (words <= 2) sizePercent = 0.12;      // Massive — 2 words or less
  else if (words <= 3) sizePercent = 0.09; // Large — 3 words
  else if (words <= 4) sizePercent = 0.07; // Medium — 4 words
  else sizePercent = 0.055;                // Small — 5+ words

  let fontSize = Math.round(canvasHeight * sizePercent);

  // Adjust if text would be too wide
  const estimatedWidth = chars * fontSize * 0.55; // Character width estimate
  const maxWidth = canvasWidth * maxWidthPercent;

  if (estimatedWidth > maxWidth) {
    fontSize = Math.round((maxWidth / chars) / 0.55);
  }

  // Minimum readable size
  return Math.max(fontSize, 36);
}

// ──────────────────────────────────────────────────────────────────
// CANVAS TEXT RENDERER
// ──────────────────────────────────────────────────────────────────

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

  if (!text) return;

  const pos = POSITION_PRESETS[position] || POSITION_PRESETS['upper-left'];
  const calculatedFontSize = fontSize || calculateOptimalFontSize(text, canvasWidth, canvasHeight);
  const outlineWidth = Math.round(calculatedFontSize * 0.06);
  const shadowOffset = Math.round(calculatedFontSize * 0.03);

  // Convert text to uppercase
  const displayText = text.toUpperCase();

  // Calculate position
  const x = canvasWidth * pos.x;
  const y = canvasHeight * pos.y;

  // Set font
  ctx.font = `900 ${calculatedFontSize}px ${fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = pos.align;

  // Draw shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillText(displayText, x + shadowOffset, y + shadowOffset);

  // Draw outline (stroke)
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeText(displayText, x, y);

  // Draw fill
  ctx.fillStyle = color;
  ctx.fillText(displayText, x, y);
}

// ──────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ──────────────────────────────────────────────────────────────────

export default function ThumbnailWithTextOverlay({
  imageUrl,
  textConfig = {},
  concept = {},
  onTextChange,
  onDownload,
  editable = true,
  className = ''
}) {
  const canvasRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editPosition, setEditPosition] = useState('upper-left');
  const [editColor, setEditColor] = useState('#FFFFFF');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError] = useState(null);

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

  // Initialize edit state
  useEffect(() => {
    setEditText(parsedConfig.primary_text || '');
    setEditPosition(parsedConfig.position || 'upper-left');
    setEditColor(parsedConfig.color || '#FFFFFF');
  }, [parsedConfig]);

  // Render canvas with image + text
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Set canvas dimensions
      const isShorts = concept.image_prompt?.includes('9:16') || img.height > img.width;
      canvas.width = isShorts ? 1080 : 1920;
      canvas.height = isShorts ? 1920 : 1080;

      // Draw base image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw text overlay
      const currentText = isEditing ? editText : parsedConfig.primary_text;
      const currentPosition = isEditing ? editPosition : parsedConfig.position;
      const currentColor = isEditing ? editColor : parsedConfig.color;

      if (currentText) {
        drawTextOnCanvas(ctx, {
          text: currentText,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          position: currentPosition,
          color: currentColor,
          outlineColor: parsedConfig.outline_color || '#000000'
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
  }, [imageUrl, parsedConfig, isEditing, editText, editPosition, editColor, concept.image_prompt]);

  // Render on mount and when dependencies change
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Handle text edit save
  const handleSaveEdit = () => {
    if (onTextChange) {
      onTextChange({
        primary_text: editText,
        position: editPosition,
        color: editColor,
        outline_color: parsedConfig.outline_color
      });
    }
    setIsEditing(false);
    renderCanvas();
  };

  // Handle download
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `thumbnail-${concept.rank || 1}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    if (onDownload) onDownload();
  };

  // Color presets for quick selection
  const colorPresets = [
    { color: '#FFFFFF', label: 'White' },
    { color: '#FFD700', label: 'Gold' },
    { color: '#00FF88', label: 'Mint' },
    { color: '#00FFFF', label: 'Cyan' },
    { color: '#FF4444', label: 'Red' },
    { color: '#FF6B00', label: 'Orange' }
  ];

  return (
    <div className={`relative ${className}`}>
      {/* Canvas Display */}
      <div className="relative rounded-lg overflow-hidden bg-gray-900">
        <canvas
          ref={canvasRef}
          className="w-full h-auto"
          style={{ aspectRatio: concept.image_prompt?.includes('9:16') ? '9/16' : '16/9' }}
        />

        {/* Loading/Error States */}
        {!imageLoaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/50">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        {imageLoaded && !isEditing && editable && (
          <div className="absolute top-2 right-2 flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-8 p-0 bg-black/50 hover:bg-black/70"
              onClick={() => setIsEditing(true)}
            >
              <Edit3 className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-8 p-0 bg-black/50 hover:bg-black/70"
              onClick={handleDownload}
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Edit Panel */}
      {isEditing && (
        <div className="mt-3 p-3 bg-gray-50 rounded-lg border space-y-3">
          {/* Text Input */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Overlay Text (MAX 4 WORDS)
            </label>
            <input
              type="text"
              value={editText}
              onChange={(e) => {
                setEditText(e.target.value);
                // Live preview
                setTimeout(renderCanvas, 10);
              }}
              className="w-full px-3 py-2 text-sm border rounded-md font-bold"
              placeholder="YOUR TEXT HERE"
              maxLength={30}
            />
            <p className="text-xs text-gray-400 mt-1">
              {editText.split(' ').length} words • {editText.length}/30 chars
            </p>
          </div>

          {/* Position Selector */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Position
            </label>
            <div className="grid grid-cols-4 gap-1">
              {Object.keys(POSITION_PRESETS).map(pos => (
                <button
                  key={pos}
                  onClick={() => {
                    setEditPosition(pos);
                    setTimeout(renderCanvas, 10);
                  }}
                  className={`text-[10px] px-2 py-1 rounded border ${
                    editPosition === pos
                      ? 'bg-purple-100 border-purple-500 text-purple-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {pos.replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selector */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Text Color
            </label>
            <div className="flex gap-1">
              {colorPresets.map(({ color, label }) => (
                <button
                  key={color}
                  onClick={() => {
                    setEditColor(color);
                    setTimeout(renderCanvas, 10);
                  }}
                  className={`w-8 h-8 rounded-full border-2 ${
                    editColor === color ? 'border-purple-500 scale-110' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                  title={label}
                />
              ))}
              <input
                type="color"
                value={editColor}
                onChange={(e) => {
                  setEditColor(e.target.value);
                  setTimeout(renderCanvas, 10);
                }}
                className="w-8 h-8 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Save/Cancel Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setEditText(parsedConfig.primary_text || '');
                setEditPosition(parsedConfig.position || 'upper-left');
                setEditColor(parsedConfig.color || '#FFFFFF');
                setIsEditing(false);
                renderCanvas();
              }}
            >
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-purple-600 hover:bg-purple-700"
              onClick={handleSaveEdit}
            >
              <Check className="w-4 h-4 mr-1" /> Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// BATCH DOWNLOAD UTILITY
// Downloads all thumbnails with text overlays
// ══════════════════════════════════════════════════════════════════

export async function downloadAllThumbnails(concepts, prefix = 'thumbnail') {
  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];
    if (!concept.image_url) continue;

    // Create canvas for this concept
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const isShorts = concept.image_prompt?.includes('9:16');
    canvas.width = isShorts ? 1080 : 1920;
    canvas.height = isShorts ? 1920 : 1080;

    // Load image
    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      img.onload = () => {
        // Draw image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Parse and draw text
        try {
          const textStyle = JSON.parse(concept.text_style || '{}');
          const text = concept.text_overlay || textStyle.primary_text || '';

          if (text) {
            drawTextOnCanvas(ctx, {
              text,
              canvasWidth: canvas.width,
              canvasHeight: canvas.height,
              position: textStyle.position || 'upper-left',
              color: textStyle.color || '#FFFFFF',
              outlineColor: textStyle.outline_color || '#000000'
            });
          }
        } catch (_) {}

        // Download
        const link = document.createElement('a');
        link.download = `${prefix}-${concept.rank || i + 1}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        resolve();
      };
      img.onerror = reject;
      img.src = concept.image_url;
    });

    // Small delay between downloads
    await new Promise(r => setTimeout(r, 500));
  }
}
