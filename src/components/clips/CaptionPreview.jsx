import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Type, Palette } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// CAPTION PRESETS — 6 trending styles for short-form video
// ══════════════════════════════════════════════════════════════════
export const CAPTION_PRESETS = {
  hormozi_bold: {
    name: 'Hormozi Bold',
    fontFamily: 'Impact, Arial Black, sans-serif',
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    highlightColor: '#FFD700',
    strokeColor: '#000000',
    strokeWidth: 4,
    textTransform: 'uppercase',
    position: 'center',      // center of frame
    bgEnabled: false,
    wordsPerLine: 3,
    animation: 'slam',
    preview: 'WHITE + GOLD highlights, Impact font, centered',
  },
  mrbeast_pop: {
    name: 'MrBeast Pop',
    fontFamily: '"Arial Black", "Helvetica Neue", sans-serif',
    fontSize: 44,
    fontWeight: '900',
    color: '#FFFFFF',
    highlightColor: '#FF3B30',
    strokeColor: '#000000',
    strokeWidth: 5,
    textTransform: 'uppercase',
    position: 'center',
    bgEnabled: false,
    wordsPerLine: 3,
    animation: 'bounce',
    preview: 'WHITE + RED pop, big stroke, bouncy',
  },
  minimal_clean: {
    name: 'Minimal Clean',
    fontFamily: '"SF Pro Display", "Helvetica Neue", system-ui, sans-serif',
    fontSize: 32,
    fontWeight: '600',
    color: '#FFFFFF',
    highlightColor: '#FFFFFF',
    strokeColor: 'transparent',
    strokeWidth: 0,
    textTransform: 'none',
    position: 'bottom',
    bgEnabled: true,
    bgColor: 'rgba(0,0,0,0.6)',
    bgPadding: 8,
    bgRadius: 6,
    wordsPerLine: 5,
    animation: 'fade',
    preview: 'Clean white on dark pill, subtle fade',
  },
  karaoke_glow: {
    name: 'Karaoke Glow',
    fontFamily: '"Arial Rounded MT Bold", "Arial Black", sans-serif',
    fontSize: 40,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.4)',
    highlightColor: '#00FF88',
    strokeColor: '#000000',
    strokeWidth: 3,
    textTransform: 'none',
    position: 'bottom_third',
    bgEnabled: false,
    wordsPerLine: 4,
    animation: 'fill',       // words fill with color as spoken
    preview: 'Dim → GLOW GREEN as words are spoken',
  },
  ali_abdaal: {
    name: 'Ali Abdaal',
    fontFamily: '"Georgia", "Times New Roman", serif',
    fontSize: 30,
    fontWeight: '700',
    color: '#1A1A1A',
    highlightColor: '#FF6B35',
    strokeColor: 'transparent',
    strokeWidth: 0,
    textTransform: 'none',
    position: 'bottom',
    bgEnabled: true,
    bgColor: 'rgba(255,255,255,0.92)',
    bgPadding: 12,
    bgRadius: 8,
    wordsPerLine: 6,
    animation: 'typewriter',
    preview: 'Dark text on white card, orange highlights',
  },
  subtitle_classic: {
    name: 'Subtitle Classic',
    fontFamily: '"Arial", "Helvetica", sans-serif',
    fontSize: 28,
    fontWeight: '500',
    color: '#FFFFFF',
    highlightColor: '#FFD700',
    strokeColor: '#000000',
    strokeWidth: 2,
    textTransform: 'none',
    position: 'bottom_safe',
    bgEnabled: true,
    bgColor: 'rgba(0,0,0,0.75)',
    bgPadding: 6,
    bgRadius: 4,
    wordsPerLine: 7,
    animation: 'fade',
    preview: 'Traditional subtitle bar, gold keywords',
  },
};

/**
 * Get the words currently active at a given playback time
 */
function getActiveWords(words, currentTime, preset) {
  if (!words?.length) return { lines: [], activeIndex: -1 };

  // Find the current word index
  let activeIndex = -1;
  for (let i = 0; i < words.length; i++) {
    if (currentTime >= words[i].start && currentTime <= words[i].end + 0.15) {
      activeIndex = i;
    }
  }

  if (activeIndex === -1) {
    // Between words — find the closest upcoming word
    for (let i = 0; i < words.length; i++) {
      if (words[i].start > currentTime) {
        activeIndex = Math.max(0, i - 1);
        break;
      }
    }
  }

  // Group words into lines
  const wpl = preset.wordsPerLine || 4;
  const lineIndex = Math.floor(Math.max(0, activeIndex) / wpl);
  const lineStart = lineIndex * wpl;
  const lineEnd = Math.min(lineStart + wpl, words.length);
  const lineWords = words.slice(lineStart, lineEnd);

  return { lineWords, activeIndex: activeIndex - lineStart, globalActiveIndex: activeIndex };
}

/**
 * Draw captions onto a canvas context
 */
