import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Subtitles, Check, Loader2 } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// CAPTION STYLE PICKER — Select and preview caption styles
// ══════════════════════════════════════════════════════════════════
//
// 6 preset styles:
//   🎬 YouTube Classic — white text, black outline, bottom
//   🔥 MrBeast — yellow bold, word highlight, center
//   📱 TikTok — white bold, pop animation, center
//   🎯 Hormozi — 2-3 words, BIG bold, center
//   📺 Netflix — white on dark bar, bottom
//   🚫 None — no captions
//
// Saves to ProductionSettings.caption_* fields.
// ══════════════════════════════════════════════════════════════════

const PRESETS = {
  youtube_classic: {
    label: 'YouTube Classic',
    icon: '🎬',
    description: 'White text, black outline, bottom',
    caption_font_size: 36,
    caption_text_color: '#FFFFFF',
    caption_highlight_color: '#FFFFFF',
    caption_bg_color: 'transparent',
    caption_stroke_width: 3,
    caption_position: 'bottom',
    caption_animation: 'none',
    caption_max_words: 8,
  },
  mrbeast: {
    label: 'MrBeast',
    icon: '🔥',
    description: 'Yellow bold, word-by-word highlight',
    caption_font_size: 52,
    caption_text_color: '#FFFFFF',
    caption_highlight_color: '#FFD700',
    caption_bg_color: 'transparent',
    caption_stroke_width: 3,
    caption_position: 'center',
    caption_animation: 'word_highlight',
    caption_max_words: 4,
  },
  tiktok: {
    label: 'TikTok',
    icon: '📱',
    description: 'White bold, pop animation, center',
    caption_font_size: 44,
    caption_text_color: '#FFFFFF',
    caption_highlight_color: '#FF4757',
    caption_bg_color: 'transparent',
    caption_stroke_width: 2,
    caption_position: 'center',
    caption_animation: 'pop',
    caption_max_words: 5,
  },
  hormozi: {
    label: 'Hormozi',
    icon: '🎯',
    description: '2-3 words, BIG bold, center highlight',
    caption_font_size: 64,
    caption_text_color: '#FFFFFF',
    caption_highlight_color: '#00FF88',
    caption_bg_color: 'transparent',
    caption_stroke_width: 4,
    caption_position: 'center',
    caption_animation: 'word_highlight',
    caption_max_words: 3,
  },
  netflix: {
    label: 'Netflix',
    icon: '📺',
    description: 'White on dark bar, bottom',
    caption_font_size: 32,
    caption_text_color: '#FFFFFF',
    caption_highlight_color: '#FFFFFF',
    caption_bg_color: 'rgba(0,0,0,0.75)',
    caption_stroke_width: 0,
    caption_position: 'bottom',
    caption_animation: 'fade',
    caption_max_words: 10,
  },
  none: {
    label: 'No Captions',
    icon: '🚫',
    description: 'Clean video, no text overlay',
    caption_font_size: 0,
    caption_text_color: '#FFFFFF',
    caption_highlight_color: '#FFFFFF',
    caption_bg_color: 'transparent',
    caption_stroke_width: 0,
    caption_position: 'bottom',
    caption_animation: 'none',
    caption_max_words: 0,
  },
};

// Sample text for preview
const SAMPLE_WORDS = [
  { word: 'This', active: false },
  { word: 'is', active: false },
  { word: 'how', active: true },
  { word: 'your', active: true },
  { word: 'captions', active: false },
  { word: 'will', active: false },
  { word: 'look', active: false },
];

export default function CaptionStylePicker({ productionSettingsId, currentPreset = 'hormozi', onStyleChange }) {
  const [selected, setSelected] = useState(currentPreset);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSelect = async (presetKey) => {
    setSelected(presetKey);
    setSaving(true);
    setSaved(false);

    const preset = PRESETS[presetKey];
    const payload = {
      caption_enabled: presetKey !== 'none',
      caption_style_preset: presetKey,
      caption_font_size: preset.caption_font_size,
      caption_text_color: preset.caption_text_color,
      caption_highlight_color: preset.caption_highlight_color,
      caption_bg_color: preset.caption_bg_color,
      caption_stroke_width: preset.caption_stroke_width,
      caption_position: preset.caption_position,
      caption_animation: preset.caption_animation,
      caption_max_words: preset.caption_max_words,
    };

    try {
      if (productionSettingsId) {
        await base44.entities.ProductionSettings.update(productionSettingsId, payload);
      }
      setSaved(true);
      onStyleChange?.(presetKey, payload);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save caption style:', err);
    }

    setSaving(false);
  };

  const renderPreview = (presetKey) => {
    const preset = PRESETS[presetKey];
    if (presetKey === 'none') return null;

    const maxWords = preset.caption_max_words || 5;
    const visibleWords = SAMPLE_WORDS.slice(0, Math.min(maxWords, SAMPLE_WORDS.length));

    const positionClass = preset.caption_position === 'top'
      ? 'top-2'
      : preset.caption_position === 'center'
      ? 'top-1/2 -translate-y-1/2'
      : 'bottom-2';

    return (
      <div className="relative w-full h-16 bg-gray-800 rounded overflow-hidden">
        {/* Fake video background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900" />

        {/* Caption text */}
        <div className={`absolute left-0 right-0 ${positionClass} text-center px-2`}>
          {preset.caption_bg_color !== 'transparent' && (
            <span
              className="inline-block px-2 py-0.5 rounded"
              style={{ backgroundColor: preset.caption_bg_color }}
            />
          )}
          <div className="inline-flex gap-0.5 flex-wrap justify-center">
            {visibleWords.map((w, i) => (
              <span
                key={i}
                className="transition-all"
                style={{
                  color: (preset.caption_animation === 'word_highlight' && w.active)
                    ? preset.caption_highlight_color
                    : preset.caption_text_color,
                  fontSize: `${Math.min(preset.caption_font_size / 4, 16)}px`,
                  fontWeight: preset.caption_font_size > 40 ? '800' : '600',
                  textShadow: preset.caption_stroke_width > 0
                    ? `0 0 ${preset.caption_stroke_width}px #000, 0 0 ${preset.caption_stroke_width * 2}px #000`
                    : 'none',
                  ...(preset.caption_bg_color !== 'transparent' ? {
                    backgroundColor: preset.caption_bg_color,
                    padding: '1px 3px',
                    borderRadius: '2px',
                  } : {}),
                  ...(preset.caption_animation === 'pop' && w.active ? {
                    transform: 'scale(1.2)',
                  } : {}),
                }}
              >
                {w.word}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Subtitles className="w-4 h-4 text-purple-400" />
        <h3 className="text-sm font-semibold text-gray-200">Caption Style</h3>
        {saving && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
        {saved && <Check className="w-3 h-3 text-emerald-400" />}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(PRESETS).map(([key, preset]) => {
          const isSelected = selected === key;

          return (
            <button
              key={key}
              className={`relative rounded-lg border-2 p-2 text-left transition-all ${
                isSelected
                  ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30'
                  : 'border-gray-700 bg-gray-850 hover:border-gray-600 hover:bg-gray-800'
              }`}
              onClick={() => handleSelect(key)}
            >
              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}

              {/* Label */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-sm">{preset.icon}</span>
                <span className={`text-[11px] font-semibold ${isSelected ? 'text-purple-300' : 'text-gray-300'}`}>
                  {preset.label}
                </span>
              </div>

              {/* Description */}
              <p className="text-[9px] text-gray-500 mb-2">{preset.description}</p>

              {/* Preview */}
              {renderPreview(key)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
