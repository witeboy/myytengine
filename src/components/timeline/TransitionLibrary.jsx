import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Sparkles, Loader2, Check, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'basic', label: 'Basic' },
  { id: 'smooth', label: 'Smooth' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'dynamic', label: 'Dynamic' },
  { id: 'creative', label: 'Creative' },
];

const TRANSITIONS = [
  // Basic
  { id: 'cut', label: 'Cut', category: 'basic', desc: 'Instant switch — no visible transition', color: '#6b7280', animation: 'cut' },
  { id: 'fade', label: 'Fade to Black', category: 'basic', desc: 'Fade out to black, then in', color: '#3b82f6', animation: 'fade' },
  { id: 'fade_white', label: 'Fade to White', category: 'basic', desc: 'Fade out to white, then in', color: '#e5e7eb', animation: 'fade_white' },

  // Smooth
  { id: 'dissolve', label: 'Cross Dissolve', category: 'smooth', desc: 'Smooth blend between two scenes', color: '#8b5cf6', animation: 'dissolve' },
  { id: 'slide', label: 'Slide Left', category: 'smooth', desc: 'New scene slides in from right', color: '#06b6d4', animation: 'slide_left' },
  { id: 'slide_right', label: 'Slide Right', category: 'smooth', desc: 'New scene slides in from left', color: '#0891b2', animation: 'slide_right' },
  { id: 'slide_up', label: 'Slide Up', category: 'smooth', desc: 'New scene slides up from bottom', color: '#0d9488', animation: 'slide_up' },
  { id: 'slide_down', label: 'Slide Down', category: 'smooth', desc: 'New scene drops from top', color: '#14b8a6', animation: 'slide_down' },

  // Cinematic
  { id: 'zoom', label: 'Zoom In', category: 'cinematic', desc: 'Zoom into center, reveal next', color: '#f59e0b', animation: 'zoom_in' },
  { id: 'zoom_out', label: 'Zoom Out', category: 'cinematic', desc: 'Zoom out, revealing next scene', color: '#d97706', animation: 'zoom_out' },
  { id: 'blur', label: 'Blur Transition', category: 'cinematic', desc: 'Blur current, reveal next sharp', color: '#a78bfa', animation: 'blur' },
  { id: 'light_leak', label: 'Light Leak', category: 'cinematic', desc: 'Warm light flare between scenes', color: '#fb923c', animation: 'light_leak' },

  // Dynamic
  { id: 'wipe', label: 'Wipe Right', category: 'dynamic', desc: 'Horizontal wipe reveals next scene', color: '#10b981', animation: 'wipe_right' },
  { id: 'wipe_left', label: 'Wipe Left', category: 'dynamic', desc: 'Left-to-right wipe', color: '#059669', animation: 'wipe_left' },
  { id: 'wipe_down', label: 'Wipe Down', category: 'dynamic', desc: 'Top-to-bottom curtain reveal', color: '#047857', animation: 'wipe_down' },
  { id: 'iris', label: 'Iris Circle', category: 'dynamic', desc: 'Circular iris opens to next scene', color: '#ec4899', animation: 'iris' },

  // Creative
  { id: 'glitch', label: 'Glitch', category: 'creative', desc: 'Digital glitch distortion effect', color: '#ef4444', animation: 'glitch' },
  { id: 'pixelate', label: 'Pixelate', category: 'creative', desc: 'Pixelate out, sharpen in', color: '#f43f5e', animation: 'pixelate' },
  { id: 'spin', label: 'Spin', category: 'creative', desc: 'Scene spins away, next spins in', color: '#a855f7', animation: 'spin' },
  { id: 'morph', label: 'Morph', category: 'creative', desc: 'Organic morph between scenes', color: '#7c3aed', animation: 'morph' },
];

const DURATIONS = [
  { value: 0.3, label: '0.3s', desc: 'Snappy' },
  { value: 0.5, label: '0.5s', desc: 'Default' },
  { value: 0.8, label: '0.8s', desc: 'Smooth' },
  { value: 1.0, label: '1.0s', desc: 'Slow' },
  { value: 1.5, label: '1.5s', desc: 'Dramatic' },
  { value: 2.0, label: '2.0s', desc: 'Very slow' },
];

