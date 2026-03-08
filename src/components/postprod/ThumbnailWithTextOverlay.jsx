// ══════════════════════════════════════════════════════════════════
// ThumbnailWithTextOverlay.jsx — V3 FIXED
// ✅ Save now works properly
// ✅ Text size slider added
// ══════════════════════════════════════════════════════════════════
// Place in: src/components/postprod/ThumbnailWithTextOverlay.jsx
// ══════════════════════════════════════════════════════════════════

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  Download, RefreshCw, Edit3, Check, X, 
  ChevronDown, Palette, Type, Layout, Save, Loader2,
  ZoomIn, ZoomOut
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// TEXT OVERLAY TEMPLATES — Matching Pro YouTube Thumbnails
// Font sizes are % of canvas HEIGHT for massive text
// ══════════════════════════════════════════════════════════════════

const TEXT_TEMPLATES = {
  // ─── TEMPLATE 1: SHOCK FACE SIDE TEXT ───────────────────────────
  shock_side: {
    id: 'shock_side',
    name: 'Shock Side Text',
    preview: '💥 Big text left',
    description: 'Massive text on dark left side, subject on right',
    layers: [
      {
        id: 'headline',
        type: 'primary',
        position: { x: 0.05, y: 0.20 },
        align: 'left',
        fontSizePercent: 0.14,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 0.06,
        shadow: true,
        maxWidth: 0.50,
        uppercase: true
      }
    ]
  },

  // ─── TEMPLATE 2: CENTERED MASSIVE ───────────────────────────────
  centered_massive: {
    id: 'centered_massive',
    name: 'Centered Massive',
    preview: '🎯 Giant centered',
    description: 'Huge centered headline, fills top third',
    layers: [
      {
        id: 'headline',
        type: 'primary',
        position: { x: 0.50, y: 0.18 },
        align: 'center',
        fontSizePercent: 0.16,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 0.07,
        shadow: true,
        maxWidth: 0.90,
        uppercase: true
      }
    ]
  },

  // ─── TEMPLATE 3: YOUTUBE STACKED ────────────────────────────────
  stacked_youtube: {
    id: 'stacked_youtube',
    name: 'YouTube Stacked',
    preview: '📺 Multi-line stacked',
    description: 'Large headline + smaller subtext stacked',
    layers: [
      {
        id: 'headline',
        type: 'primary',
        position: { x: 0.50, y: 0.14 },
        align: 'center',
        fontSizePercent: 0.15,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#FFD700',
        strokeColor: '#000000',
        strokeWidth: 0.06,
        shadow: true,
        maxWidth: 0.85,
        uppercase: true
      },
      {
        id: 'subtext',
        type: 'secondary',
        position: { x: 0.50, y: 0.32 },
        align: 'center',
        fontSizePercent: 0.10,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 0.05,
        shadow: true,
        maxWidth: 0.80,
        uppercase: true
      }
    ]
  },

  // ─── TEMPLATE 4: BEFORE/AFTER SPLIT ─────────────────────────────
  split_before_after: {
    id: 'split_before_after',
    name: 'Before/After Split',
    preview: '↔️ Left vs Right',
    description: 'BEFORE on left (red), AFTER on right (green)',
    layers: [
      {
        id: 'before_label',
        type: 'primary',
        position: { x: 0.25, y: 0.12 },
        align: 'center',
        fontSizePercent: 0.12,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#FF4444',
        strokeColor: '#000000',
        strokeWidth: 0.06,
        shadow: true,
        maxWidth: 0.40,
        uppercase: true,
        defaultText: 'BEFORE'
      },
      {
        id: 'after_label',
        type: 'secondary',
        position: { x: 0.75, y: 0.12 },
        align: 'center',
        fontSizePercent: 0.12,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#00FF88',
        strokeColor: '#000000',
        strokeWidth: 0.06,
        shadow: true,
        maxWidth: 0.40,
        uppercase: true,
        defaultText: 'AFTER'
      }
    ]
  },

  // ─── TEMPLATE 5: INCOME/MONEY REVEAL ────────────────────────────
  income_reveal: {
    id: 'income_reveal',
    name: 'Income Reveal',
    preview: '💰 Big money number',
    description: 'Massive dollar amount with subtext',
    layers: [
      {
        id: 'amount',
        type: 'primary',
        position: { x: 0.05, y: 0.18 },
        align: 'left',
        fontSizePercent: 0.20,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#00FF88',
        strokeColor: '#000000',
        strokeWidth: 0.06,
        shadow: true,
        maxWidth: 0.60,
        uppercase: true,
        defaultText: '$47,382'
      },
      {
        id: 'timeframe',
        type: 'secondary',
        position: { x: 0.05, y: 0.38 },
        align: 'left',
        fontSizePercent: 0.08,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 0.05,
        shadow: true,
        maxWidth: 0.50,
        uppercase: true,
        defaultText: 'IN 6 MONTHS'
      }
    ]
  },

  // ─── TEMPLATE 6: WARNING/ALERT ──────────────────────────────────
  warning_alert: {
    id: 'warning_alert',
    name: 'Warning Alert',
    preview: '⚠️ Urgent warning',
    description: 'Red alert text, urgent feel',
    layers: [
      {
        id: 'warning',
        type: 'primary',
        position: { x: 0.50, y: 0.15 },
        align: 'center',
        fontSizePercent: 0.14,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#FFFFFF',
        strokeColor: '#CC0000',
        strokeWidth: 0.08,
        shadow: true,
        maxWidth: 0.85,
        uppercase: true,
        defaultText: 'STOP DOING THIS'
      },
      {
        id: 'consequence',
        type: 'secondary',
        position: { x: 0.50, y: 0.32 },
        align: 'center',
        fontSizePercent: 0.07,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#FF4444',
        strokeColor: '#000000',
        strokeWidth: 0.05,
        shadow: true,
        maxWidth: 0.70,
        uppercase: true
      }
    ]
  },

  // ─── TEMPLATE 7: QUESTION HOOK ──────────────────────────────────
  question_hook: {
    id: 'question_hook',
    name: 'Question Hook',
    preview: '❓ Curiosity question',
    description: 'Big question that demands an answer',
    layers: [
      {
        id: 'question',
        type: 'primary',
        position: { x: 0.05, y: 0.15 },
        align: 'left',
        fontSizePercent: 0.15,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 0.06,
        shadow: true,
        maxWidth: 0.55,
        uppercase: true,
        defaultText: '$10 A DAY?'
      }
    ]
  },

  // ─── TEMPLATE 8: METRIC CARDS ───────────────────────────────────
  metric_cards: {
    id: 'metric_cards',
    name: 'Metric Cards',
    preview: '📊 Stats with badges',
    description: 'Main text + floating metric indicators',
    layers: [
      {
        id: 'headline',
        type: 'primary',
        position: { x: 0.50, y: 0.12 },
        align: 'center',
        fontSizePercent: 0.13,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 0.06,
        shadow: true,
        maxWidth: 0.90,
        uppercase: true,
        defaultText: 'YOU CAN DO IT'
      },
      {
        id: 'metric1',
        type: 'badge',
        position: { x: 0.28, y: 0.78 },
        align: 'center',
        fontSizePercent: 0.045,
        fontWeight: 700,
        fontFamily: 'Arial, sans-serif',
        color: '#000000',
        bgColor: '#FFFFFF',
        bgPadding: { x: 20, y: 10 },
        borderRadius: 8,
        shadow: true,
        maxWidth: 0.30,
        uppercase: false,
        defaultText: '300K Subscribers ↑'
      },
      {
        id: 'metric2',
        type: 'badge',
        position: { x: 0.72, y: 0.78 },
        align: 'center',
        fontSizePercent: 0.045,
        fontWeight: 700,
        fontFamily: 'Arial, sans-serif',
        color: '#000000',
        bgColor: '#FFFFFF',
        bgPadding: { x: 20, y: 10 },
        borderRadius: 8,
        shadow: true,
        maxWidth: 0.30,
        uppercase: false,
        defaultText: '$150 Revenue ↑'
      }
    ]
  },

  // ─── TEMPLATE 9: DATA EXPLOSION ─────────────────────────────────
  data_explosion: {
    id: 'data_explosion',
    name: 'Data Explosion',
    preview: '📈 Multiple stats',
    description: 'Headline + multiple data points',
    layers: [
      {
        id: 'badge',
        type: 'badge',
        position: { x: 0.50, y: 0.08 },
        align: 'center',
        fontSizePercent: 0.04,
        fontWeight: 700,
        fontFamily: 'Arial, sans-serif',
        color: '#FFFFFF',
        bgColor: '#FF0000',
        bgPadding: { x: 15, y: 8 },
        borderRadius: 6,
        shadow: true,
        maxWidth: 0.30,
        uppercase: true,
        defaultText: 'HIGH CTR'
      },
      {
        id: 'main_stat',
        type: 'primary',
        position: { x: 0.50, y: 0.22 },
        align: 'center',
        fontSizePercent: 0.16,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 0.06,
        shadow: true,
        maxWidth: 0.85,
        uppercase: true,
        defaultText: 'THUMBNAIL'
      },
      {
        id: 'stat1',
        type: 'secondary',
        position: { x: 0.30, y: 0.42 },
        align: 'center',
        fontSizePercent: 0.09,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#00FF88',
        strokeColor: '#000000',
        strokeWidth: 0.05,
        shadow: true,
        maxWidth: 0.35,
        uppercase: true,
        defaultText: '10X VIEWS'
      },
      {
        id: 'stat2',
        type: 'secondary',
        position: { x: 0.70, y: 0.42 },
        align: 'center',
        fontSizePercent: 0.09,
        fontWeight: 900,
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#00FF88',
        strokeColor: '#000000',
        strokeWidth: 0.05,
        shadow: true,
        maxWidth: 0.35,
        uppercase: true,
        defaultText: '17% CTR'
      }
    ]
  },

  // ─── TEMPLATE 10: MINIMAL CORNER ────────────────────────────────
  minimal_corner: {
    id: 'minimal_corner',
    name: 'Minimal Corner',
    preview: '📌 Small corner',
    description: 'Subtle text, lets image speak',
    layers: [
      {
        id: 'text',
        type: 'primary',
        position: { x: 0.05, y: 0.88 },
        align: 'left',
        fontSizePercent: 0.06,
        fontWeight: 700,
        fontFamily: 'Arial, sans-serif',
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 0.08,
        shadow: true,
        maxWidth: 0.50,
        uppercase: false
      }
    ]
  }
};

