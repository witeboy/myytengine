import React, { useMemo } from 'react';

// ══════════════════════════════════════════════════════════════════
// CAPTION OVERLAY — Renders captions over the preview panel
// ══════════════════════════════════════════════════════════════════
//
// Takes word-level timestamps (caption_data) and current playhead
// time, groups words into display lines (max N words), and renders
// with the selected caption style.
//
// Supports:
//   - word_highlight: active word gets highlight color
//   - pop: active word scales up
//   - fade: line fades in/out
//   - karaoke: words light up left-to-right
//   - none: static display
// ══════════════════════════════════════════════════════════════════

export default function CaptionOverlay({
  captionData = [],      // [{word, start, end, scene_number}, ...]
  currentTime = 0,       // playhead position in seconds
  style = {},            // caption_* fields from ProductionSettings
  containerWidth = 640,
  containerHeight = 360,
}) {
  const {
    caption_enabled = true,
    caption_style_preset = 'hormozi',
    caption_font_size = 64,
    caption_text_color = '#FFFFFF',
    caption_highlight_color = '#00FF88',
    caption_bg_color = 'transparent',
    caption_stroke_width = 4,
    caption_position = 'center',
    caption_animation = 'word_highlight',
    caption_max_words = 3,
  } = style;

  // Group caption words into display lines
  const lines = useMemo(() => {
    if (!captionData || captionData.length === 0 || !caption_enabled) return [];

    const maxWords = caption_max_words || 4;
    const grouped = [];

    for (let i = 0; i < captionData.length; i += maxWords) {
      const lineWords = captionData.slice(i, i + maxWords);
      if (lineWords.length === 0) continue;

      grouped.push({
        words: lineWords,
        start: lineWords[0].start,
        end: lineWords[lineWords.length - 1].end,
        text: lineWords.map(w => w.word).join(' '),
      });
    }

    return grouped;
  }, [captionData, caption_max_words, caption_enabled]);

  if (!caption_enabled || caption_style_preset === 'none' || lines.length === 0) {
    return null;
  }

  // Find current active line
  const activeLine = lines.find(l => currentTime >= l.start && currentTime <= l.end);
  if (!activeLine) return null;

  // Calculate responsive font size (scale to container)
  const scaleFactor = containerWidth / 1920; // base on 1080p
  const fontSize = Math.max(12, Math.round(caption_font_size * scaleFactor));

  // Position
  const positionStyle = {};
  if (caption_position === 'top') {
    positionStyle.top = '8%';
  } else if (caption_position === 'center') {
    positionStyle.top = '50%';
    positionStyle.transform = 'translateY(-50%)';
  } else {
    positionStyle.bottom = '10%';
  }

  // Text stroke
  const strokePx = Math.max(1, Math.round(caption_stroke_width * scaleFactor));
  const textShadow = caption_stroke_width > 0
    ? `
      ${strokePx}px ${strokePx}px 0 #000,
      -${strokePx}px ${strokePx}px 0 #000,
      ${strokePx}px -${strokePx}px 0 #000,
      -${strokePx}px -${strokePx}px 0 #000,
      0 ${strokePx * 2}px ${strokePx * 3}px rgba(0,0,0,0.5)
    `
    : '0 2px 8px rgba(0,0,0,0.8)';

  // Animation state for the whole line
  const lineProgress = (currentTime - activeLine.start) / (activeLine.end - activeLine.start);
  const fadeOpacity = caption_animation === 'fade'
    ? (lineProgress < 0.1 ? lineProgress / 0.1 : lineProgress > 0.9 ? (1 - lineProgress) / 0.1 : 1)
    : 1;

  return (
    <div
      className="absolute left-0 right-0 pointer-events-none z-30 flex justify-center px-4"
      style={{
        ...positionStyle,
        opacity: fadeOpacity,
        transition: 'opacity 0.15s ease',
      }}
    >
      {/* Background bar (for netflix style) */}
      {caption_bg_color !== 'transparent' && (
        <div
          className="absolute inset-0 -mx-2 -my-1 rounded"
          style={{ backgroundColor: caption_bg_color }}
        />
      )}

      {/* Words */}
      <div className="relative flex flex-wrap justify-center gap-x-1" style={{ maxWidth: '90%' }}>
        {activeLine.words.map((wordData, i) => {
          const isWordActive = currentTime >= wordData.start && currentTime <= wordData.end;
          const wordPassed = currentTime > wordData.end;

          let wordColor = caption_text_color;
          let wordScale = 1;
          let wordTransition = 'all 0.1s ease';

          switch (caption_animation) {
            case 'word_highlight':
              if (isWordActive) {
                wordColor = caption_highlight_color;
                wordScale = 1.05;
              }
              break;

            case 'karaoke':
              if (isWordActive || wordPassed) {
                wordColor = caption_highlight_color;
              }
              break;

            case 'pop':
              if (isWordActive) {
                wordScale = 1.15;
                wordColor = caption_highlight_color;
              }
              wordTransition = 'all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)';
              break;

            case 'fade':
            case 'none':
            default:
              // No per-word animation
              break;
          }

          return (
            <span
              key={`${wordData.start}-${i}`}
              style={{
                color: wordColor,
                fontSize: `${fontSize}px`,
                fontWeight: caption_font_size > 40 ? '800' : '700',
                fontFamily: "'Inter', 'Montserrat', 'Arial Black', sans-serif",
                textShadow,
                transform: `scale(${wordScale})`,
                transition: wordTransition,
                display: 'inline-block',
                textTransform: caption_font_size > 50 ? 'uppercase' : 'none',
                letterSpacing: caption_font_size > 50 ? '0.02em' : 'normal',
              }}
            >
              {wordData.word}
            </span>
          );
        })}
      </div>
    </div>
  );
}
