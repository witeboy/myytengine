/**
 * CaptionStylePresets — Animation presets + typography themes for captions.
 * Applies to ALL caption clips simultaneously.
 */
import React, { useState } from 'react';
import { CheckCircle, Sparkles, Type } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// ANIMATION PRESETS — stored as `animation` property on each caption
// ═══════════════════════════════════════════════════════════════
const ANIMATION_PRESETS = [
  {
    id: 'none',
    name: 'None',
    description: 'No animation',
    color: 'gray',
  },
  {
    id: 'fade_in',
    name: 'Fade In',
    description: 'Smooth opacity fade',
    color: 'blue',
  },
  {
    id: 'fade_in_slide',
    name: 'Fade + Slide',
    description: 'Fade in from below',
    color: 'cyan',
  },
  {
    id: 'typewriter',
    name: 'Typewriter',
    description: 'Letters appear one by one',
    color: 'green',
  },
  {
    id: 'bounce',
    name: 'Bounce',
    description: 'Bouncy pop entrance',
    color: 'amber',
  },
  {
    id: 'scale_pop',
    name: 'Scale Pop',
    description: 'Scales up from center',
    color: 'purple',
  },
  {
    id: 'slide_left',
    name: 'Slide Left',
    description: 'Slides in from right',
    color: 'rose',
  },
  {
    id: 'word_highlight',
    name: 'Word Highlight',
    description: 'Highlights active word',
    color: 'orange',
  },
];

// ═══════════════════════════════════════════════════════════════
// TYPOGRAPHY THEMES — sets of visual properties applied in bulk
// ═══════════════════════════════════════════════════════════════
const TYPOGRAPHY_THEMES = [
  {
    id: 'classic_white',
    name: 'Classic White',
    preview: { color: '#FFFFFF', bgColor: 'rgba(0,0,0,0.7)', fontSize: 20 },
    style: { color: '#FFFFFF', bgColor: 'rgba(0,0,0,0.7)', fontSize: 20, fontFamily: 'sans-serif' },
  },
  {
    id: 'bold_yellow',
    name: 'Bold Yellow',
    preview: { color: '#FACC15', bgColor: 'rgba(0,0,0,0.85)', fontSize: 24 },
    style: { color: '#FACC15', bgColor: 'rgba(0,0,0,0.85)', fontSize: 24, fontFamily: 'sans-serif' },
  },
  {
    id: 'mrbeast',
    name: 'MrBeast',
    preview: { color: '#FFFFFF', bgColor: 'transparent', fontSize: 32, strokeColor: '#000000', strokeWidth: 3 },
    style: { color: '#FFFFFF', bgColor: 'transparent', fontSize: 32, strokeColor: '#000000', strokeWidth: 3, fontFamily: 'sans-serif' },
  },
  {
    id: 'hormozi',
    name: 'Hormozi',
    preview: { color: '#FFFFFF', bgColor: 'transparent', fontSize: 28, strokeColor: '#000000', strokeWidth: 2 },
    style: { color: '#FFFFFF', bgColor: 'transparent', fontSize: 28, strokeColor: '#000000', strokeWidth: 2, fontFamily: 'sans-serif' },
  },
  {
    id: 'neon_cyan',
    name: 'Neon Cyan',
    preview: { color: '#22D3EE', bgColor: 'rgba(0,0,0,0.6)', fontSize: 22 },
    style: { color: '#22D3EE', bgColor: 'rgba(0,0,0,0.6)', fontSize: 22, fontFamily: 'sans-serif' },
  },
  {
    id: 'cinema_red',
    name: 'Cinema Red',
    preview: { color: '#EF4444', bgColor: 'rgba(0,0,0,0.8)', fontSize: 22 },
    style: { color: '#EF4444', bgColor: 'rgba(0,0,0,0.8)', fontSize: 22, fontFamily: 'sans-serif' },
  },
  {
    id: 'subtle_gray',
    name: 'Subtle Gray',
    preview: { color: '#D1D5DB', bgColor: 'rgba(0,0,0,0.4)', fontSize: 18 },
    style: { color: '#D1D5DB', bgColor: 'rgba(0,0,0,0.4)', fontSize: 18, fontFamily: 'sans-serif' },
  },
  {
    id: 'warm_gold',
    name: 'Warm Gold',
    preview: { color: '#FCD34D', bgColor: 'rgba(30,20,0,0.7)', fontSize: 22 },
    style: { color: '#FCD34D', bgColor: 'rgba(30,20,0,0.7)', fontSize: 22, fontFamily: 'sans-serif' },
  },
];

const colorMap = {
  gray: 'border-gray-600 text-gray-400',
  blue: 'border-blue-600 text-blue-400',
  cyan: 'border-cyan-600 text-cyan-400',
  green: 'border-green-600 text-green-400',
  amber: 'border-amber-600 text-amber-400',
  purple: 'border-purple-600 text-purple-400',
  rose: 'border-rose-600 text-rose-400',
  orange: 'border-orange-600 text-orange-400',
};

