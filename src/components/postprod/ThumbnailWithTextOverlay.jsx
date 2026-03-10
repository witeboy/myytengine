// ══════════════════════════════════════════════════════════════════
// ThumbnailWithTextOverlay.jsx — V4 STYLED
// ✅ Ultra-bold YouTube style as default (Bangers font)
// ✅ Font picker (5 options)
// ✅ Style controls: outline, shadow, color
// ✅ Tilt / rotation option
// ══════════════════════════════════════════════════════════════════

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download, RefreshCw, Edit3, Check, X,
  ChevronDown, Palette, Type, Layout, Save, Loader2,
  ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// FONT OPTIONS — All loaded from Google Fonts
// ══════════════════════════════════════════════════════════════════

const FONT_OPTIONS = [
  {
    id: 'Bangers',
    label: 'Bangers',
    description: 'Ultra-bold comic style — like the reference image',
    googleFont: 'Bangers',
    stack: "'Bangers', Impact, sans-serif",
    letterSpacing: '0.03em',
  },
  {
    id: 'Anton',
    label: 'Anton',
    description: 'Tall, condensed — clean Impact replacement',
    googleFont: 'Anton',
    stack: "'Anton', Impact, sans-serif",
    letterSpacing: '0.01em',
  },
  {
    id: 'Bebas Neue',
    label: 'Bebas Neue',
    description: 'Sleek condensed — modern editorial feel',
    googleFont: 'Bebas+Neue',
    stack: "'Bebas Neue', Arial Narrow, sans-serif",
    letterSpacing: '0.04em',
  },
  {
    id: 'Montserrat',
    label: 'Montserrat Black',
    description: 'Geometric sans — thick and premium',
    googleFont: 'Montserrat:wght@900',
    stack: "'Montserrat', Arial, sans-serif",
    letterSpacing: '-0.01em',
    weight: 900,
  },
  {
    id: 'Oswald',
    label: 'Oswald Bold',
    description: 'Tall and editorial — great for facts/stats',
    googleFont: 'Oswald:wght@700',
    stack: "'Oswald', Arial Narrow, sans-serif",
    letterSpacing: '0.02em',
  },
];

// ══════════════════════════════════════════════════════════════════
// LOAD GOOGLE FONTS into the document (for canvas)
// ══════════════════════════════════════════════════════════════════

const loadedFonts = new Set();

