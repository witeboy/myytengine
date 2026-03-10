// ══════════════════════════════════════════════════════════════════
// ThumbnailWithTextOverlay.jsx — V5
// ✅ Each word fills its own line (auto-scaled to column width)
// ✅ Dynamic Y stacking — words never overlap
// ✅ Smooth stroke (miter limit + round joins, no jaggies)
// ✅ Font picker, size, tilt, color, outline, shadow controls
// ══════════════════════════════════════════════════════════════════

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download, RefreshCw, Edit3, Check, X,
  ChevronDown, Layout, Save, Loader2, RotateCcw, ZoomIn, ZoomOut
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// FONT OPTIONS
// ══════════════════════════════════════════════════════════════════

const FONT_OPTIONS = [
  {
    id: 'Bangers',
    label: 'Bangers',
    description: 'Ultra-bold comic — matches the reference image',
    googleFont: 'Bangers',
    stack: "'Bangers', Impact, sans-serif",
    weight: 400,
  },
  {
    id: 'Anton',
    label: 'Anton',
    description: 'Tall condensed — clean Impact replacement',
    googleFont: 'Anton',
    stack: "'Anton', Impact, sans-serif",
    weight: 400,
  },
  {
    id: 'Bebas Neue',
    label: 'Bebas Neue',
    description: 'Sleek condensed — modern editorial',
    googleFont: 'Bebas+Neue',
    stack: "'Bebas Neue', Arial Narrow, sans-serif",
    weight: 400,
  },
  {
    id: 'Montserrat',
    label: 'Montserrat Black',
    description: 'Geometric thick — premium feel',
    googleFont: 'Montserrat:wght@900',
    stack: "'Montserrat', Arial, sans-serif",
    weight: 900,
  },
  {
    id: 'Oswald',
    label: 'Oswald Bold',
    description: 'Tall editorial — great for stats',
    googleFont: 'Oswald:wght@700',
    stack: "'Oswald', Arial Narrow, sans-serif",
    weight: 700,
  },
];

// ══════════════════════════════════════════════════════════════════
// GOOGLE FONT LOADER
// ══════════════════════════════════════════════════════════════════

const loadedFonts = new Set();