const colorMapActive = {
  gray: 'border-gray-400 bg-gray-500/20 text-gray-200',
  blue: 'border-blue-400 bg-blue-500/20 text-blue-200',
  cyan: 'border-cyan-400 bg-cyan-500/20 text-cyan-200',
  green: 'border-green-400 bg-green-500/20 text-green-200',
  amber: 'border-amber-400 bg-amber-500/20 text-amber-200',
  purple: 'border-purple-400 bg-purple-500/20 text-purple-200',
  rose: 'border-rose-400 bg-rose-500/20 text-rose-200',
  orange: 'border-orange-400 bg-orange-500/20 text-orange-200',
};

export default function CaptionStylePresets({ captionClips, onSetCaptionClips }) {
  const [activeAnimation, setActiveAnimation] = useState('none');
  const [activeTheme, setActiveTheme] = useState(null);
  const [msg, setMsg] = useState(null);

  const showMsg = (text) => { setMsg(text); setTimeout(() => setMsg(null), 2000); };

  const handleApplyAnimation = (preset) => {
    setActiveAnimation(preset.id);
    const animValue = preset.id === 'none' ? null : preset.id;
    onSetCaptionClips(captionClips.map(c => ({ ...c, animation: animValue })));
    showMsg(`Applied "${preset.name}" to ${captionClips.length} captions`);
  };

  const handleApplyTheme = (theme) => {
    setActiveTheme(theme.id);
    onSetCaptionClips(captionClips.map(c => ({
      ...c,
      ...theme.style,
    })));
    showMsg(`Applied "${theme.name}" theme to all captions`);
  };

  const noCaptions = captionClips.length === 0;

  return (
    <div className="space-y-4">
      {msg && (
        <div className="px-3 py-2 bg-green-500/20 text-green-400 text-[10px] rounded flex items-center gap-2">
          <CheckCircle size={12} /> {msg}
        </div>
      )}

      {noCaptions && (
        <div className="px-3 py-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-[10px] text-yellow-300">
          Generate captions first, then apply styles.
        </div>
      )}

      {/* ANIMATION PRESETS */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={12} className="text-purple-400" />
          <span className="text-[10px] font-medium text-gray-300 uppercase tracking-wider">Animation Presets</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {ANIMATION_PRESETS.map(preset => {
            const isActive = activeAnimation === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => !noCaptions && handleApplyAnimation(preset)}
                disabled={noCaptions}
                className={`p-2 rounded border text-left transition-all ${
                  noCaptions ? 'opacity-40 cursor-not-allowed border-gray-700' :
                  isActive ? colorMapActive[preset.color] : `${colorMap[preset.color]} hover:bg-white/5`
                }`}
              >
                <p className="text-[10px] font-medium leading-tight">{preset.name}</p>
                <p className="text-[8px] text-gray-500 mt-0.5">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* TYPOGRAPHY THEMES */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Type size={12} className="text-orange-400" />
          <span className="text-[10px] font-medium text-gray-300 uppercase tracking-wider">Typography Themes</span>
        </div>
        <div className="space-y-1.5">
          {TYPOGRAPHY_THEMES.map(theme => {
            const isActive = activeTheme === theme.id;
            const p = theme.preview;
            return (
              <button
                key={theme.id}
                onClick={() => !noCaptions && handleApplyTheme(theme)}
                disabled={noCaptions}
                className={`w-full flex items-center gap-3 p-2 rounded border transition-all ${
                  noCaptions ? 'opacity-40 cursor-not-allowed border-gray-700' :
                  isActive ? 'border-orange-400 bg-orange-500/15' : 'border-gray-700 hover:border-gray-500 hover:bg-white/5'
                }`}
              >
                {/* Mini preview swatch */}
                <div
                  className="flex-shrink-0 w-16 h-8 rounded flex items-center justify-center"
                  style={{
                    backgroundColor: p.bgColor === 'transparent' ? '#111' : p.bgColor,
                    border: p.bgColor === 'transparent' ? '1px solid #333' : 'none',
                  }}
                >
                  <span
                    className="font-bold leading-none"
                    style={{
                      color: p.color,
                      fontSize: Math.min(14, p.fontSize * 0.5),
                      textShadow: p.strokeColor ? `0 0 2px ${p.strokeColor}, 1px 1px 0 ${p.strokeColor}` : 'none',
                    }}
                  >
                    Abc
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[10px] font-medium text-gray-200">{theme.name}</p>
                  <p className="text-[8px] text-gray-500">{p.fontSize}px · {p.color}</p>
                </div>
                {isActive && <CheckCircle size={14} className="text-orange-400 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { ANIMATION_PRESETS, TYPOGRAPHY_THEMES };