async function loadGoogleFont(fontOption) {
  if (loadedFonts.has(fontOption.id)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontOption.googleFont}&display=swap`;
  document.head.appendChild(link);

  await document.fonts.ready;
  // Extra wait to ensure font is registered with canvas
  await new Promise(r => setTimeout(r, 300));
  loadedFonts.add(fontOption.id);
}

// ══════════════════════════════════════════════════════════════════
// TEXT TEMPLATES — Layout definitions
// ══════════════════════════════════════════════════════════════════

const TEXT_TEMPLATES = {
  shock_side: {
    id: 'shock_side',
    name: 'Shock Side',
    preview: '💥',
    layers: [
      { id: 'headline', type: 'primary', position: { x: 0.05, y: 0.22 }, align: 'left', fontSizePercent: 0.14, maxWidth: 0.50, uppercase: true }
    ]
  },
  centered_massive: {
    id: 'centered_massive',
    name: 'Centered Massive',
    preview: '🎯',
    layers: [
      { id: 'headline', type: 'primary', position: { x: 0.50, y: 0.18 }, align: 'center', fontSizePercent: 0.16, maxWidth: 0.90, uppercase: true }
    ]
  },
  stacked_youtube: {
    id: 'stacked_youtube',
    name: 'YouTube Stacked',
    preview: '📺',
    layers: [
      { id: 'headline', type: 'primary', position: { x: 0.50, y: 0.14 }, align: 'center', fontSizePercent: 0.15, maxWidth: 0.85, uppercase: true },
      { id: 'subtext', type: 'secondary', position: { x: 0.50, y: 0.34 }, align: 'center', fontSizePercent: 0.09, maxWidth: 0.80, uppercase: true }
    ]
  },
  split_before_after: {
    id: 'split_before_after',
    name: 'Before / After',
    preview: '↔️',
    layers: [
      { id: 'before_label', type: 'primary', position: { x: 0.25, y: 0.12 }, align: 'center', fontSizePercent: 0.12, maxWidth: 0.40, uppercase: true, defaultText: 'BEFORE', defaultColor: '#FF4444' },
      { id: 'after_label', type: 'secondary', position: { x: 0.75, y: 0.12 }, align: 'center', fontSizePercent: 0.12, maxWidth: 0.40, uppercase: true, defaultText: 'AFTER', defaultColor: '#00FF88' }
    ]
  },
  income_reveal: {
    id: 'income_reveal',
    name: 'Income Reveal',
    preview: '💰',
    layers: [
      { id: 'amount', type: 'primary', position: { x: 0.05, y: 0.18 }, align: 'left', fontSizePercent: 0.20, maxWidth: 0.60, uppercase: true, defaultText: '$47,382', defaultColor: '#00FF88' },
      { id: 'timeframe', type: 'secondary', position: { x: 0.05, y: 0.40 }, align: 'left', fontSizePercent: 0.08, maxWidth: 0.50, uppercase: true, defaultText: 'IN 6 MONTHS' }
    ]
  },
  warning_alert: {
    id: 'warning_alert',
    name: 'Warning Alert',
    preview: '⚠️',
    layers: [
      { id: 'warning', type: 'primary', position: { x: 0.50, y: 0.15 }, align: 'center', fontSizePercent: 0.14, maxWidth: 0.85, uppercase: true, defaultText: 'STOP DOING THIS', defaultColor: '#FFFFFF' },
      { id: 'consequence', type: 'secondary', position: { x: 0.50, y: 0.34 }, align: 'center', fontSizePercent: 0.07, maxWidth: 0.70, uppercase: true, defaultColor: '#FF4444' }
    ]
  },
  question_hook: {
    id: 'question_hook',
    name: 'Question Hook',
    preview: '❓',
    layers: [
      { id: 'question', type: 'primary', position: { x: 0.05, y: 0.15 }, align: 'left', fontSizePercent: 0.15, maxWidth: 0.55, uppercase: true, defaultText: '$10 A DAY?' }
    ]
  },
  minimal_corner: {
    id: 'minimal_corner',
    name: 'Minimal Corner',
    preview: '📌',
    layers: [
      { id: 'text', type: 'primary', position: { x: 0.05, y: 0.88 }, align: 'left', fontSizePercent: 0.06, maxWidth: 0.50, uppercase: false }
    ]
  },
};

// ══════════════════════════════════════════════════════════════════
// DEFAULT STYLE — matches the reference image exactly
// ══════════════════════════════════════════════════════════════════

const DEFAULT_STYLE = {
  fontId: 'Bangers',
  color: '#FFD700',       // bright golden-yellow
  strokeColor: '#000000', // thick black outline
  strokeWidthFactor: 0.10, // 10% of font size = thick
  shadowEnabled: true,
  shadowColor: '#000000',
  shadowOffsetFactor: 0.08, // hard offset shadow
  shadowBlur: 0,           // hard-edged (no blur)
  letterSpacing: '0.03em',
  sizeMultiplier: 1.0,
  tiltDeg: 0,
};

// ══════════════════════════════════════════════════════════════════
// CANVAS DRAW FUNCTION
// ══════════════════════════════════════════════════════════════════

function drawTextLayer(ctx, layer, text, canvasW, canvasH, style, sizeMultiplier) {
  if (!text || !text.trim()) return;

  const fontOption = FONT_OPTIONS.find(f => f.id === style.fontId) || FONT_OPTIONS[0];
  const displayText = layer.uppercase ? text.toUpperCase() : text;

  const baseFontSize = canvasH * layer.fontSizePercent;
  const fontSize = Math.round(baseFontSize * sizeMultiplier);
  const strokeW = Math.max(4, Math.round(fontSize * style.strokeWidthFactor));
  const shadowOff = Math.round(fontSize * style.shadowOffsetFactor);
  const fontWeight = fontOption.weight || 400;

  const x = canvasW * layer.position.x;
  const y = canvasH * layer.position.y;

  const layerColor = layer.overrideColor || style.color;

  ctx.save();

  // Apply tilt around the text's anchor point
  if (style.tiltDeg !== 0) {
    ctx.translate(x, y);
    ctx.rotate((style.tiltDeg * Math.PI) / 180);
    ctx.translate(-x, -y);
  }

  ctx.font = `${fontWeight} ${fontSize}px ${fontOption.stack}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = layer.align;

  // Hard drop shadow (rendered as filled text offset)
  if (style.shadowEnabled) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = style.shadowColor;
    if (style.shadowBlur > 0) {
      ctx.shadowBlur = style.shadowBlur;
      ctx.shadowColor = style.shadowColor;
    }
    ctx.fillText(displayText, x + shadowOff, y + shadowOff);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
  }

  // Stroke (outline)
  if (strokeW > 0) {
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = strokeW;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeText(displayText, x, y);
  }

  // Fill
  ctx.fillStyle = layerColor;
  ctx.fillText(displayText, x, y);

  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════