async function loadGoogleFont(fontOption) {
  if (loadedFonts.has(fontOption.id)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontOption.googleFont}&display=swap`;
  document.head.appendChild(link);
  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 400));
  loadedFonts.add(fontOption.id);
}

// ══════════════════════════════════════════════════════════════════
// TEXT TEMPLATES — layout zones only (no hardcoded font/color)
// ══════════════════════════════════════════════════════════════════

const TEXT_TEMPLATES = {
  shock_side: {
    id: 'shock_side',
    name: 'Shock Side',
    preview: '💥',
    description: 'Big stacked words on the left — classic YouTube',
    startX: 0.04,
    startY: 0.08,
    columnWidth: 0.52,
    align: 'left',
    layers: [
      { id: 'headline', label: 'Main Text', defaultText: '$2,000 HIDDEN SECRET' },
    ]
  },
  centered_stack: {
    id: 'centered_stack',
    name: 'Centered Stack',
    preview: '🎯',
    description: 'Words centered across the full width',
    startX: 0.50,
    startY: 0.06,
    columnWidth: 0.88,
    align: 'center',
    layers: [
      { id: 'headline', label: 'Main Text', defaultText: "YOU WON'T BELIEVE THIS" },
    ]
  },
  top_banner: {
    id: 'top_banner',
    name: 'Top Banner',
    preview: '📌',
    description: 'Single wide line across the top',
    startX: 0.50,
    startY: 0.08,
    columnWidth: 0.92,
    align: 'center',
    layers: [
      { id: 'headline', label: 'Top Line', defaultText: 'WATCH THIS NOW' },
    ]
  },
  two_zone: {
    id: 'two_zone',
    name: 'Two Zone',
    preview: '📺',
    description: 'Big left text + small right label',
    startX: 0.04,
    startY: 0.08,
    columnWidth: 0.50,
    align: 'left',
    layers: [
      { id: 'main', label: 'Left Text', defaultText: '$47,382' },
      { id: 'sub', label: 'Right Label', defaultText: 'IN 6 MONTHS', isSecondary: true },
    ]
  },
  bottom_caption: {
    id: 'bottom_caption',
    name: 'Bottom Caption',
    preview: '💬',
    description: 'Text anchored to bottom left',
    startX: 0.04,
    startY: 0.60,
    columnWidth: 0.55,
    align: 'left',
    layers: [
      { id: 'caption', label: 'Caption Text', defaultText: 'THIS CHANGED EVERYTHING' },
    ]
  },
};

// ══════════════════════════════════════════════════════════════════
// DEFAULT STYLE — matches reference image
// ══════════════════════════════════════════════════════════════════

const DEFAULT_STYLE = {
  fontId: 'Bangers',
  color: '#FFD700',
  strokeColor: '#000000',
  strokeWidthFactor: 0.07,
  shadowEnabled: true,
  shadowColor: '#000000',
  shadowOffsetFactor: 0.06,
  shadowBlur: 0,
  sizeMultiplier: 1.0,
  tiltDeg: 0,
  lineGap: 0.02,
};

// ══════════════════════════════════════════════════════════════════
// CORE DRAW ENGINE
// Each word auto-scaled to fill column width, stacked dynamically
// ══════════════════════════════════════════════════════════════════

function drawWordStack(ctx, text, canvasW, canvasH, template, style, isSecondary = false) {
  if (!text || !text.trim()) return;

  const fontOption = FONT_OPTIONS.find(f => f.id === style.fontId) || FONT_OPTIONS[0];
  const words = text.toUpperCase().trim().split(/\s+/);
  const colW = canvasW * template.columnWidth;
  const startX = canvasW * template.startX;
  const startY = canvasH * template.startY;
  const lineGap = canvasH * (style.lineGap || 0.02);
  const sizeScale = isSecondary ? 0.45 : 1.0;

  let currentY = startY;

  for (const word of words) {
    // Find font size that makes this word fill the column width
    let fontSize = Math.round(canvasH * 0.10 * style.sizeMultiplier * sizeScale);
    ctx.font = `${fontOption.weight} ${fontSize}px ${fontOption.stack}`;
    let measured = ctx.measureText(word).width;

    // Scale to fill column
    if (measured > 0) {
      fontSize = Math.round(fontSize * (colW / measured));
    }

    // Clamp sizes
    const maxFontSize = Math.round(canvasH * 0.28 * style.sizeMultiplier * sizeScale);
    const minFontSize = Math.round(canvasH * 0.05 * style.sizeMultiplier * sizeScale);
    fontSize = Math.min(maxFontSize, Math.max(minFontSize, fontSize));

    ctx.font = `${fontOption.weight} ${fontSize}px ${fontOption.stack}`;

    const strokeW = Math.max(2, Math.round(fontSize * style.strokeWidthFactor));
    const shadowOff = Math.round(fontSize * style.shadowOffsetFactor);

    let drawX = startX;
    if (template.align === 'center') drawX = canvasW * template.startX;
    else if (template.align === 'right') drawX = startX + colW;

    const drawY = currentY + fontSize * 0.5;

    ctx.save();

    if (style.tiltDeg !== 0) {
      ctx.translate(drawX, drawY);
      ctx.rotate((style.tiltDeg * Math.PI) / 180);
      ctx.translate(-drawX, -drawY);
    }

    ctx.textBaseline = 'middle';
    ctx.textAlign = template.align;

    // Hard drop shadow
    if (style.shadowEnabled) {
      ctx.fillStyle = style.shadowColor;
      ctx.globalAlpha = 0.85;
      ctx.shadowBlur = style.shadowBlur || 0;
      ctx.shadowColor = style.shadowColor;
      ctx.fillText(word, drawX + shadowOff, drawY + shadowOff);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1.0;
    }

    // Smooth stroke
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = strokeW;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(word, drawX, drawY);

    // Fill
    ctx.fillStyle = style.color;
    ctx.fillText(word, drawX, drawY);

    ctx.restore();

    // Advance Y by actual line height + gap
    currentY += fontSize * 1.05 + lineGap;
  }
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
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white border-2 border-gray-200 hover:border-purple-400 rounded-xl text-sm font-semibold transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-lg">{TEXT_TEMPLATES[selectedTemplate]?.preview}</span>
          {TEXT_TEMPLATES[selectedTemplate]?.name}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-purple-200 rounded-xl shadow-2xl z-50 overflow-hidden">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => { onSelect(t.id); setOpen(false); }}
              className={`w-full px-3 py-2.5 text-left flex items-center gap-3 hover:bg-purple-50 border-b last:border-b-0 transition-colors ${selectedTemplate === t.id ? 'bg-purple-50' : ''}`}
            >
              <span className="text-xl w-7 shrink-0">{t.preview}</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-400">{t.description}</p>
              </div>
              {selectedTemplate === t.id && <Check className="w-4 h-4 text-purple-600 ml-auto shrink-0" />}
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
          className={`flex items-center justify-between px-3 py-2 rounded-xl border-2 text-left transition-all ${
            selectedFontId === f.id ? 'border-purple-500 bg-purple-50' : 'border-gray-100 bg-gray-50 hover:border-purple-200'
          }`}
        >
          <div>
            <p className="text-base font-bold text-gray-900 leading-tight" style={{ fontFamily: f.stack }}>
              {f.label}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{f.description}</p>
          </div>
          {selectedFontId === f.id && <Check className="w-4 h-4 text-purple-600 shrink-0 ml-2" />}
        </button>
      ))}
    </div>
  );
}

function SectionLabel({ icon, children }) {
  return (
    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
      {icon && <span>{icon}</span>} {children}
    </p>
  );
}

function SliderRow({ label, value, displayValue, min, max, step, onChange }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-500 mb-1">
        <span>{label}</span>
        <span className="font-bold text-purple-600">{displayValue}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
      />
    </div>
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

  const [templateId, setTemplateId] = useState('shock_side');
  const [layerTexts, setLayerTexts] = useState({});
  const [style, setStyle] = useState({ ...DEFAULT_STYLE });

  const currentTemplate = TEXT_TEMPLATES[templateId] || TEXT_TEMPLATES.shock_side;

  const savedConfig = React.useMemo(() => {
    try { return JSON.parse(concept.text_style || '{}'); } catch (_) { return {}; }
  }, [concept.text_style]);

  useEffect(() => {
    const tplId = savedConfig.templateId || 'shock_side';
    const template = TEXT_TEMPLATES[tplId] || TEXT_TEMPLATES.shock_side;
    setTemplateId(tplId);
    setStyle({ ...DEFAULT_STYLE, ...(savedConfig.style || {}) });
    const texts = {};
    template.layers.forEach(layer => {
      texts[layer.id] = savedConfig.layerTexts?.[layer.id] || concept.text_overlay || layer.defaultText || '';
    });
    setLayerTexts(texts);
  }, [savedConfig, concept.text_overlay]);

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

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      currentTemplate.layers.forEach(layer => {
        const text = layerTexts[layer.id] || layer.defaultText || '';
        if (!text.trim()) return;

        if (layer.isSecondary) {
          const secondaryTemplate = {
            ...currentTemplate,
            startX: 0.55,
            startY: 0.08,
            columnWidth: 0.40,
            align: 'left',
          };
          drawWordStack(ctx, text, canvas.width, canvas.height, secondaryTemplate, style, true);
        } else {
          drawWordStack(ctx, text, canvas.width, canvas.height, currentTemplate, style, false);
        }
      });

      setImageLoaded(true);
      setError(null);
    };

    img.onerror = () => { setError('Failed to load image'); setImageLoaded(false); };
    img.src = imageUrl;
  }, [imageUrl, currentTemplate, layerTexts, style, concept.image_prompt]);

  useEffect(() => { renderCanvas(); }, [renderCanvas]);

  const handleTemplateChange = (newId) => {
    setTemplateId(newId);
    const template = TEXT_TEMPLATES[newId];
    const texts = {};
    template.layers.forEach(layer => {
      texts[layer.id] = layerTexts[layer.id] || layer.defaultText || '';
    });
    setLayerTexts(texts);
  };

  const handleSave = async () => {
    if (!onTextChange) return;
    setSaving(true);
    setError(null);
    try {
      await onTextChange({
        templateId,
        layerTexts,
        style,
        primary_text: layerTexts[currentTemplate.layers[0]?.id] || '',
      });
      setIsEditing(false);
    } catch (e) {
      setError('Failed to save: ' + (e.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    const tplId = savedConfig.templateId || 'shock_side';
    const template = TEXT_TEMPLATES[tplId] || TEXT_TEMPLATES.shock_side;
    setTemplateId(tplId);
    setStyle({ ...DEFAULT_STYLE, ...(savedConfig.style || {}) });
    const texts = {};
    template.layers.forEach(layer => {
      texts[layer.id] = savedConfig.layerTexts?.[layer.id] || layer.defaultText || '';
    });
    setLayerTexts(texts);
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

  const colorPresets = ['#FFD700', '#FFFFFF', '#00FF88', '#00CFFF', '#FF4444', '#FF6B00', '#FF00FF', '#000000'];
  const tiltPresets = [
    { label: '−8°', value: -8 }, { label: '−4°', value: -4 },
    { label: '0°', value: 0 }, { label: '+4°', value: 4 }, { label: '+8°', value: 8 },
  ];

  return (
    <div className={`relative ${className}`}>
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
            <button onClick={() => setIsEditing(true)}
              className="h-8 w-8 flex items-center justify-center bg-black/60 hover:bg-black/80 text-white rounded-lg">
              <Edit3 className="w-4 h-4" />
            </button>
            <button onClick={handleDownload}
              className="h-8 w-8 flex items-center justify-center bg-black/60 hover:bg-black/80 text-white rounded-lg">
              <Download className="w-4 h-4" />
            </button>
          </div>
        )}

        {imageLoaded && !isEditing && (
          <div className="absolute bottom-2 left-2">
            <span className="bg-black/70 text-white text-[10px] px-2 py-1 rounded-md">
              {currentTemplate.preview} {currentTemplate.name}
              {style.tiltDeg !== 0 && ` · ${style.tiltDeg > 0 ? '+' : ''}${style.tiltDeg}°`}
            </span>
          </div>
        )}
      </div>

      {isEditing && (
        <div className="mt-3 p-4 bg-white rounded-xl border-2 border-purple-100 shadow-xl space-y-5 max-h-[80vh] overflow-y-auto">

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div>
            <SectionLabel icon="📐">Layout Template</SectionLabel>
            <TemplateSelector selectedTemplate={templateId} onSelect={handleTemplateChange} />
          </div>

          <div>
            <SectionLabel icon="✏️">Text Content</SectionLabel>
            <div className="space-y-2">
              {currentTemplate.layers.map(layer => (
                <div key={layer.id} className="bg-gray-50 rounded-xl p-3">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                    {layer.label}
                  </label>
                  <input
                    type="text"
                    value={layerTexts[layer.id] || ''}
                    onChange={e => setLayerTexts(prev => ({ ...prev, [layer.id]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border-2 border-gray-200 focus:border-purple-400 rounded-lg font-bold bg-white outline-none uppercase"
                    placeholder={layer.defaultText || 'Enter text...'}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Each word auto-scales to fill the column</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel icon="🔤">Font Style</SectionLabel>
            <FontSelector selectedFontId={style.fontId} onSelect={id => updateStyle('fontId', id)} />
          </div>

          <div>
            <SectionLabel icon="🎨">Text Color</SectionLabel>
            <div className="flex gap-2 flex-wrap items-center">
              {colorPresets.map(c => (
                <button key={c} onClick={() => updateStyle('color', c)} title={c}
                  className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${style.color === c ? 'border-purple-500 scale-110 shadow-md' : 'border-gray-300'}`}
                  style={{ backgroundColor: c }} />
              ))}
              <input type="color" value={style.color}
                onChange={e => updateStyle('color', e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer border-2 border-dashed border-gray-300" />
            </div>
          </div>

          <div>
            <SectionLabel icon="🖊️">Outline / Stroke</SectionLabel>
            <div className="flex items-center gap-3 mb-3">
              <input type="color" value={style.strokeColor}
                onChange={e => updateStyle('strokeColor', e.target.value)}
                className="w-9 h-9 rounded-lg cursor-pointer border-2 border-gray-200" />
              <span className="text-xs text-gray-500">Stroke color</span>
            </div>
            <SliderRow
              label="Thickness (7% = smooth, 12% = thick)"
              value={style.strokeWidthFactor}
              displayValue={`${Math.round(style.strokeWidthFactor * 100)}%`}
              min={0} max={0.18} step={0.005}
              onChange={v => updateStyle('strokeWidthFactor', v)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel icon="🌑">Drop Shadow</SectionLabel>
              <button onClick={() => updateStyle('shadowEnabled', !style.shadowEnabled)}
                className={`relative inline-flex h-5 w-10 rounded-full transition-colors shrink-0 ${style.shadowEnabled ? 'bg-purple-500' : 'bg-gray-200'}`}>
                <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5 ${style.shadowEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {style.shadowEnabled && (
              <div className="space-y-3">
                <SliderRow
                  label="Offset (0 = under, 8% = far)"
                  value={style.shadowOffsetFactor}
                  displayValue={`${Math.round(style.shadowOffsetFactor * 100)}%`}
                  min={0} max={0.15} step={0.005}
                  onChange={v => updateStyle('shadowOffsetFactor', v)}
                />
                <SliderRow
                  label="Blur (0 = hard edge like reference)"
                  value={style.shadowBlur}
                  displayValue={`${style.shadowBlur}px`}
                  min={0} max={30} step={1}
                  onChange={v => updateStyle('shadowBlur', v)}
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <SectionLabel icon="📏">Text Size</SectionLabel>
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
            <input type="range" min="0.4" max="2.0" step="0.05" value={style.sizeMultiplier}
              onChange={e => updateStyle('sizeMultiplier', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
          </div>

          <div>
            <SectionLabel icon="↕️">Line Spacing</SectionLabel>
            <SliderRow
              label="Gap between words"
              value={style.lineGap}
              displayValue={`${Math.round(style.lineGap * 100)}%`}
              min={0} max={0.06} step={0.002}
              onChange={v => updateStyle('lineGap', v)}
            />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <SectionLabel icon="🔄">Text Tilt</SectionLabel>
              <span className="text-xs font-bold text-purple-600">{style.tiltDeg > 0 ? '+' : ''}{style.tiltDeg}°</span>
            </div>
            <div className="flex gap-1.5 mb-2">
              {tiltPresets.map(p => (
                <button key={p.value} onClick={() => updateStyle('tiltDeg', p.value)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${style.tiltDeg === p.value ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-purple-100'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <input type="range" min="-15" max="15" step="1" value={style.tiltDeg}
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

          <div className="flex gap-2 pt-2 border-t sticky bottom-0 bg-white pb-1">
            <Button size="sm" variant="outline" className="flex-1 h-10" onClick={handleCancel} disabled={saving}>
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
            <Button size="sm" className="flex-1 h-10 bg-purple-600 hover:bg-purple-700" onClick={handleSave} disabled={saving}>
              {saving
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</>
                : <><Save className="w-4 h-4 mr-1.5" /> Save Changes</>}
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
        const template = TEXT_TEMPLATES[templateId] || TEXT_TEMPLATES.shock_side;
        const style = { ...DEFAULT_STYLE, ...(config.style || {}) };

        const fontOption = FONT_OPTIONS.find(f => f.id === style.fontId) || FONT_OPTIONS[0];
        await loadGoogleFont(fontOption);

        template.layers.forEach(layer => {
          const text = config.layerTexts?.[layer.id] || concept.text_overlay || layer.defaultText || '';
          if (layer.isSecondary) {
            const secondaryTemplate = { ...template, startX: 0.55, startY: 0.08, columnWidth: 0.40, align: 'left' };
            drawWordStack(ctx, text, canvas.width, canvas.height, secondaryTemplate, style, true);
          } else {
            drawWordStack(ctx, text, canvas.width, canvas.height, template, style, false);
          }
        });

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