import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Camera, Move, ZoomIn, ZoomOut, ArrowRight, ArrowLeft,
  ArrowUp, ArrowDown, ArrowUpRight, ArrowDownLeft,
  Wand2, X, CheckCircle, Loader2
} from 'lucide-react';

const MOTION_PRESETS = [
  // ── Single motions ──────────────────────────────────────────
  { id: 'zoom_in_center',  name: 'Push In',     icon: ZoomIn,       description: 'Slowly drifts closer',       category: 'zoom' },
  { id: 'zoom_out_center', name: 'Pull Out',    icon: ZoomOut,      description: 'Starts close, reveals scene', category: 'zoom' },
  { id: 'pan_right_zoom',  name: 'Drift Right', icon: ArrowRight,   description: 'Drifts right + push in',     category: 'pan' },
  { id: 'pan_left_zoom',   name: 'Drift Left',  icon: ArrowLeft,    description: 'Drifts left + push in',      category: 'pan' },
  { id: 'push_in_top',     name: 'Drift Up',    icon: ArrowUp,      description: 'Rises while zooming in',     category: 'pan' },
  { id: 'push_in_bottom',  name: 'Drift Down',  icon: ArrowDown,    description: 'Descends while zooming in',  category: 'pan' },
  { id: 'diagonal_tl_br',  name: 'Diagonal ↘',  icon: ArrowDownLeft, description: 'Top-left to bottom-right',  category: 'diagonal' },
  { id: 'diagonal_tr_bl',  name: 'Diagonal ↙',  icon: ArrowUpRight,  description: 'Top-right to bottom-left',  category: 'diagonal' },
];

// Cinematic combo patterns — apply a sequence across multiple clips
const COMBO_PATTERNS = [
  {
    id: 'alternating_zoom',
    name: 'Alternating Zoom',
    icon: Camera,
    description: 'Push in / pull out alternating between clips',
    pattern: ['zoom_in_center', 'zoom_out_center'],
  },
  {
    id: 'drift_variety',
    name: 'Drift Variety',
    icon: Move,
    description: 'Cycles through pan directions for visual variety',
    pattern: ['pan_right_zoom', 'push_in_top', 'pan_left_zoom', 'push_in_bottom'],
  },
  {
    id: 'diagonal_sweep',
    name: 'Diagonal Sweep',
    icon: ArrowDownLeft,
    description: 'Alternating diagonal camera sweeps',
    pattern: ['diagonal_tl_br', 'diagonal_tr_bl'],
  },
  {
    id: 'cinema_mix',
    name: 'Cinema Mix',
    icon: Wand2,
    description: 'Pro pattern: zoom → drift → diagonal cycle',
    pattern: ['zoom_in_center', 'pan_right_zoom', 'diagonal_tl_br', 'zoom_out_center', 'pan_left_zoom', 'diagonal_tr_bl'],
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'pan', label: 'Pan' },
  { id: 'diagonal', label: 'Diagonal' },
  { id: 'combos', label: 'Combos' },
];