// ══════════════════════════════════════════════════════════════════
// CANVAS TEXT RENDERER — Multi-Layer Support with Size Multiplier
// ══════════════════════════════════════════════════════════════════

function drawTextLayer(ctx, layer, text, canvasWidth, canvasHeight, sizeMultiplier = 1.0) {
  if (!text || !text.trim()) return;

  const displayText = layer.uppercase ? text.toUpperCase() : text;
  
  // Apply size multiplier to font size
  const baseFontSize = canvasHeight * layer.fontSizePercent;
  const fontSize = Math.round(baseFontSize * sizeMultiplier);
  const strokeWidth = Math.max(4, Math.round(fontSize * layer.strokeWidth));
  const shadowOffset = Math.max(3, Math.round(fontSize * 0.04));

  const x = canvasWidth * layer.position.x;
  const y = canvasHeight * layer.position.y;

  ctx.font = `${layer.fontWeight} ${fontSize}px ${layer.fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = layer.align;

  // Handle badge type (with background)
  if (layer.type === 'badge' && layer.bgColor) {
    const metrics = ctx.measureText(displayText);
    const textWidth = metrics.width;
    const textHeight = fontSize;
    const padX = (layer.bgPadding?.x || 15) * sizeMultiplier;
    const padY = (layer.bgPadding?.y || 8) * sizeMultiplier;
    const radius = (layer.borderRadius || 6) * sizeMultiplier;

    let bgX = x - padX;
    if (layer.align === 'center') bgX = x - textWidth/2 - padX;
    else if (layer.align === 'right') bgX = x - textWidth - padX;

    const bgY = y - textHeight/2 - padY;
    const bgWidth = textWidth + padX * 2;
    const bgHeight = textHeight + padY * 2;

    // Shadow
    if (layer.shadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      roundRect(ctx, bgX + 4, bgY + 4, bgWidth, bgHeight, radius);
      ctx.fill();
    }

    // Background
    ctx.fillStyle = layer.bgColor;
    roundRect(ctx, bgX, bgY, bgWidth, bgHeight, radius);
    ctx.fill();

    // Text
    ctx.fillStyle = layer.color;
    ctx.fillText(displayText, x, y);
    return;
  }

  // Standard text: Shadow → Stroke → Fill
  if (layer.shadow) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillText(displayText, x + shadowOffset, y + shadowOffset);
  }

  ctx.strokeStyle = layer.strokeColor || '#000000';
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeText(displayText, x, y);

  ctx.fillStyle = layer.color;
  ctx.fillText(displayText, x, y);
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// ══════════════════════════════════════════════════════════════════
// TEMPLATE SELECTOR
// ══════════════════════════════════════════════════════════════════

function TemplateSelector({ selectedTemplate, onSelect, isOpen, onToggle }) {
  const templates = Object.values(TEXT_TEMPLATES);

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        className="gap-2 h-9 w-full justify-between"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <Layout className="w-4 h-4 text-purple-500" />
          <span className="font-medium">
            {TEXT_TEMPLATES[selectedTemplate]?.name || 'Select Template'}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          {templates.map(template => (
            <button
              key={template.id}
              onClick={() => {
                onSelect(template.id);
                onToggle();
              }}
              className={`w-full px-3 py-2.5 text-left hover:bg-purple-50 flex items-center gap-3 border-b last:border-b-0 ${
                selectedTemplate === template.id ? 'bg-purple-50' : ''
              }`}
            >
              <span className="text-xl w-8">{template.preview.split(' ')[0]}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900">{template.name}</p>
                <p className="text-xs text-gray-500 truncate">{template.description}</p>
              </div>
              {selectedTemplate === template.id && (
                <Check className="w-4 h-4 text-purple-600 shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// LAYER TEXT EDITOR
// ══════════════════════════════════════════════════════════════════

function LayerEditor({ layer, text, onChange, color, onColorChange }) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
      <div className="flex-1">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          {layer.id.replace(/_/g, ' ')}
        </label>
        <input
          type="text"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full px-2 py-1.5 text-sm border rounded font-bold bg-white ${
            layer.uppercase ? 'uppercase' : ''
          }`}
          placeholder={layer.defaultText || 'Enter text...'}
        />
      </div>
      <div className="pt-4">
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-9 h-9 rounded cursor-pointer border-2 border-gray-200"
          title="Text color"
        />
      </div>
    </div>
  );
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
  className = ''
}) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState('shock_side');
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [layerTexts, setLayerTexts] = useState({});
  const [layerColors, setLayerColors] = useState({});
  const [sizeMultiplier, setSizeMultiplier] = useState(1.0); // NEW: Size control
  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError] = useState(null);

  const currentTemplate = TEXT_TEMPLATES[templateId] || TEXT_TEMPLATES.shock_side;

  // Parse saved config
  const savedConfig = React.useMemo(() => {
    try {
      return JSON.parse(concept.text_style || '{}');
    } catch (_) {
      return {};
    }
  }, [concept.text_style]);

  // Initialize from saved config
  useEffect(() => {
    const tplId = savedConfig.templateId || 'shock_side';
    const template = TEXT_TEMPLATES[tplId];
    if (!template) return;

    setTemplateId(tplId);
    setSizeMultiplier(savedConfig.sizeMultiplier || 1.0);

    const texts = {};
    const colors = {};

    template.layers.forEach(layer => {
      texts[layer.id] = savedConfig.layerTexts?.[layer.id] || 
                        concept.text_overlay || 
                        layer.defaultText || '';
      colors[layer.id] = savedConfig.layerColors?.[layer.id] || layer.color;
    });

    setLayerTexts(texts);
    setLayerColors(colors);
  }, [savedConfig, concept.text_overlay]);

  // Render canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const isShorts = concept.image_prompt?.includes('9:16') || img.height > img.width * 1.3;
      canvas.width = isShorts ? 1080 : 1920;
      canvas.height = isShorts ? 1920 : 1080;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      imageRef.current = img;

      // Draw all layers with size multiplier
      currentTemplate.layers.forEach(layer => {
        const text = layerTexts[layer.id] || layer.defaultText || '';
        const modifiedLayer = {
          ...layer,
          color: layerColors[layer.id] || layer.color
        };
        drawTextLayer(ctx, modifiedLayer, text, canvas.width, canvas.height, sizeMultiplier);
      });

      setImageLoaded(true);
      setError(null);
    };

    img.onerror = () => {
      setError('Failed to load image');
      setImageLoaded(false);
    };

    img.src = imageUrl;
  }, [imageUrl, currentTemplate, layerTexts, layerColors, sizeMultiplier, concept.image_prompt]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // ════════════════════════════════════════════════════════════════
  // SAVE HANDLER — FIXED
  // ════════════════════════════════════════════════════════════════
  const handleSave = async () => {
    if (!onTextChange) {
      console.error('onTextChange prop not provided');
      setError('Save function not available');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const newConfig = {
        templateId,
        layerTexts,
        layerColors,
        sizeMultiplier,
        primary_text: layerTexts[currentTemplate.layers[0]?.id] || ''
      };

      console.log('Saving text config:', newConfig);
      
      // Call the parent's save function and wait for it
      await onTextChange(newConfig);
      
      console.log('Save successful');
      setIsEditing(false);
    } catch (e) {
      console.error('Save failed:', e);
      setError('Failed to save: ' + (e.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to saved values
    const tplId = savedConfig.templateId || 'shock_side';
    const template = TEXT_TEMPLATES[tplId];
    setTemplateId(tplId);
    setSizeMultiplier(savedConfig.sizeMultiplier || 1.0);
    
    const texts = {};
    const colors = {};
    template.layers.forEach(layer => {
      texts[layer.id] = savedConfig.layerTexts?.[layer.id] || layer.defaultText || '';
      colors[layer.id] = savedConfig.layerColors?.[layer.id] || layer.color;
    });
    setLayerTexts(texts);
    setLayerColors(colors);
    setIsEditing(false);
    setError(null);
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

  const handleTemplateChange = (newTemplateId) => {
    setTemplateId(newTemplateId);
    
    const template = TEXT_TEMPLATES[newTemplateId];
    const texts = {};
    const colors = {};
    template.layers.forEach(layer => {
      texts[layer.id] = layerTexts[layer.id] || layer.defaultText || '';
      colors[layer.id] = layerColors[layer.id] || layer.color;
    });
    setLayerTexts(texts);
    setLayerColors(colors);
  };

  // Quick color presets
  const colorPresets = ['#FFFFFF', '#FFD700', '#00FF88', '#00FFFF', '#FF4444', '#FF6B00', '#FF00FF'];

  // Size presets
  const sizePresets = [
    { value: 0.7, label: 'S' },
    { value: 1.0, label: 'M' },
    { value: 1.3, label: 'L' },
    { value: 1.6, label: 'XL' },
    { value: 2.0, label: '2X' },
  ];

  return (
    <div className={`relative ${className}`}>
      {/* Canvas */}
      <div className="relative rounded-lg overflow-hidden bg-gray-900">
        <canvas
          ref={canvasRef}
          className="w-full h-auto"
          style={{ 
            aspectRatio: concept.image_prompt?.includes('9:16') ? '9/16' : '16/9',
            display: 'block'
          }}
        />

        {!imageLoaded && !error && imageUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        )}

        {error && !isEditing && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/50">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {imageLoaded && !isEditing && editable && (
          <div className="absolute top-2 right-2 flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-8 p-0 bg-black/60 hover:bg-black/80 text-white"
              onClick={() => setIsEditing(true)}
              title="Edit text overlay"
            >
              <Edit3 className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-8 p-0 bg-black/60 hover:bg-black/80 text-white"
              onClick={handleDownload}
              title="Download"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        )}

        {imageLoaded && !isEditing && (
          <div className="absolute bottom-2 left-2">
            <Badge className="bg-black/70 text-white text-[10px]">
              📐 {currentTemplate.name} {sizeMultiplier !== 1.0 && `(${Math.round(sizeMultiplier * 100)}%)`}
            </Badge>
          </div>
        )}
      </div>

      {/* Edit Panel */}
      {isEditing && (
        <div className="mt-3 p-4 bg-white rounded-lg border shadow-lg space-y-4">
          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Template Selector */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
              Text Layout Template
            </label>
            <TemplateSelector
              selectedTemplate={templateId}
              onSelect={handleTemplateChange}
              isOpen={templateSelectorOpen}
              onToggle={() => setTemplateSelectorOpen(!templateSelectorOpen)}
            />
          </div>

          {/* TEXT SIZE CONTROL — NEW */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ZoomIn className="w-3.5 h-3.5" />
                Text Size
              </span>
              <span className="text-purple-600 font-bold">{Math.round(sizeMultiplier * 100)}%</span>
            </label>
            
            {/* Size Preset Buttons */}
            <div className="flex gap-1.5 mb-2">
              {sizePresets.map(preset => (
                <button
                  key={preset.value}
                  onClick={() => setSizeMultiplier(preset.value)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${
                    Math.abs(sizeMultiplier - preset.value) < 0.05
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-purple-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Fine-tune Slider */}
            <div className="flex items-center gap-3">
              <ZoomOut className="w-4 h-4 text-gray-400" />
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.05"
                value={sizeMultiplier}
                onChange={(e) => setSizeMultiplier(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
              />
              <ZoomIn className="w-4 h-4 text-gray-400" />
            </div>
          </div>

          {/* Layer Editors */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 block">
              Text Layers ({currentTemplate.layers.length})
            </label>
            {currentTemplate.layers.map(layer => (
              <LayerEditor
                key={layer.id}
                layer={layer}
                text={layerTexts[layer.id] || ''}
                onChange={(value) => setLayerTexts(prev => ({ ...prev, [layer.id]: value }))}
                color={layerColors[layer.id] || layer.color}
                onColorChange={(value) => setLayerColors(prev => ({ ...prev, [layer.id]: value }))}
              />
            ))}
          </div>

          {/* Quick Colors */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
              Quick Colors (Primary)
            </label>
            <div className="flex gap-1.5">
              {colorPresets.map(color => (
                <button
                  key={color}
                  onClick={() => setLayerColors(prev => ({ 
                    ...prev, 
                    [currentTemplate.layers[0]?.id]: color 
                  }))}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    layerColors[currentTemplate.layers[0]?.id] === color
                      ? 'border-purple-500 scale-110 shadow-md'
                      : 'border-gray-300 hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 border-t">
            <Button 
              size="sm" 
              variant="outline" 
              className="flex-1 h-10" 
              onClick={handleCancel}
              disabled={saving}
            >
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
            <Button 
              size="sm" 
              className="flex-1 h-10 bg-purple-600 hover:bg-purple-700" 
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1.5" /> Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// BATCH DOWNLOAD UTILITY
// ══════════════════════════════════════════════════════════════════

export async function downloadAllThumbnails(concepts, prefix = 'thumbnail') {
  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];
    if (!concept.image_url) continue;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const isShorts = concept.image_prompt?.includes('9:16');
    canvas.width = isShorts ? 1080 : 1920;
    canvas.height = isShorts ? 1920 : 1080;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let config = {};
        try {
          config = JSON.parse(concept.text_style || '{}');
        } catch (_) {}

        const templateId = config.templateId || 'shock_side';
        const template = TEXT_TEMPLATES[templateId];
        const sizeMultiplier = config.sizeMultiplier || 1.0;
        
        if (template) {
          template.layers.forEach(layer => {
            const text = config.layerTexts?.[layer.id] || 
                        concept.text_overlay || 
                        layer.defaultText || '';
            const modifiedLayer = {
              ...layer,
              color: config.layerColors?.[layer.id] || layer.color
            };
            drawTextLayer(ctx, modifiedLayer, text, canvas.width, canvas.height, sizeMultiplier);
          });
        }

        const link = document.createElement('a');
        link.download = `${prefix}-${concept.rank || i + 1}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();

        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to load image`));
      img.src = concept.image_url;
    });

    await new Promise(r => setTimeout(r, 600));
  }
}