function TransitionPreview({ transition, sceneA, sceneB, duration }) {
  const [phase, setPhase] = useState('a');
  const intervalRef = useRef(null);

  useEffect(() => {
    let step = 0;
    intervalRef.current = setInterval(() => {
      step = (step + 1) % 3;
      setPhase(step === 0 ? 'a' : step === 1 ? 'transition' : 'b');
    }, 800);
    return () => clearInterval(intervalRef.current);
  }, [transition]);

  const imgA = sceneA?.image_url;
  const imgB = sceneB?.image_url;
  const anim = transition?.animation || 'cut';

  const getTransitionStyle = () => {
    if (phase === 'a') return {};
    if (phase === 'b') return {};
    // During transition phase
    switch (anim) {
      case 'fade': case 'fade_white': return {};
      case 'dissolve': return {};
      case 'slide_left': return { transform: 'translateX(-50%)' };
      case 'slide_right': return { transform: 'translateX(50%)' };
      case 'slide_up': return { transform: 'translateY(-50%)' };
      case 'slide_down': return { transform: 'translateY(50%)' };
      case 'zoom_in': return { transform: 'scale(1.5)', opacity: 0.5 };
      case 'zoom_out': return { transform: 'scale(0.5)', opacity: 0.5 };
      case 'spin': return { transform: 'rotate(180deg) scale(0.5)', opacity: 0.5 };
      default: return { opacity: 0.5 };
    }
  };

  return (
    <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
      {/* Scene A */}
      <div
        className="absolute inset-0 transition-all"
        style={{
          opacity: phase === 'b' ? 0 : 1,
          ...((phase === 'transition') ? getTransitionStyle() : {}),
          transitionDuration: '0.5s',
        }}
      >
        {imgA ? (
          <img src={imgA} className="w-full h-full object-cover" alt="" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
            <span className="text-white/40 text-xs font-bold">A</span>
          </div>
        )}
      </div>
      {/* Scene B */}
      <div
        className="absolute inset-0 transition-all"
        style={{
          opacity: phase === 'a' ? 0 : phase === 'transition' ? 0.6 : 1,
          transitionDuration: '0.5s',
        }}
      >
        {imgB ? (
          <img src={imgB} className="w-full h-full object-cover" alt="" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center">
            <span className="text-white/40 text-xs font-bold">B</span>
          </div>
        )}
      </div>
      {/* Overlay effects */}
      {phase === 'transition' && (anim === 'fade') && (
        <div className="absolute inset-0 bg-black/80 transition-opacity duration-300" />
      )}
      {phase === 'transition' && (anim === 'fade_white') && (
        <div className="absolute inset-0 bg-white/80 transition-opacity duration-300" />
      )}
      {phase === 'transition' && (anim === 'light_leak') && (
        <div className="absolute inset-0 bg-gradient-to-r from-orange-400/60 via-yellow-300/40 to-transparent transition-opacity duration-300" />
      )}
      {phase === 'transition' && (anim === 'glitch') && (
        <div className="absolute inset-0 bg-red-500/20 mix-blend-difference" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.1) 2px, rgba(0,255,0,0.1) 4px)' }} />
      )}
      {phase === 'transition' && (anim === 'iris') && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-black/90 ring-[40px] ring-black/80" />
        </div>
      )}
      {phase === 'transition' && (anim === 'wipe_right' || anim === 'wipe_left' || anim === 'wipe_down') && (
        <div className="absolute inset-0">
          <div className={`absolute bg-black/20 ${
            anim === 'wipe_right' ? 'inset-y-0 left-0 w-1/2' :
            anim === 'wipe_left' ? 'inset-y-0 right-0 w-1/2' :
            'inset-x-0 top-0 h-1/2'
          }`} />
        </div>
      )}
      {/* Phase indicator */}
      <div className="absolute bottom-1 right-1 flex gap-0.5">
        {['a', 'transition', 'b'].map(p => (
          <div key={p} className={`w-1 h-1 rounded-full transition-colors ${phase === p ? 'bg-white' : 'bg-white/30'}`} />
        ))}
      </div>
    </div>
  );
}