export default function MotionPresetsPanel({
  selectedClip,
  videoClips,
  onUpdateClip,
  onUpdateAllClips,
}) {
  const [category, setCategory] = useState('all');
  const [msg, setMsg] = useState(null);
  const [speed, setSpeed] = useState(selectedClip?.motionSpeed ?? 1.0);
  const [intensity, setIntensity] = useState(selectedClip?.motionIntensity ?? 1.0);

  // Sync sliders when selection changes
  React.useEffect(() => {
    setSpeed(selectedClip?.motionSpeed ?? 1.0);
    setIntensity(selectedClip?.motionIntensity ?? 1.0);
  }, [selectedClip?.id]);

  const flash = (text) => { setMsg(text); setTimeout(() => setMsg(null), 2500); };

  const applySingle = (motionId) => {
    if (!selectedClip) { flash('Select a clip first'); return; }
    onUpdateClip({ ...selectedClip, cinematicMotion: motionId, motionSpeed: speed, motionIntensity: intensity });
    const preset = MOTION_PRESETS.find(p => p.id === motionId);
    flash(`Applied "${preset?.name}" to Scene ${selectedClip.sceneNumber}`);
  };

  const applyCombo = (pattern) => {
    const updated = videoClips.map((clip, idx) => ({
      ...clip,
      cinematicMotion: pattern[idx % pattern.length],
      motionSpeed: speed,
      motionIntensity: intensity,
    }));
    onUpdateAllClips(updated);
    flash(`Applied combo to all ${videoClips.length} clips`);
  };

  const removeMotion = () => {
    if (!selectedClip) return;
    onUpdateClip({ ...selectedClip, cinematicMotion: null });
    flash('Removed motion');
  };

  const removeAll = () => {
    onUpdateAllClips(videoClips.map(c => ({ ...c, cinematicMotion: null })));
    flash('Removed all motions');
  };

  const applyToAll = () => {
    if (!selectedClip?.cinematicMotion) { flash('Select a motion first'); return; }
    onUpdateAllClips(videoClips.map(c => ({
      ...c,
      cinematicMotion: selectedClip.cinematicMotion,
      motionSpeed: speed,
      motionIntensity: intensity,
    })));
    flash(`Applied "${MOTION_PRESETS.find(p => p.id === selectedClip.cinematicMotion)?.name}" to all clips`);
  };

  const motionCount = videoClips.filter(c => c.cinematicMotion).length;
  const showSingles = category === 'all' || ['zoom', 'pan', 'diagonal'].includes(category);
  const showCombos = category === 'all' || category === 'combos';
  const filteredPresets = category === 'all'
    ? MOTION_PRESETS
    : MOTION_PRESETS.filter(p => p.category === category);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white flex items-center gap-1.5">
            <Camera size={12} className="text-amber-400" /> Motion Presets
          </span>
          <span className="text-[10px] text-gray-500">{motionCount}/{videoClips.length} active</span>
        </div>
        <p className="text-[10px] text-gray-500">
          {selectedClip
            ? <>Scene {selectedClip.sceneNumber} {selectedClip.cinematicMotion ? <span className="text-amber-400">· {MOTION_PRESETS.find(p => p.id === selectedClip.cinematicMotion)?.name}</span> : ''}</>
            : 'Select a clip to apply motion'}
        </p>
      </div>

      {/* Feedback */}
      {msg && <div className="mx-2 mt-2 px-3 py-1.5 bg-amber-500/20 text-amber-300 text-[10px] rounded">{msg}</div>}

      {/* Category filter */}
      <div className="flex gap-1 px-2 pt-2 pb-1 flex-wrap">
        {CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => setCategory(cat.id)}
            className={`px-2 py-1 rounded text-[10px] ${category === cat.id ? 'bg-amber-500/30 text-amber-300 font-medium' : 'bg-gray-800/50 text-gray-500 hover:text-gray-300'}`}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Speed & Intensity controls */}
      <div className="px-3 py-2 space-y-2 border-b border-gray-800">
        <div className="flex justify-between text-[10px]">
          <span className="text-gray-400">Speed</span>
          <span className="text-white font-mono">{speed.toFixed(1)}x</span>
        </div>
        <Slider value={[speed]} onValueChange={([v]) => {
          setSpeed(v);
          if (selectedClip?.cinematicMotion) onUpdateClip({ ...selectedClip, motionSpeed: v });
        }} min={0.3} max={3.0} step={0.1} />

        <div className="flex justify-between text-[10px]">
          <span className="text-gray-400">Intensity</span>
          <span className="text-white font-mono">{intensity.toFixed(1)}x</span>
        </div>
        <Slider value={[intensity]} onValueChange={([v]) => {
          setIntensity(v);
          if (selectedClip?.cinematicMotion) onUpdateClip({ ...selectedClip, motionIntensity: v });
        }} min={0.2} max={3.0} step={0.1} />
      </div>

      {/* Scrollable preset grid */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Single presets */}
        {showSingles && filteredPresets.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[9px] text-gray-500 uppercase tracking-wider px-1">Single Motions</p>
            <div className="grid grid-cols-2 gap-1.5">
              {filteredPresets.map(preset => {
                const Icon = preset.icon;
                const isActive = selectedClip?.cinematicMotion === preset.id;
                return (
                  <button key={preset.id} onClick={() => applySingle(preset.id)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-all ${
                      isActive
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                        : 'bg-gray-800/40 border-gray-700/50 text-gray-400 hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-300'
                    }`}>
                    <Icon size={18} />
                    <span className="text-[10px] font-medium">{preset.name}</span>
                    <span className="text-[8px] text-gray-500 leading-tight text-center">{preset.description}</span>
                    {isActive && <CheckCircle size={10} className="text-amber-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Combo patterns */}
        {showCombos && (
          <div className="space-y-1.5">
            <p className="text-[9px] text-gray-500 uppercase tracking-wider px-1">Combo Patterns (all clips)</p>
            <div className="space-y-1.5">
              {COMBO_PATTERNS.map(combo => {
                const Icon = combo.icon;
                return (
                  <button key={combo.id} onClick={() => applyCombo(combo.pattern)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/50 text-gray-400 hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-300 transition-all text-left">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Icon size={16} className="text-purple-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium">{combo.name}</p>
                      <p className="text-[9px] text-gray-500">{combo.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="p-2 border-t border-gray-800 space-y-1.5">
        {selectedClip?.cinematicMotion && (
          <div className="flex gap-1.5">
            <Button onClick={applyToAll} size="sm" className="flex-1 bg-amber-600 hover:bg-amber-700 text-[10px] h-7">
              <Wand2 size={12} className="mr-1" /> Apply to All
            </Button>
            <Button onClick={removeMotion} size="sm" variant="outline" className="flex-1 border-gray-700 text-gray-400 text-[10px] h-7">
              <X size={12} className="mr-1" /> Remove
            </Button>
          </div>
        )}
        {motionCount > 0 && (
          <Button onClick={removeAll} size="sm" variant="outline" className="w-full border-red-800/50 text-red-400 hover:bg-red-500/10 text-[10px] h-7">
            <X size={12} className="mr-1" /> Clear All Motions ({motionCount})
          </Button>
        )}
      </div>
    </div>
  );
}