export function drawCaptions(ctx, canvasWidth, canvasHeight, words, currentTime, presetKey, highlightWords = []) {
  const preset = CAPTION_PRESETS[presetKey] || CAPTION_PRESETS.hormozi_bold;
  const { lineWords, activeIndex } = getActiveWords(words, currentTime, preset);

  if (!lineWords.length) return;

  const scale = canvasWidth / 1080; // Scale relative to 1080p
  const fontSize = preset.fontSize * scale;
  const strokeWidth = preset.strokeWidth * scale;
  const padding = (preset.bgPadding || 0) * scale;
  const radius = (preset.bgRadius || 0) * scale;

  ctx.save();

  // Position
  let y;
  if (preset.position === 'center') y = canvasHeight * 0.5;
  else if (preset.position === 'bottom_third') y = canvasHeight * 0.7;
  else if (preset.position === 'bottom_safe') y = canvasHeight * 0.88;
  else y = canvasHeight * 0.82; // bottom default

  // Build the full line text
  ctx.font = `${preset.fontWeight} ${fontSize}px ${preset.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const fullText = lineWords.map(w =>
    preset.textTransform === 'uppercase' ? w.word.toUpperCase() : w.word
  ).join(' ');

  const textMetrics = ctx.measureText(fullText);
  const textWidth = textMetrics.width;

  // Background pill
  if (preset.bgEnabled) {
    const bgX = (canvasWidth - textWidth) / 2 - padding * 2;
    const bgY = y - fontSize / 2 - padding;
    const bgW = textWidth + padding * 4;
    const bgH = fontSize + padding * 2;

    ctx.fillStyle = preset.bgColor || 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(bgX, bgY, bgW, bgH, radius);
    ctx.fill();
  }

  // Draw each word individually for highlighting
  let xOffset = (canvasWidth - textWidth) / 2;

  lineWords.forEach((w, i) => {
    const wordText = preset.textTransform === 'uppercase' ? w.word.toUpperCase() : w.word;
    const wordWidth = ctx.measureText(wordText + ' ').width;
    const isActive = i === activeIndex;
    const isHighlight = highlightWords.some(hw =>
      w.word.toLowerCase().includes(hw.toLowerCase())
    );

    // Stroke
    if (strokeWidth > 0) {
      ctx.strokeStyle = preset.strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(wordText, xOffset + wordWidth / 2 - ctx.measureText(' ').width / 2, y);
    }

    // Fill — active word gets highlight color
    if (isActive || isHighlight) {
      ctx.fillStyle = preset.highlightColor;

      // Scale animation for active word
      if (isActive && (preset.animation === 'bounce' || preset.animation === 'slam')) {
        ctx.save();
        ctx.translate(xOffset + wordWidth / 2 - ctx.measureText(' ').width / 2, y);
        ctx.scale(1.15, 1.15);
        ctx.translate(-(xOffset + wordWidth / 2 - ctx.measureText(' ').width / 2), -y);
      }
    } else {
      ctx.fillStyle = preset.color;
    }

    ctx.fillText(wordText, xOffset + wordWidth / 2 - ctx.measureText(' ').width / 2, y);

    if ((isActive || isHighlight) && (preset.animation === 'bounce' || preset.animation === 'slam')) {
      ctx.restore();
    }

    xOffset += wordWidth;
  });

  ctx.restore();
}

/**
 * CaptionPreview — Component that renders caption style picker
 */
export default function CaptionPreview({ selectedPreset, onSelectPreset, sampleText = 'This is what your captions will look like' }) {
  const canvasRef = useRef(null);
  const [hoveredPreset, setHoveredPreset] = useState(null);

  const drawPreview = useCallback((presetKey) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Dark background for preview
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);

    // Fake words from sample text
    const words = sampleText.split(' ').map((word, i) => ({
      word,
      start: i * 0.4,
      end: i * 0.4 + 0.35,
    }));

    const activeTime = 1.2; // Show 3rd-4th word highlighted
    drawCaptions(ctx, w, h, words, activeTime, presetKey, ['captions', 'look']);
  }, [sampleText]);

  useEffect(() => {
    drawPreview(hoveredPreset || selectedPreset || 'hormozi_bold');
  }, [hoveredPreset, selectedPreset, drawPreview]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Type className="w-3.5 h-3.5" />
        <span className="font-medium">Caption style</span>
      </div>

      {/* Preview canvas */}
      <canvas
        ref={canvasRef}
        width={540}
        height={180}
        className="w-full rounded-lg border border-gray-200"
        style={{ imageRendering: 'auto' }}
      />

      {/* Preset buttons */}
      <div className="grid grid-cols-3 gap-2">
        {Object.entries(CAPTION_PRESETS).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => onSelectPreset(key)}
            onMouseEnter={() => setHoveredPreset(key)}
            onMouseLeave={() => setHoveredPreset(null)}
            className={`text-left p-2 rounded-lg border transition-all text-xs ${
              selectedPreset === key
                ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className="font-medium text-gray-900">{preset.name}</div>
            <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{preset.preview}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
