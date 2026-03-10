// ══════════════════════════════════════════════════════════════════
// ThumbnailWithTextOverlay.jsx — V6
// ✅ Smooth text via offscreen 4x canvas downscaled (true AA)
// ✅ Stacked mode (each word its own line) OR inline mode (one line)
// ✅ Line gap slider — bring words closer or further apart
// ✅ Two Zone: each zone fully independently editable
// ✅ Font, color, outline, shadow, tilt, size controls
// ══════════════════════════════════════════════════════════════════

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Download, RefreshCw, Edit3, Check, X,
  ChevronDown, Save, Loader2, RotateCcw, AlignLeft, Minus
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// FONT OPTIONS
// ══════════════════════════════════════════════════════════════════

const FONT_OPTIONS = [
  { id: 'Bangers',      label: 'Bangers',           description: 'Ultra-bold comic — classic YouTube', googleFont: 'Bangers',             stack: "'Bangers', Impact, sans-serif",      weight: 400 },
  { id: 'Anton',        label: 'Anton',              description: 'Tall condensed — clean & sharp',     googleFont: 'Anton',               stack: "'Anton', Impact, sans-serif",        weight: 400 },
  { id: 'Bebas Neue',   label: 'Bebas Neue',         description: 'Sleek condensed — modern editorial', googleFont: 'Bebas+Neue',          stack: "'Bebas Neue', Arial Narrow, sans-serif", weight: 400 },
  { id: 'Montserrat',   label: 'Montserrat Black',   description: 'Geometric thick — premium feel',     googleFont: 'Montserrat:wght@900', stack: "'Montserrat', Arial, sans-serif",    weight: 900 },
  { id: 'Oswald',       label: 'Oswald Bold',        description: 'Tall editorial — great for stats',   googleFont: 'Oswald:wght@700',     stack: "'Oswald', Arial Narrow, sans-serif", weight: 700 },
];

// ══════════════════════════════════════════════════════════════════
// FONT LOADER
// ══════════════════════════════════════════════════════════════════