export default function TransitionLibrary({ open, onClose, sceneA, sceneB, onApply }) {
  const [selected, setSelected] = useState(null);
  const [duration, setDuration] = useState(0.5);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (open && sceneA) {
      setSelected(TRANSITIONS.find(t => t.id === sceneA.transition_type) || TRANSITIONS[0]);
      setDuration(sceneA.transition_duration || 0.5);
    }
  }, [open, sceneA?.id]);

  if (!open) return null;

  const filtered = TRANSITIONS.filter(t => {
    if (category !== 'all' && t.category !== category) return false;
    if (search && !t.label.toLowerCase().includes(search.toLowerCase()) && !t.desc.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleApply = async () => {
    if (!selected) return;
    setSaving(true);
    // Map extended transition IDs back to the entity enum values
    const enumMap = {
      'cut': 'cut', 'fade': 'fade', 'fade_white': 'fade',
      'dissolve': 'dissolve', 'slide': 'slide', 'slide_right': 'slide', 'slide_up': 'slide', 'slide_down': 'slide',
      'zoom': 'zoom', 'zoom_out': 'zoom',
      'blur': 'dissolve', 'light_leak': 'fade',
      'wipe': 'wipe', 'wipe_left': 'wipe', 'wipe_down': 'wipe',
      'iris': 'wipe', 'glitch': 'cut', 'pixelate': 'dissolve', 'spin': 'zoom', 'morph': 'dissolve',
    };
    await base44.entities.Scenes.update(sceneA.id, {
      transition_type: enumMap[selected.id] || 'cut',
      transition_duration: selected.id === 'cut' ? 0 : duration,
    });
    setSaving(false);
    onApply?.();
    onClose();
  };

  const handleAiSuggest = async () => {
    setAiLoading(true);
    try {
      await base44.functions.invoke('generateTransitions', { project_id: sceneA.project_id });
      onApply?.();
      onClose();
    } catch (err) { /* ignore */ }
    setAiLoading(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="bg-[#13132b] rounded-xl w-full max-w-2xl shadow-2xl border border-white/[0.08] overflow-hidden flex flex-col max-h-[85vh]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
            <div>
              <h3 className="text-[14px] font-semibold text-white">Transitions Library</h3>
              <p className="text-[11px] text-gray-500">
                Scene {sceneA?.scene_number} → Scene {sceneB?.scene_number}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAiSuggest}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                AI Suggest All
              </button>
              <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 min-h-0">
            {/* Left: transition grid */}
            <div className="flex-1 flex flex-col border-r border-white/[0.06] min-w-0">
              {/* Category tabs + search */}
              <div className="px-4 pt-3 pb-2 space-y-2 flex-shrink-0">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-colors ${
                        category === cat.id
                          ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search transitions..."
                    className="w-full h-7 pl-7 pr-2 text-[11px] bg-white/[0.04] border border-white/[0.06] rounded-md text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-blue-500/40"
                  />
                </div>
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-y-auto px-4 pb-3">
                <div className="grid grid-cols-3 gap-1.5">
                  {filtered.map(t => {
                    const isSelected = selected?.id === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelected(t)}
                        className={`relative group p-2 rounded-lg text-left transition-all ${
                          isSelected
                            ? 'bg-blue-500/15 ring-1 ring-blue-500/50'
                            : 'bg-white/[0.03] hover:bg-white/[0.07]'
                        }`}
                      >
                        {/* Color accent bar */}
                        <div className="w-full h-1 rounded-full mb-1.5 opacity-60" style={{ background: t.color }} />
                        <p className={`text-[11px] font-semibold ${isSelected ? 'text-blue-300' : 'text-gray-300'}`}>
                          {t.label}
                        </p>
                        <p className="text-[9px] text-gray-600 leading-snug mt-0.5 line-clamp-2">{t.desc}</p>
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5">
                            <Check className="w-3 h-3 text-blue-400" />
                          </div>
                        )}
                        {/* Category badge */}
                        <span className="text-[8px] text-gray-600 mt-1 block capitalize">{t.category}</span>
                      </button>
                    );
                  })}
                </div>
                {filtered.length === 0 && (
                  <p className="text-[11px] text-gray-600 text-center py-8">No transitions match your search</p>
                )}
              </div>
            </div>

            {/* Right: preview + settings */}
            <div className="w-56 flex-shrink-0 flex flex-col p-4 space-y-3">
              {/* Live preview */}
              <div>
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1.5">Preview</p>
                <TransitionPreview
                  transition={selected}
                  sceneA={sceneA}
                  sceneB={sceneB}
                  duration={duration}
                />
              </div>

              {/* Selected info */}
              {selected && (
                <div className="space-y-1">
                  <p className="text-[12px] font-semibold text-white">{selected.label}</p>
                  <p className="text-[10px] text-gray-500 leading-snug">{selected.desc}</p>
                </div>
              )}

              {/* Duration */}
              {selected?.id !== 'cut' && (
                <div>
                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1.5">Duration</p>
                  <div className="grid grid-cols-3 gap-1">
                    {DURATIONS.map(d => (
                      <button
                        key={d.value}
                        onClick={() => setDuration(d.value)}
                        className={`py-1.5 rounded-md text-center transition-all ${
                          duration === d.value
                            ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40'
                            : 'bg-white/[0.04] text-gray-500 hover:bg-white/[0.08] hover:text-gray-300'
                        }`}
                      >
                        <p className="text-[11px] font-semibold">{d.label}</p>
                        <p className="text-[8px] text-gray-600">{d.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Scene previews */}
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1">
                  <p className="text-[8px] text-gray-600 mb-0.5">From</p>
                  <div className="aspect-video rounded bg-gray-800 overflow-hidden">
                    {sceneA?.image_url ? <img src={sceneA.image_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800" />}
                  </div>
                  <p className="text-[8px] text-gray-600 mt-0.5 text-center">S{sceneA?.scene_number}</p>
                </div>
                <span className="text-gray-600 text-[10px]">→</span>
                <div className="flex-1">
                  <p className="text-[8px] text-gray-600 mb-0.5">To</p>
                  <div className="aspect-video rounded bg-gray-800 overflow-hidden">
                    {sceneB?.image_url ? <img src={sceneB.image_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800" />}
                  </div>
                  <p className="text-[8px] text-gray-600 mt-0.5 text-center">S{sceneB?.scene_number}</p>
                </div>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2 rounded-lg text-[11px] font-medium text-gray-400 bg-white/[0.05] hover:bg-white/[0.1] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={saving || !selected}
                  className="flex-1 py-2 rounded-lg text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  {saving ? 'Applying...' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}