// TEMPLATE SELECTOR
// ══════════════════════════════════════════════════════════════════

function TemplateSelector({ selectedTemplate, onSelect }) {
  const [open, setOpen] = useState(false);
  const templates = Object.values(TEXT_TEMPLATES);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-white border-2 border-gray-200 hover:border-purple-400 rounded-lg text-sm font-semibold transition-colors"
      >
        <span className="flex items-center gap-2">
          <Layout className="w-4 h-4 text-purple-500" />
          {TEXT_TEMPLATES[selectedTemplate]?.preview} {TEXT_TEMPLATES[selectedTemplate]?.name}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-purple-200 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => { onSelect(t.id); setOpen(false); }}
              className={`w-full px-3 py-2.5 text-left flex items-center gap-3 hover:bg-purple-50 border-b last:border-b-0 transition-colors ${selectedTemplate === t.id ? 'bg-purple-50' : ''}`}
            >
              <span className="text-xl w-7 shrink-0">{t.preview}</span>
              <span className="text-sm font-medium text-gray-800">{t.name}</span>
              {selectedTemplate === t.id && <Check className="w-4 h-4 text-purple-600 ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// FONT SELECTOR
// ══════════════════════════════════════════════════════════════════

function FontSelector({ selectedFontId, onSelect }) {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {FONT_OPTIONS.map(f => (
        <button
          key={f.id}
          onClick={() => onSelect(f.id)}
          className={`flex items-center justify-between px-3 py-2 rounded-lg border-2 text-left transition-all ${
            selectedFontId === f.id
              ? 'border-purple-500 bg-purple-50'
              : 'border-gray-100 bg-gray-50 hover:border-purple-200'
          }`}
        >
          <div>
            <p className="text-sm font-bold text-gray-900" style={{ fontFamily: f.stack }}>{f.label}</p>
            <p className="text-[10px] text-gray-400">{f.description}</p>
          </div>
          {selectedFontId === f.id && <Check className="w-4 h-4 text-purple-600 shrink-0" />}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// SECTION HEADER helper
// ══════════════════════════════════════════════════════════════════

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">{children}</p>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

export default function ThumbnailWithTextOverlay({
  imageUrl,
  concept = {},
  onTextChange,
  onDownload,
  editable = true,
  className = '',
}) {
  const canvasRef = useRef(null);

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError] = useState(null);

  // Layout
  const [templateId, setTemplateId] = useState('shock_side');

  // Per-layer text & color overrides
  const [layerTexts, setLayerTexts] = useState({});
  const [layerColorOverrides, setLayerColorOverrides] = useState({});

  // Global style
  const [style, setStyle] = useState({ ...DEFAULT_STYLE });

  const currentTemplate = TEXT_TEMPLATES[templateId] || TEXT_TEMPLATES.shock_side;

  // ── Parse saved config ──────────────────────────────────────────
  const savedConfig = React.useMemo(() => {
    try { return JSON.parse(concept.text_style || '{}'); } catch (_) { return {}; }
  }, [concept.text_style]);

  useEffect(() => {
    const tplId = savedConfig.templateId || 'shock_side';
    const template = TEXT_TEMPLATES[tplId] || TEXT_TEMPLATES.shock_side;
    setTemplateId(tplId);

    const savedStyle = savedConfig.style || {};
    setStyle({ ...DEFAULT_STYLE, ...savedStyle });

    const texts = {};
    const colors = {};
    template.layers.forEach(layer => {
      texts[layer.id] = savedConfig.layerTexts?.[layer.id] || concept.text_overlay || layer.defaultText || '';
      colors[layer.id] = savedConfig.layerColorOverrides?.[layer.id] || layer.defaultColor || null;
    });
    setLayerTexts(texts);
    setLayerColorOverrides(colors);
  }, [savedConfig, concept.text_overlay]);

  // ── Load font & render canvas ───────────────────────────────────
  const renderCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;

    const fontOption = FONT_OPTIONS.find(f => f.id === style.fontId) || FONT_OPTIONS[0];
    await loadGoogleFont(fontOption);

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const isShorts = concept.image_prompt?.includes('9:16') || img.height > img.width * 1.3;
      canvas.width = isShorts ? 1080 : 1920;
      canvas.height = isShorts ? 1920 : 1080;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      currentTemplate.layers.forEach(layer => {
        const text = layerTexts[layer.id] || layer.defaultText || '';
        const layerWithColor = {
          ...layer,
          overrideColor: layerColorOverrides[layer.id] || null,
        };
        drawTextLayer(ctx, layerWithColor, text, canvas.width, canvas.height, style, style.sizeMultiplier);
      });

      setImageLoaded(true);
      setError(null);
    };

    img.onerror = () => { setError('Failed to load image'); setImageLoaded(false); };
    img.src = imageUrl;
  }, [imageUrl, currentTemplate, layerTexts, layerColorOverrides, style, concept.image_prompt]);

  useEffect(() => { renderCanvas(); }, [renderCanvas]);

  // ── Handle template change ──────────────────────────────────────
  const handleTemplateChange = (newId) => {
    setTemplateId(newId);
    const template = TEXT_TEMPLATES[newId];
    const texts = {};
    const colors = {};
    template.layers.forEach(layer => {
      texts[layer.id] = layerTexts[layer.id] || layer.defaultText || '';
      colors[layer.id] = layerColorOverrides[layer.id] || layer.defaultColor || null;
    });
    setLayerTexts(texts);
    setLayerColorOverrides(colors);
  };

  // ── Save ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!onTextChange) return;
    setSaving(true);
    setError(null);
    try {
      const config = {
        templateId,
        layerTexts,
        layerColorOverrides,
        style,
        primary_text: layerTexts[currentTemplate.layers[0]?.id] || '',
      };
      await onTextChange(config);
      setIsEditing(false);
    } catch (e) {
      setError('Failed to save: ' + (e.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // reset from saved
    const tplId = savedConfig.templateId || 'shock_side';
    const template = TEXT_TEMPLATES[tplId] || TEXT_TEMPLATES.shock_side;
    setTemplateId(tplId);
    setStyle({ ...DEFAULT_STYLE, ...(savedConfig.style || {}) });
    const texts = {};
    const colors = {};
    template.layers.forEach(layer => {
      texts[layer.id] = savedConfig.layerTexts?.[layer.id] || layer.defaultText || '';
      colors[layer.id] = savedConfig.layerColorOverrides?.[layer.id] || layer.defaultColor || null;
    });
    setLayerTexts(texts);
    setLayerColorOverrides(colors);
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

  const updateStyle = (key, value) => setStyle(prev => ({ ...prev, [key]: value }));

  // Quick color presets
  const colorPresets = ['#FFD700', '#FFFFFF', '#00FF88', '#00CFFF', '#FF4444', '#FF6B00', '#FF00FF', '#000000'];

  // Tilt presets
  const tiltPresets = [
    { label: '−8°', value: -8 },
    { label: '−4°', value: -4 },
    { label: '0°',  value: 0  },
    { label: '+4°', value: 4  },
    { label: '+8°', value: 8  },
  ];

  return (
    <div className={`relative ${className}`}>
      {/* ── Canvas ── */}
      <div className="relative rounded-lg overflow-hidden bg-gray-900">
        <canvas
          ref={canvasRef}
          className="w-full h-auto block"
          style={{ aspectRatio: concept.image_prompt?.includes('9:16') ? '9/16' : '16/9' }}
        />

        {!imageLoaded && !error && imageUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/50">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {imageLoaded && !isEditing && editable && (
          <div className="absolute top-2 right-2 flex gap-1">
            <Button size="sm" variant="secondary"
              className="h-8 w-8 p-0 bg-black/60 hover:bg-black/80 text-white"
              onClick={() => setIsEditing(true)} title="Edit text">
              <Edit3 className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="secondary"
              className="h-8 w-8 p-0 bg-black/60 hover:bg-black/80 text-white"
              onClick={handleDownload} title="Download">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        )}

        {imageLoaded && !isEditing && (
          <div className="absolute bottom-2 left-2">
            <Badge className="bg-black/70 text-white text-[10px]">
              {currentTemplate.preview} {currentTemplate.name}
              {style.tiltDeg !== 0 && ` · ${style.tiltDeg > 0 ? '+' : ''}${style.tiltDeg}°`}
            </Badge>
          </div>
        )}
      </div>

      {/* ── Edit Panel ── */}
      {isEditing && (
        <div className="mt-3 p-4 bg-white rounded-xl border-2 border-purple-100 shadow-xl space-y-5">

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {/* ─ Layout ─ */}
          <div>
            <SectionLabel>📐 Layout Template</SectionLabel>
            <TemplateSelector selectedTemplate={templateId} onSelect={handleTemplateChange} />
          </div>

          {/* ─ Text layers ─ */}
          <div>
            <SectionLabel>✏️ Text Content</SectionLabel>
            <div className="space-y-2">
              {currentTemplate.layers.map(layer => (
                <div key={layer.id} className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    {layer.id.replace(/_/g, ' ')}
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={layerTexts[layer.id] || ''}
                      onChange={e => setLayerTexts(prev => ({ ...prev, [layer.id]: e.target.value }))}
                      className={`flex-1 px-3 py-2 text-sm border-2 border-gray-200 focus:border-purple-400 rounded-lg font-bold bg-white outline-none ${layer.uppercase ? 'uppercase' : ''}`}
                      placeholder={layer.defaultText || 'Enter text...'}
                    />
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-gray-400">Color</label>
                      <input
                        type="color"
                        value={layerColorOverrides[layer.id] || style.color}
                        onChange={e => setLayerColorOverrides(prev => ({ ...prev, [layer.id]: e.target.value }))}
                        className="w-9 h-9 rounded-lg cursor-pointer border-2 border-gray-200"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─ Font ─ */}
          <div>
            <SectionLabel>🔤 Font Style</SectionLabel>
            <FontSelector selectedFontId={style.fontId} onSelect={id => updateStyle('fontId', id)} />
          </div>

          {/* ─ Global Color + Quick Presets ─ */}
          <div>
            <SectionLabel>🎨 Primary Text Color</SectionLabel>
            <div className="flex gap-2 flex-wrap items-center">
              {colorPresets.map(c => (
                <button
                  key={c}
                  onClick={() => updateStyle('color', c)}
                  title={c}
                  className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${style.color === c ? 'border-purple-500 scale-110 shadow-md' : 'border-gray-300'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={style.color}
                onChange={e => updateStyle('color', e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer border-2 border-dashed border-gray-300"
                title="Custom color"
              />
            </div>
          </div>

          {/* ─ Stroke (outline) ─ */}
          <div>
            <SectionLabel>🖊️ Outline (Stroke)</SectionLabel>
            <div className="flex items-center gap-3 mb-2">
              <input
                type="color"
                value={style.strokeColor}
                onChange={e => updateStyle('strokeColor', e.target.value)}
                className="w-9 h-9 rounded-lg cursor-pointer border-2 border-gray-200"
                title="Stroke color"
              />
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>Thickness</span>
                  <span className="font-bold text-purple-600">{Math.round(style.strokeWidthFactor * 100)}%</span>
                </div>
                <input type="range" min="0" max="0.20" step="0.01"
                  value={style.strokeWidthFactor}
                  onChange={e => updateStyle('strokeWidthFactor', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
              </div>
            </div>
          </div>

          {/* ─ Shadow ─ */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel>🌑 Drop Shadow</SectionLabel>
              <button
                onClick={() => updateStyle('shadowEnabled', !style.shadowEnabled)}
                className={`relative inline-flex h-5 w-10 rounded-full transition-colors ${style.shadowEnabled ? 'bg-purple-500' : 'bg-gray-200'}`}
              >
                <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5 ${style.shadowEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {style.shadowEnabled && (
              <div className="space-y-2 pl-1">
                <div>
                  <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                    <span>Offset (hard → far)</span>
                    <span className="font-bold text-purple-600">{Math.round(style.shadowOffsetFactor * 100)}%</span>
                  </div>
                  <input type="range" min="0" max="0.15" step="0.005"
                    value={style.shadowOffsetFactor}
                    onChange={e => updateStyle('shadowOffsetFactor', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                    <span>Blur (0 = hard edge)</span>
                    <span className="font-bold text-purple-600">{style.shadowBlur}px</span>
                  </div>
                  <input type="range" min="0" max="30" step="1"
                    value={style.shadowBlur}
                    onChange={e => updateStyle('shadowBlur', parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ─ Text Size ─ */}
          <div>
            <div className="flex justify-between mb-1.5">
              <SectionLabel>📏 Text Size</SectionLabel>
              <span className="text-xs font-bold text-purple-600">{Math.round(style.sizeMultiplier * 100)}%</span>
            </div>
            <div className="flex gap-1.5 mb-2">
              {[{ v: 0.7, l: 'S' }, { v: 1.0, l: 'M' }, { v: 1.3, l: 'L' }, { v: 1.6, l: 'XL' }, { v: 2.0, l: '2X' }].map(p => (
                <button key={p.v} onClick={() => updateStyle('sizeMultiplier', p.v)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${Math.abs(style.sizeMultiplier - p.v) < 0.05 ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-purple-100'}`}>
                  {p.l}
                </button>
              ))}
            </div>
            <input type="range" min="0.5" max="2.5" step="0.05"
              value={style.sizeMultiplier}
              onChange={e => updateStyle('sizeMultiplier', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
          </div>

          {/* ─ Tilt / Rotation ─ */}
          <div>
            <div className="flex justify-between mb-1.5">
              <SectionLabel>🔄 Text Tilt</SectionLabel>
              <span className="text-xs font-bold text-purple-600">
                {style.tiltDeg > 0 ? '+' : ''}{style.tiltDeg}°
              </span>
            </div>
            <div className="flex gap-1.5 mb-2">
              {tiltPresets.map(p => (
                <button key={p.value} onClick={() => updateStyle('tiltDeg', p.value)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${style.tiltDeg === p.value ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-purple-100'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <input type="range" min="-15" max="15" step="1"
              value={style.tiltDeg}
              onChange={e => updateStyle('tiltDeg', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            {style.tiltDeg !== 0 && (
              <button onClick={() => updateStyle('tiltDeg', 0)}
                className="mt-1.5 text-xs text-gray-400 hover:text-purple-600 flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Reset tilt
              </button>
            )}
          </div>

          {/* ─ Actions ─ */}
          <div className="flex gap-2 pt-2 border-t">
            <Button size="sm" variant="outline" className="flex-1 h-10" onClick={handleCancel} disabled={saving}>
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
            <Button size="sm" className="flex-1 h-10 bg-purple-600 hover:bg-purple-700" onClick={handleSave} disabled={saving}>
              {saving
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</>
                : <><Save className="w-4 h-4 mr-1.5" /> Save Changes</>
              }
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
      img.onload = async () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let config = {};
        try { config = JSON.parse(concept.text_style || '{}'); } catch (_) {}

        const templateId = config.templateId || 'shock_side';
        const template = TEXT_TEMPLATES[templateId];
        const style = { ...DEFAULT_STYLE, ...(config.style || {}) };

        const fontOption = FONT_OPTIONS.find(f => f.id === style.fontId) || FONT_OPTIONS[0];
        await loadGoogleFont(fontOption);

        if (template) {
          template.layers.forEach(layer => {
            const text = config.layerTexts?.[layer.id] || concept.text_overlay || layer.defaultText || '';
            const layerWithColor = { ...layer, overrideColor: config.layerColorOverrides?.[layer.id] || null };
            drawTextLayer(ctx, layerWithColor, text, canvas.width, canvas.height, style, style.sizeMultiplier);
          });
        }

        const link = document.createElement('a');
        link.download = `${prefix}-${concept.rank || i + 1}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
        resolve();
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = concept.image_url;
    });

    await new Promise(r => setTimeout(r, 600));
  }
}