const loadedFonts = new Set();
async function loadGoogleFont(fontOption) {
  if (loadedFonts.has(fontOption.id)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontOption.googleFont}&display=swap`;
  document.head.appendChild(link);
  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 500));
  loadedFonts.add(fontOption.id);
}

// ══════════════════════════════════════════════════════════════════
// ZONE DEFAULTS — each zone has its own independent style + text
// ══════════════════════════════════════════════════════════════════

const DEFAULT_ZONE_STYLE = {
  fontId: 'Bangers',
  color: '#FFD700',
  strokeColor: '#000000',
  strokeWidthFactor: 0.07,
  shadowEnabled: true,
  shadowOffsetFactor: 0.06,
  sizeMultiplier: 1.0,
  tiltDeg: 0,
  lineGap: 0.005,        // gap between stacked words (fraction of canvas H)
  stackMode: true,       // true = each word on its own line; false = all words on one line
};

// ══════════════════════════════════════════════════════════════════
// LAYOUT TEMPLATES — zones define where text lives on canvas
// ══════════════════════════════════════════════════════════════════

const TEXT_TEMPLATES = {
  shock_side: {
    id: 'shock_side', name: 'Shock Side', preview: '💥',
    description: 'Big stacked words on left — classic YouTube',
    zones: [
      { id: 'z1', label: 'Main Text', startX: 0.04, startY: 0.06, columnWidth: 0.52, align: 'left', defaultText: '$2,000 HIDDEN SECRET' },
    ],
  },
  centered_stack: {
    id: 'centered_stack', name: 'Centered Stack', preview: '🎯',
    description: 'Words centered across full width',
    zones: [
      { id: 'z1', label: 'Main Text', startX: 0.50, startY: 0.06, columnWidth: 0.88, align: 'center', defaultText: "YOU WON'T BELIEVE THIS" },
    ],
  },
  top_banner: {
    id: 'top_banner', name: 'Top Banner', preview: '📌',
    description: 'Single wide line across the top',
    zones: [
      { id: 'z1', label: 'Top Line', startX: 0.50, startY: 0.08, columnWidth: 0.92, align: 'center', defaultText: 'WATCH THIS NOW' },
    ],
  },
  two_zone: {
    id: 'two_zone', name: 'Two Zone', preview: '📺',
    description: 'Left zone + right zone — fully independent',
    zones: [
      { id: 'z1', label: 'Left Zone', startX: 0.03, startY: 0.06, columnWidth: 0.46, align: 'left',  defaultText: '$47,382' },
      { id: 'z2', label: 'Right Zone', startX: 0.54, startY: 0.06, columnWidth: 0.43, align: 'left',  defaultText: 'IN 6 MONTHS' },
    ],
  },
  bottom_caption: {
    id: 'bottom_caption', name: 'Bottom Caption', preview: '💬',
    description: 'Text anchored to bottom left',
    zones: [
      { id: 'z1', label: 'Caption', startX: 0.04, startY: 0.58, columnWidth: 0.55, align: 'left', defaultText: 'THIS CHANGED EVERYTHING' },
    ],
  },
};

// ══════════════════════════════════════════════════════════════════
// SMOOTH TEXT RENDERER
// Renders text into an offscreen 4x canvas then draws it scaled
// down — this is the correct way to get smooth AA on canvas text
// ══════════════════════════════════════════════════════════════════

function renderSmoothText(ctx, word, drawX, drawY, fontSize, fontOption, zoneStyle) {
  const OVER = 4; // oversample factor
  const strokeW = Math.max(1, fontSize * zoneStyle.strokeWidthFactor);
  const pad = Math.ceil(strokeW * OVER * 2);

  // Measure at oversampled size
  const offCtx = document.createElement('canvas').getContext('2d');
  offCtx.font = `${fontOption.weight} ${fontSize * OVER}px ${fontOption.stack}`;
  const metrics = offCtx.measureText(word);
  const textW = Math.ceil(metrics.width);
  const textH = Math.ceil(fontSize * OVER * 1.4);

  const oc = offCtx.canvas;
  oc.width  = textW + pad * 2;
  oc.height = textH + pad * 2;

  offCtx.font = `${fontOption.weight} ${fontSize * OVER}px ${fontOption.stack}`;
  offCtx.textBaseline = 'middle';
  offCtx.textAlign = 'left';

  const tx = pad;
  const ty = oc.height / 2;

  // Shadow
  if (zoneStyle.shadowEnabled) {
    const sOff = Math.round(fontSize * OVER * zoneStyle.shadowOffsetFactor);
    offCtx.save();
    offCtx.shadowColor = 'rgba(0,0,0,0.9)';
    offCtx.shadowBlur = fontSize * OVER * 0.03;
    offCtx.shadowOffsetX = sOff;
    offCtx.shadowOffsetY = sOff;
    offCtx.fillStyle = '#000000';
    offCtx.globalAlpha = 0.8;
    offCtx.fillText(word, tx, ty);
    offCtx.restore();
  }

  // Stroke — single clean pass at full opacity (smooth because it's 4x)
  offCtx.lineJoin = 'round';
  offCtx.lineCap  = 'round';
  offCtx.miterLimit = 2;
  offCtx.strokeStyle = zoneStyle.strokeColor;
  offCtx.lineWidth = strokeW * OVER;
  offCtx.globalAlpha = 1.0;
  offCtx.strokeText(word, tx, ty);

  // Fill
  offCtx.fillStyle = zoneStyle.color;
  offCtx.fillText(word, tx, ty);

  // Blit downscaled onto main canvas — browser AA handles the rest
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const destW = oc.width  / OVER;
  const destH = oc.height / OVER;
  const destX = drawX - pad / OVER;
  const destY = drawY - destH / 2;

  ctx.drawImage(oc, destX, destY, destW, destH);
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════
// ZONE DRAW FUNCTION
// ══════════════════════════════════════════════════════════════════

function drawZone(ctx, zone, text, canvasW, canvasH, zoneStyle) {
  if (!text || !text.trim()) return;

  const fontOption = FONT_OPTIONS.find(f => f.id === zoneStyle.fontId) || FONT_OPTIONS[0];
  const colW    = canvasW * zone.columnWidth;
  const startX  = canvasW * zone.startX;
  const startY  = canvasH * zone.startY;
  const lineGap = canvasH * (zoneStyle.lineGap ?? 0.005);

  const isStacked = zoneStyle.stackMode !== false; // default true

  if (isStacked) {
    // ── STACKED: each word fills the column width ──
    const words = text.toUpperCase().trim().split(/\s+/);
    let currentY = startY;

    for (const word of words) {
      // Find font size that fills the column
      let fs = canvasH * 0.10 * zoneStyle.sizeMultiplier;
      const tmp = document.createElement('canvas').getContext('2d');
      tmp.font = `${fontOption.weight} ${fs}px ${fontOption.stack}`;
      const m = tmp.measureText(word).width;
      if (m > 0) fs = fs * (colW / m);

      const maxFs = canvasH * 0.30 * zoneStyle.sizeMultiplier;
      const minFs = canvasH * 0.05 * zoneStyle.sizeMultiplier;
      fs = Math.min(maxFs, Math.max(minFs, fs));

      let drawX = startX;
      if (zone.align === 'center') drawX = canvasW * zone.startX;
      else if (zone.align === 'right') drawX = startX + colW;

      const drawY = currentY + fs * 0.55;

      ctx.save();
      if (zoneStyle.tiltDeg !== 0) {
        ctx.translate(drawX, drawY);
        ctx.rotate((zoneStyle.tiltDeg * Math.PI) / 180);
        ctx.translate(-drawX, -drawY);
      }
      renderSmoothText(ctx, word, drawX, drawY, fs, fontOption, zoneStyle);
      ctx.restore();

      currentY += fs * 1.0 + lineGap;
    }
  } else {
    // ── INLINE: all words on one line, scale to fit column ──
    const line = text.toUpperCase().trim();

    let fs = canvasH * 0.10 * zoneStyle.sizeMultiplier;
    const tmp = document.createElement('canvas').getContext('2d');
    tmp.font = `${fontOption.weight} ${fs}px ${fontOption.stack}`;
    const m = tmp.measureText(line).width;
    if (m > 0) fs = fs * (colW / m);

    const maxFs = canvasH * 0.30 * zoneStyle.sizeMultiplier;
    const minFs = canvasH * 0.04 * zoneStyle.sizeMultiplier;
    fs = Math.min(maxFs, Math.max(minFs, fs));

    let drawX = startX;
    if (zone.align === 'center') drawX = canvasW * zone.startX;
    else if (zone.align === 'right') drawX = startX + colW;

    const drawY = startY + fs * 0.55;

    ctx.save();
    if (zoneStyle.tiltDeg !== 0) {
      ctx.translate(drawX, drawY);
      ctx.rotate((zoneStyle.tiltDeg * Math.PI) / 180);
      ctx.translate(-drawX, -drawY);
    }
    renderSmoothText(ctx, line, drawX, drawY, fs, fontOption, zoneStyle);
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════════════════

function SectionLabel({ icon, children }) {
  return <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">{icon} {children}</p>;
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

function Toggle({ value, onChange, label }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-600">{label}</span>
      <button onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-10 rounded-full transition-colors shrink-0 ${value ? 'bg-purple-500' : 'bg-gray-200'}`}>
        <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5 ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function FontSelector({ selectedFontId, onSelect }) {
  return (
    <div className="grid grid-cols-1 gap-1">
      {FONT_OPTIONS.map(f => (
        <button key={f.id} onClick={() => onSelect(f.id)}
          className={`flex items-center justify-between px-3 py-1.5 rounded-lg border-2 text-left transition-all ${selectedFontId === f.id ? 'border-purple-500 bg-purple-50' : 'border-gray-100 bg-gray-50 hover:border-purple-200'}`}>
          <div>
            <p className="text-sm font-bold text-gray-900" style={{ fontFamily: f.stack }}>{f.label}</p>
            <p className="text-[10px] text-gray-400">{f.description}</p>
          </div>
          {selectedFontId === f.id && <Check className="w-4 h-4 text-purple-600 shrink-0 ml-2" />}
        </button>
      ))}
    </div>
  );
}

