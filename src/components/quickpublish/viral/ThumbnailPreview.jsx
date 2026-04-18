// Live-rendered thumbnail preview with high-CTR text overlay.
// Uses absolute-positioned DOM layers (captured later via html2canvas for download).

import React, { forwardRef } from 'react';

export const STYLE_PRESETS = {
  yellow_bold: {
    label: 'Yellow Bold',
    color: '#FFD400',
    stroke: '#000000',
    strokeWidth: 8,
    shadow: '0 6px 0 rgba(0,0,0,0.85), 0 10px 20px rgba(0,0,0,0.55)',
    font: '"Oswald", "Anton", "Impact", sans-serif',
    italic: true,
    letterSpacing: '0.01em',
    lineHeight: 0.88,
  },
  white_quote: {
    label: 'White Quote',
    color: '#FFFFFF',
    stroke: '#000000',
    strokeWidth: 7,
    shadow: '0 4px 0 rgba(0,0,0,0.9), 0 14px 24px rgba(0,0,0,0.6)',
    font: '"Oswald", "Anton", "Impact", sans-serif',
    italic: false,
    letterSpacing: '0.01em',
    lineHeight: 0.9,
  },
  red_alert: {
    label: 'Red Alert',
    color: '#FF2E2E',
    stroke: '#FFFFFF',
    strokeWidth: 6,
    shadow: '0 0 18px rgba(255,60,60,0.85), 0 4px 0 rgba(0,0,0,0.9)',
    font: '"Oswald", "Anton", "Impact", sans-serif',
    italic: false,
    letterSpacing: '0.02em',
    lineHeight: 0.9,
  },
  nollywood: {
    label: 'Nollywood',
    color: '#FFD400',
    stroke: '#0A4D10',
    strokeWidth: 8,
    shadow: '0 4px 0 #000, 0 10px 20px rgba(0,0,0,0.6)',
    font: '"Oswald", "Anton", "Impact", sans-serif',
    italic: false,
    letterSpacing: '0.01em',
    lineHeight: 0.88,
  },
};

export const POSITIONS = {
  bottom_center: { bottom: '6%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', width: '92%' },
  bottom_left:   { bottom: '6%', left: '4%', textAlign: 'left', width: '60%' },
  top_left:      { top: '5%', left: '4%', textAlign: 'left', width: '60%' },
  top_center:    { top: '5%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', width: '92%' },
  left_stack:    { top: '50%', left: '4%', transform: 'translateY(-50%)', textAlign: 'left', width: '55%' },
  right_stack:   { top: '50%', right: '4%', transform: 'translateY(-50%)', textAlign: 'right', width: '55%' },
};

/** Renders a 16:9 thumbnail preview with bg image + overlay text */
const ThumbnailPreview = forwardRef(function ThumbnailPreview(
  { backgroundUrl, text, preset = 'yellow_bold', position = 'bottom_center', fontSize = 11, tilt = 0, accentWord = '', accentColor = '#FFFFFF' },
  ref
) {
  const style = STYLE_PRESETS[preset] || STYLE_PRESETS.yellow_bold;
  const posStyle = POSITIONS[position] || POSITIONS.bottom_center;

  const strokeStyle = {
    WebkitTextStroke: `${style.strokeWidth}px ${style.stroke}`,
    paintOrder: 'stroke fill',
    textShadow: style.shadow,
  };

  // Split into lines: if 3-5 words, put half on each line
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  let lines = [];
  if (words.length <= 2) lines = [words.join(' ')];
  else if (words.length === 3) lines = [words.slice(0, 2).join(' '), words[2]];
  else {
    const mid = Math.ceil(words.length / 2);
    lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }

  // Render each word so we can recolor the accent word
  const renderLine = (line) => line.split(/\s+/).map((w, i) => {
    const clean = w.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const isAccent = accentWord && clean === accentWord.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return (
      <span key={i} style={{ color: isAccent ? accentColor : style.color, whiteSpace: 'pre' }}>
        {i > 0 ? ' ' : ''}{w}
      </span>
    );
  });

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden bg-black"
      style={{ aspectRatio: '16/9' }}
    >
      {backgroundUrl ? (
        <img
          src={backgroundUrl}
          alt=""
          crossOrigin="anonymous"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
          Background preview
        </div>
      )}

      {/* Subtle bottom vignette for text legibility */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.35) 100%)' }}
      />

      {/* Overlay text */}
      {text && (
        <div
          className="absolute font-black select-none pointer-events-none"
          style={{
            ...posStyle,
            ...strokeStyle,
            color: style.color,
            fontFamily: style.font,
            fontStyle: style.italic ? 'italic' : 'normal',
            fontSize: `${fontSize}cqw`, // responsive to container width
            lineHeight: style.lineHeight,
            letterSpacing: style.letterSpacing,
            containerType: 'inline-size',
          }}
        >
          <div style={{ transform: `rotate(${tilt}deg)`, transformOrigin: 'center', containerType: 'inline-size' }}>
            {lines.map((line, i) => (
              <div key={i} style={{ whiteSpace: 'nowrap' }}>{renderLine(line)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default ThumbnailPreview;