function TemplateSelector({ selectedTemplate, onSelect }) {
  const [open, setOpen] = useState(false);
  const templates = Object.values(TEXT_TEMPLATES);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white border-2 border-gray-200 hover:border-purple-400 rounded-xl text-sm font-semibold transition-colors">
        <span className="flex items-center gap-2">
          <span className="text-lg">{TEXT_TEMPLATES[selectedTemplate]?.preview}</span>
          {TEXT_TEMPLATES[selectedTemplate]?.name}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-purple-200 rounded-xl shadow-2xl z-50 overflow-hidden">
          {templates.map(t => (
            <button key={t.id} onClick={() => { onSelect(t.id); setOpen(false); }}
              className={`w-full px-3 py-2.5 text-left flex items-center gap-3 hover:bg-purple-50 border-b last:border-b-0 ${selectedTemplate === t.id ? 'bg-purple-50' : ''}`}>
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
// ZONE EDITOR — one collapsible panel per zone
// ══════════════════════════════════════════════════════════════════

const COLOR_PRESETS = ['#FFD700','#FFFFFF','#00FF88','#00CFFF','#FF4444','#FF6B00','#FF00FF','#000000'];

function ZoneEditor({ zone, text, zoneStyle, onTextChange, onStyleChange }) {
  const [open, setOpen] = useState(true);
  const us = (k, v) => onStyleChange({ ...zoneStyle, [k]: v });

  return (
    <div className="border-2 border-gray-100 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
        <span className="text-sm font-bold text-gray-800">{zone.label}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="p-3 space-y-4 bg-white">

          {/* Text */}
          <div>
            <SectionLabel icon="✏️">Text</SectionLabel>
            <input type="text" value={text}
              onChange={e => onTextChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border-2 border-gray-200 focus:border-purple-400 rounded-lg font-bold bg-white outline-none uppercase"
              placeholder={zone.defaultText} />
          </div>

          {/* Stack vs Inline */}
          <div>
            <SectionLabel icon="📐">Layout Mode</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => us('stackMode', true)}
                className={`py-2 text-xs font-bold rounded-lg border-2 flex items-center justify-center gap-1.5 transition-all ${zoneStyle.stackMode !== false ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:border-purple-200'}`}>
                <span className="text-base leading-none">☰</span> Stacked
              </button>
              <button onClick={() => us('stackMode', false)}
                className={`py-2 text-xs font-bold rounded-lg border-2 flex items-center justify-center gap-1.5 transition-all ${zoneStyle.stackMode === false ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:border-purple-200'}`}>
                <Minus className="w-3.5 h-3.5" /> Inline
              </button>
            </div>
          </div>

          {/* Font */}
          <div>
            <SectionLabel icon="🔤">Font</SectionLabel>
            <FontSelector selectedFontId={zoneStyle.fontId} onSelect={id => us('fontId', id)} />
          </div>

          {/* Color */}
          <div>
            <SectionLabel icon="🎨">Text Color</SectionLabel>
            <div className="flex gap-1.5 flex-wrap items-center">
              {COLOR_PRESETS.map(c => (
                <button key={c} onClick={() => us('color', c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${zoneStyle.color === c ? 'border-purple-500 scale-110 shadow' : 'border-gray-300'}`}
                  style={{ backgroundColor: c }} />
              ))}
              <input type="color" value={zoneStyle.color} onChange={e => us('color', e.target.value)}
                className="w-7 h-7 rounded-lg cursor-pointer border-2 border-dashed border-gray-300" />
            </div>
          </div>

          {/* Outline */}
          <div>
            <SectionLabel icon="🖊️">Outline</SectionLabel>
            <div className="flex items-center gap-2 mb-2">
              <input type="color" value={zoneStyle.strokeColor} onChange={e => us('strokeColor', e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer border-2 border-gray-200" />
              <span className="text-xs text-gray-400">Color</span>
            </div>
            <SliderRow label="Thickness" value={zoneStyle.strokeWidthFactor}
              displayValue={`${Math.round(zoneStyle.strokeWidthFactor * 100)}%`}
              min={0} max={0.18} step={0.005} onChange={v => us('strokeWidthFactor', v)} />
          </div>

          {/* Shadow */}
          <div>
            <Toggle value={zoneStyle.shadowEnabled} onChange={v => us('shadowEnabled', v)} label="🌑 Drop Shadow" />
            {zoneStyle.shadowEnabled && (
              <div className="mt-2">
                <SliderRow label="Shadow offset" value={zoneStyle.shadowOffsetFactor}
                  displayValue={`${Math.round(zoneStyle.shadowOffsetFactor * 100)}%`}
                  min={0} max={0.12} step={0.005} onChange={v => us('shadowOffsetFactor', v)} />
              </div>
            )}
          </div>

          {/* Size */}
          <div>
            <div className="flex justify-between mb-1">
              <SectionLabel icon="📏">Size</SectionLabel>
              <span className="text-xs font-bold text-purple-600">{Math.round(zoneStyle.sizeMultiplier * 100)}%</span>
            </div>
            <div className="flex gap-1 mb-2">
              {[{v:0.6,l:'XS'},{v:0.8,l:'S'},{v:1.0,l:'M'},{v:1.25,l:'L'},{v:1.5,l:'XL'}].map(p => (
                <button key={p.v} onClick={() => us('sizeMultiplier', p.v)}
                  className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${Math.abs(zoneStyle.sizeMultiplier - p.v) < 0.05 ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-purple-100'}`}>
                  {p.l}
                </button>
              ))}
            </div>
            <input type="range" min="0.3" max="2.0" step="0.05" value={zoneStyle.sizeMultiplier}
              onChange={e => us('sizeMultiplier', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600" />
          </div>

          {/* Line Gap — only relevant in stacked mode */}
          {zoneStyle.stackMode !== false && (
            <div>
              <SliderRow label="↕️ Line gap (0 = tight)" value={zoneStyle.lineGap}
                displayValue={`${Math.round(zoneStyle.lineGap * 1000) / 10}%`}
                min={-0.02} max={0.06} step={0.001} onChange={v => us('lineGap', v)} />
            </div>
          )}

          {/* Tilt */}
          <div>
            <div className="flex justify-between mb-1">
              <SectionLabel icon="🔄">Tilt</SectionLabel>
              <span className="text-xs font-bold text-purple-600">{zoneStyle.tiltDeg > 0 ? '+' : ''}{zoneStyle.tiltDeg}°</span>
            </div>
            <div className="flex gap-1 mb-2">
              {[{l:'−8°',v:-8},{l:'−4°',v:-4},{l:'0°',v:0},{l:'+4°',v:4},{l:'+8°',v:8}].map(p => (
                <button key={p.v} onClick={() => us('tiltDeg', p.v)}
                  className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${zoneStyle.tiltDeg === p.v ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-purple-100'}`}>
                  {p.l}
                </button>
              ))}
            </div>
            <input type="range" min="-15" max="15" step="1" value={zoneStyle.tiltDeg}
              onChange={e => us('tiltDeg', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600" />
            {zoneStyle.tiltDeg !== 0 && (
              <button onClick={() => us('tiltDeg', 0)} className="mt-1 text-xs text-gray-400 hover:text-purple-600 flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>

        </div>
      )}
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

  const [isEditing, setIsEditing]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError]           = useState(null);

  const [templateId, setTemplateId] = useState('shock_side');

  // Per-zone state: { [zoneId]: { text, style } }
  const [zoneData, setZoneData] = useState({});

  const currentTemplate = TEXT_TEMPLATES[templateId] || TEXT_TEMPLATES.shock_side;

  // ── Load saved config ──────────────────────────────────────────
  const savedConfig = React.useMemo(() => {
    try { return JSON.parse(concept.text_style || '{}'); } catch (_) { return {}; }
  }, [concept.text_style]);

  useEffect(() => {
    const tplId = savedConfig.templateId || 'shock_side';
    const template = TEXT_TEMPLATES[tplId] || TEXT_TEMPLATES.shock_side;
    setTemplateId(tplId);

    const data = {};
    template.zones.forEach(zone => {
      data[zone.id] = {
        text:  savedConfig.zoneData?.[zone.id]?.text  ?? concept.text_overlay ?? zone.defaultText ?? '',
        style: { ...DEFAULT_ZONE_STYLE, ...(savedConfig.zoneData?.[zone.id]?.style || {}) },
      };
    });
    setZoneData(data);
  }, [savedConfig, concept.text_overlay]);

  // ── Render canvas ──────────────────────────────────────────────
  const renderCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;

    // Preload all fonts used across zones
    const fontIds = [...new Set(Object.values(zoneData).map(z => z.style?.fontId || 'Bangers'))];
    await Promise.all(fontIds.map(id => {
      const fo = FONT_OPTIONS.find(f => f.id === id) || FONT_OPTIONS[0];
      return loadGoogleFont(fo);
    }));

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const isShorts = concept.image_prompt?.includes('9:16') || img.height > img.width * 1.3;
      const W = isShorts ? 1080 : 1920;
      const H = isShorts ? 1920 : 1080;
      canvas.width  = W;
      canvas.height = H;

      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);

      currentTemplate.zones.forEach(zone => {
        const zd = zoneData[zone.id];
        if (!zd?.text?.trim()) return;
        drawZone(ctx, zone, zd.text, W, H, zd.style || DEFAULT_ZONE_STYLE);
      });

      setImageLoaded(true);
      setError(null);
    };

    img.onerror = () => { setError('Failed to load image'); setImageLoaded(false); };
    img.src = imageUrl;
  }, [imageUrl, currentTemplate, zoneData, concept.image_prompt]);

  useEffect(() => { renderCanvas(); }, [renderCanvas]);

  // ── Template change ────────────────────────────────────────────
  const handleTemplateChange = (newId) => {
    const template = TEXT_TEMPLATES[newId] || TEXT_TEMPLATES.shock_side;
    setTemplateId(newId);
    const data = {};
    template.zones.forEach(zone => {
      data[zone.id] = {
        text:  zoneData[zone.id]?.text ?? zone.defaultText ?? '',
        style: { ...DEFAULT_ZONE_STYLE, ...(zoneData[zone.id]?.style || {}) },
      };
    });
    setZoneData(data);
  };

  // ── Zone update helpers ────────────────────────────────────────
  const updateZoneText  = (zoneId, text)  => setZoneData(prev => ({ ...prev, [zoneId]: { ...prev[zoneId], text } }));
  const updateZoneStyle = (zoneId, style) => setZoneData(prev => ({ ...prev, [zoneId]: { ...prev[zoneId], style } }));

  // ── Save ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!onTextChange) return;
    setSaving(true);
    setError(null);
    try {
      await onTextChange({
        templateId,
        zoneData,
        primary_text: zoneData[currentTemplate.zones[0]?.id]?.text || '',
      });
      setIsEditing(false);
    } catch (e) {
      setError('Failed to save: ' + (e.message || 'Unknown'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    const tplId = savedConfig.templateId || 'shock_side';
    const template = TEXT_TEMPLATES[tplId] || TEXT_TEMPLATES.shock_side;
    setTemplateId(tplId);
    const data = {};
    template.zones.forEach(zone => {
      data[zone.id] = {
        text:  savedConfig.zoneData?.[zone.id]?.text  ?? zone.defaultText ?? '',
        style: { ...DEFAULT_ZONE_STYLE, ...(savedConfig.zoneData?.[zone.id]?.style || {}) },
      };
    });
    setZoneData(data);
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

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className={`relative ${className}`}>
      {/* Canvas */}
      <div className="relative rounded-lg overflow-hidden bg-gray-900">
        <canvas ref={canvasRef} className="w-full h-auto block"
          style={{ aspectRatio: concept.image_prompt?.includes('9:16') ? '9/16' : '16/9' }} />

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
            </span>
          </div>
        )}
      </div>

      {/* Edit Panel */}
      {isEditing && (
        <div className="mt-3 p-4 bg-white rounded-xl border-2 border-purple-100 shadow-xl space-y-4 max-h-[85vh] overflow-y-auto">

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {/* Template */}
          <div>
            <SectionLabel icon="📐">Layout Template</SectionLabel>
            <TemplateSelector selectedTemplate={templateId} onSelect={handleTemplateChange} />
          </div>

          {/* One ZoneEditor per zone */}
          <div className="space-y-3">
            <SectionLabel icon="🗂️">Text Zones {currentTemplate.zones.length > 1 && `(${currentTemplate.zones.length} independent)`}</SectionLabel>
            {currentTemplate.zones.map(zone => (
              <ZoneEditor
                key={zone.id}
                zone={zone}
                text={zoneData[zone.id]?.text ?? zone.defaultText ?? ''}
                zoneStyle={zoneData[zone.id]?.style ?? { ...DEFAULT_ZONE_STYLE }}
                onTextChange={text => updateZoneText(zone.id, text)}
                onStyleChange={style => updateZoneStyle(zone.id, style)}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t sticky bottom-0 bg-white pb-1">
            <Button size="sm" variant="outline" className="flex-1 h-10" onClick={handleCancel} disabled={saving}>
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
            <Button size="sm" className="flex-1 h-10 bg-purple-600 hover:bg-purple-700" onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-1.5" /> Save Changes</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// BATCH DOWNLOAD
// ══════════════════════════════════════════════════════════════════

export async function downloadAllThumbnails(concepts, prefix = 'thumbnail') {
  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];
    if (!concept.image_url) continue;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const isShorts = concept.image_prompt?.includes('9:16');
    const W = isShorts ? 1080 : 1920;
    const H = isShorts ? 1920 : 1080;
    canvas.width = W;
    canvas.height = H;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      img.onload = async () => {
        ctx.drawImage(img, 0, 0, W, H);

        let config = {};
        try { config = JSON.parse(concept.text_style || '{}'); } catch (_) {}

        const templateId = config.templateId || 'shock_side';
        const template   = TEXT_TEMPLATES[templateId] || TEXT_TEMPLATES.shock_side;

        const fontIds = [...new Set(
          template.zones.map(z => config.zoneData?.[z.id]?.style?.fontId || 'Bangers')
        )];
        await Promise.all(fontIds.map(id => {
          const fo = FONT_OPTIONS.find(f => f.id === id) || FONT_OPTIONS[0];
          return loadGoogleFont(fo);
        }));

        template.zones.forEach(zone => {
          const zd = config.zoneData?.[zone.id];
          const text  = zd?.text  || concept.text_overlay || zone.defaultText || '';
          const style = { ...DEFAULT_ZONE_STYLE, ...(zd?.style || {}) };
          drawZone(ctx, zone, text, W, H, style);
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