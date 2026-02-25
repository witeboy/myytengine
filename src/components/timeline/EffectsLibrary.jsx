import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Search, Check, Loader2, Sparkles, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'pan', label: 'Pan & Tilt' },
  { id: 'rotation', label: 'Rotation' },
  { id: 'speed', label: 'Speed' },
  { id: 'transition_fx', label: 'Transition FX' },
  { id: 'stylize', label: 'Stylize' },
  { id: 'blur_focus', label: 'Blur & Focus' },
  { id: 'color', label: 'Color' },
  { id: 'distortion', label: 'Distortion' },
];

const EFFECTS = [
  // Zoom effects
  { id: 'zoom_in_slow', label: 'Slow Zoom In', category: 'zoom', desc: 'Gentle push-in over clip duration', color: '#f59e0b', intensity: 'subtle', prompt_modifier: 'Slow, deliberate zoom in toward the center of the frame, building intimacy and focus.' },
  { id: 'zoom_in_fast', label: 'Fast Zoom In', category: 'zoom', desc: 'Quick punch-in zoom for emphasis', color: '#f59e0b', intensity: 'strong', prompt_modifier: 'Rapid zoom in toward center, creating urgency and impact.' },
  { id: 'zoom_out_slow', label: 'Slow Zoom Out', category: 'zoom', desc: 'Gradual pull-back reveal', color: '#f59e0b', intensity: 'subtle', prompt_modifier: 'Slow zoom out revealing more of the scene, creating a sense of vastness.' },
  { id: 'zoom_out_fast', label: 'Fast Zoom Out', category: 'zoom', desc: 'Quick zoom out for dramatic reveal', color: '#f59e0b', intensity: 'strong', prompt_modifier: 'Fast zoom out dramatically revealing the full environment.' },
  { id: 'dolly_zoom', label: 'Dolly Zoom (Vertigo)', category: 'zoom', desc: 'Background stretches while subject stays — Hitchcock effect', color: '#f59e0b', intensity: 'dramatic', prompt_modifier: 'Dolly zoom Vertigo effect — camera moves forward while zooming out, creating disorienting background stretch.' },
  { id: 'snap_zoom', label: 'Snap Zoom', category: 'zoom', desc: 'Ultra-fast whip zoom for shock cuts', color: '#f59e0b', intensity: 'extreme', prompt_modifier: 'Lightning-fast snap zoom creating a jarring, impactful moment.' },
  { id: 'zoom_pulse', label: 'Zoom Pulse', category: 'zoom', desc: 'Rhythmic zoom in/out like a heartbeat', color: '#f59e0b', intensity: 'medium', prompt_modifier: 'Rhythmic pulsing zoom in and out, creating a heartbeat-like visual rhythm.' },

  // Pan & Tilt
  { id: 'pan_left', label: 'Pan Left', category: 'pan', desc: 'Smooth horizontal pan to the left', color: '#06b6d4', intensity: 'subtle', prompt_modifier: 'Smooth horizontal pan from right to left, revealing the scene.' },
  { id: 'pan_right', label: 'Pan Right', category: 'pan', desc: 'Smooth horizontal pan to the right', color: '#06b6d4', intensity: 'subtle', prompt_modifier: 'Smooth horizontal pan from left to right, following the action.' },
  { id: 'tilt_up', label: 'Tilt Up', category: 'pan', desc: 'Camera tilts upward — reveals height', color: '#06b6d4', intensity: 'subtle', prompt_modifier: 'Camera tilts upward, revealing height and scale.' },
  { id: 'tilt_down', label: 'Tilt Down', category: 'pan', desc: 'Camera tilts downward — reveals depth', color: '#06b6d4', intensity: 'subtle', prompt_modifier: 'Camera tilts downward, grounding the viewer.' },
  { id: 'gentle_drift', label: 'Gentle Drift', category: 'pan', desc: 'Subtle floating movement — Ken Burns style', color: '#06b6d4', intensity: 'subtle', prompt_modifier: 'Gentle floating drift with subtle zoom, Ken Burns documentary style.' },
  { id: 'swish_pan', label: 'Swish Pan', category: 'pan', desc: 'Fast whip pan with motion blur — great for cuts', color: '#06b6d4', intensity: 'extreme', prompt_modifier: 'Ultra-fast whip pan with heavy motion blur, creating dynamic energy.' },
  { id: 'tracking_shot', label: 'Tracking Shot', category: 'pan', desc: 'Camera moves laterally alongside subject', color: '#06b6d4', intensity: 'medium', prompt_modifier: 'Lateral tracking shot alongside the subject, creating parallax depth.' },
  { id: 'crane_up', label: 'Crane Up', category: 'pan', desc: 'Camera rises vertically — epic reveal', color: '#06b6d4', intensity: 'dramatic', prompt_modifier: 'Camera cranes upward dramatically, revealing the full scope of the scene.' },
  { id: 'crane_down', label: 'Crane Down', category: 'pan', desc: 'Camera descends — grounding shot', color: '#06b6d4', intensity: 'medium', prompt_modifier: 'Camera descends from above, grounding into the scene.' },
  { id: 'orbital', label: 'Orbital', category: 'pan', desc: '360° orbit around subject', color: '#06b6d4', intensity: 'dramatic', prompt_modifier: 'Camera orbits around the subject in a smooth arc, creating cinematic depth.' },
  { id: 'parallax', label: 'Parallax', category: 'pan', desc: '2.5D depth layers moving at different speeds', color: '#06b6d4', intensity: 'medium', prompt_modifier: 'Parallax depth effect with foreground and background moving at different speeds.' },

  // Rotation
  { id: 'rotate_cw', label: 'Rotate Clockwise', category: 'rotation', desc: 'Slow clockwise rotation', color: '#a855f7', intensity: 'medium', prompt_modifier: 'Slow clockwise rotation creating a dreamy, disorienting feel.' },
  { id: 'rotate_ccw', label: 'Rotate Counter-CW', category: 'rotation', desc: 'Slow counter-clockwise rotation', color: '#a855f7', intensity: 'medium', prompt_modifier: 'Slow counter-clockwise rotation adding visual unease.' },
  { id: 'dutch_angle', label: 'Dutch Angle', category: 'rotation', desc: 'Tilted frame — tension and unease', color: '#a855f7', intensity: 'medium', prompt_modifier: 'Camera tilts to a dutch angle, creating visual tension and unease.' },
  { id: 'barrel_roll', label: 'Barrel Roll', category: 'rotation', desc: 'Full 360° rotation — extreme creative', color: '#a855f7', intensity: 'extreme', prompt_modifier: 'Full barrel roll rotation of the camera for extreme creative impact.' },

  // Speed effects
  { id: 'slow_motion', label: 'Slow Motion', category: 'speed', desc: 'Time slows down for dramatic emphasis', color: '#10b981', intensity: 'dramatic', prompt_modifier: 'Slow motion effect — time slows dramatically, emphasizing every detail.' },
  { id: 'speed_ramp_up', label: 'Speed Ramp Up', category: 'speed', desc: 'Accelerate from slow to fast', color: '#10b981', intensity: 'dramatic', prompt_modifier: 'Speed ramp from slow to fast, building kinetic energy.' },
  { id: 'speed_ramp_down', label: 'Speed Ramp Down', category: 'speed', desc: 'Decelerate from fast to slow', color: '#10b981', intensity: 'dramatic', prompt_modifier: 'Speed ramp from fast to slow, freezing the crucial moment.' },
  { id: 'time_freeze', label: 'Time Freeze', category: 'speed', desc: 'Freeze frame with camera still moving', color: '#10b981', intensity: 'extreme', prompt_modifier: 'Time freeze — the world stops but the camera continues to move around the frozen scene.' },
  { id: 'time_lapse', label: 'Time Lapse', category: 'speed', desc: 'Accelerated time passage', color: '#10b981', intensity: 'medium', prompt_modifier: 'Time lapse effect showing accelerated passage of time.' },

  // Transition FX
  { id: 'flash_white', label: 'Flash White', category: 'transition_fx', desc: 'Bright white flash between moments', color: '#ec4899', intensity: 'strong', prompt_modifier: 'Bright white flash — a burst of light transitioning between moments.' },
  { id: 'flash_black', label: 'Flash Black', category: 'transition_fx', desc: 'Quick blackout flash for impact', color: '#ec4899', intensity: 'strong', prompt_modifier: 'Quick flash to black creating a dramatic punctuation.' },
  { id: 'light_leak', label: 'Light Leak', category: 'transition_fx', desc: 'Warm film light leak flare', color: '#ec4899', intensity: 'subtle', prompt_modifier: 'Warm cinematic light leak flaring across the frame.' },
  { id: 'lens_flare', label: 'Lens Flare', category: 'transition_fx', desc: 'Anamorphic lens flare streak', color: '#ec4899', intensity: 'medium', prompt_modifier: 'Anamorphic lens flare streaking across the frame from a bright light source.' },
  { id: 'film_burn', label: 'Film Burn', category: 'transition_fx', desc: 'Vintage film burn effect at edges', color: '#ec4899', intensity: 'medium', prompt_modifier: 'Vintage film burn effect with orange and white overexposure creeping from edges.' },

  // Stylize
  { id: 'film_grain', label: 'Film Grain', category: 'stylize', desc: 'Organic 35mm film grain texture', color: '#8b5cf6', intensity: 'subtle', prompt_modifier: 'Organic 35mm film grain texture overlaid for cinematic authenticity.' },
  { id: 'vignette', label: 'Vignette', category: 'stylize', desc: 'Dark edges drawing focus to center', color: '#8b5cf6', intensity: 'subtle', prompt_modifier: 'Heavy vignette with darkened edges drawing the eye to center.' },
  { id: 'letterbox', label: 'Letterbox', category: 'stylize', desc: 'Cinematic 2.35:1 black bars', color: '#8b5cf6', intensity: 'subtle', prompt_modifier: 'Cinematic letterbox with 2.35:1 aspect ratio black bars.' },
  { id: 'halftone', label: 'Halftone', category: 'stylize', desc: 'Comic book dot pattern overlay', color: '#8b5cf6', intensity: 'strong', prompt_modifier: 'Halftone dot pattern overlay giving a comic book printed appearance.' },
  { id: 'scanlines', label: 'Scanlines', category: 'stylize', desc: 'CRT monitor scanline effect', color: '#8b5cf6', intensity: 'medium', prompt_modifier: 'CRT scanline overlay creating a retro monitor aesthetic.' },
  { id: 'vhs', label: 'VHS', category: 'stylize', desc: 'Retro VHS tape distortion look', color: '#8b5cf6', intensity: 'strong', prompt_modifier: 'VHS tape effect with tracking lines, color bleed, and warping.' },

  // Blur & Focus
  { id: 'rack_focus', label: 'Rack Focus', category: 'blur_focus', desc: 'Focus pulls from bg to fg or vice versa', color: '#0ea5e9', intensity: 'dramatic', prompt_modifier: 'Rack focus pulling from background to foreground, shifting attention.' },
  { id: 'tilt_shift', label: 'Tilt Shift', category: 'blur_focus', desc: 'Miniature world effect — top/bottom blur', color: '#0ea5e9', intensity: 'medium', prompt_modifier: 'Tilt shift miniature effect with blurred top and bottom, sharp center band.' },
  { id: 'radial_blur', label: 'Radial Blur', category: 'blur_focus', desc: 'Blur radiating from center outward', color: '#0ea5e9', intensity: 'strong', prompt_modifier: 'Radial blur emanating from center, creating speed and focus.' },
  { id: 'motion_blur', label: 'Motion Blur', category: 'blur_focus', desc: 'Directional motion blur for speed', color: '#0ea5e9', intensity: 'medium', prompt_modifier: 'Directional motion blur conveying speed and movement.' },
  { id: 'gaussian_blur', label: 'Gaussian Blur', category: 'blur_focus', desc: 'Soft dreamy blur across entire frame', color: '#0ea5e9', intensity: 'medium', prompt_modifier: 'Soft gaussian blur creating a dreamy, ethereal quality.' },
  { id: 'bokeh', label: 'Bokeh', category: 'blur_focus', desc: 'Beautiful circular bokeh light orbs', color: '#0ea5e9', intensity: 'subtle', prompt_modifier: 'Beautiful circular bokeh orbs floating in the background.' },

  // Color
  { id: 'desaturate', label: 'Desaturate', category: 'color', desc: 'Drain color to black & white', color: '#6b7280', intensity: 'strong', prompt_modifier: 'Desaturated to near black and white, draining color for somber mood.' },
  { id: 'sepia', label: 'Sepia', category: 'color', desc: 'Warm vintage sepia tone', color: '#d97706', intensity: 'medium', prompt_modifier: 'Warm sepia tone creating a vintage, nostalgic feel.' },
  { id: 'teal_orange', label: 'Teal & Orange', category: 'color', desc: 'Hollywood blockbuster color grade', color: '#0d9488', intensity: 'medium', prompt_modifier: 'Hollywood teal and orange color grading for cinematic drama.' },
  { id: 'high_contrast', label: 'High Contrast', category: 'color', desc: 'Crushed blacks, bright highlights', color: '#1f2937', intensity: 'strong', prompt_modifier: 'High contrast with crushed blacks and bright highlights for dramatic impact.' },
  { id: 'cross_process', label: 'Cross Process', category: 'color', desc: 'Shifted colors like film cross-processing', color: '#84cc16', intensity: 'strong', prompt_modifier: 'Cross-processed colors with shifted hues and increased saturation.' },
  { id: 'bleach_bypass', label: 'Bleach Bypass', category: 'color', desc: 'Desaturated high contrast — Saving Private Ryan look', color: '#9ca3af', intensity: 'strong', prompt_modifier: 'Bleach bypass effect — high contrast, desaturated, gritty look.' },
  { id: 'day_for_night', label: 'Day for Night', category: 'color', desc: 'Cool blue tint simulating nighttime', color: '#1e3a5f', intensity: 'strong', prompt_modifier: 'Day-for-night effect with cool blue tint simulating moonlit night.' },

  // Distortion
  { id: 'glitch', label: 'Glitch', category: 'distortion', desc: 'Digital glitch with RGB split', color: '#ef4444', intensity: 'strong', prompt_modifier: 'Digital glitch effect with RGB channel splitting and data corruption.' },
  { id: 'chromatic_aberration', label: 'Chromatic Aberration', category: 'distortion', desc: 'RGB fringing at edges — lens imperfection', color: '#ef4444', intensity: 'subtle', prompt_modifier: 'Chromatic aberration with RGB fringing at the edges of the frame.' },
  { id: 'shake', label: 'Camera Shake', category: 'distortion', desc: 'Handheld camera shake for realism', color: '#ef4444', intensity: 'medium', prompt_modifier: 'Handheld camera shake adding urgency and raw realism.' },
  { id: 'earthquake', label: 'Earthquake', category: 'distortion', desc: 'Heavy rumbling camera shake', color: '#ef4444', intensity: 'extreme', prompt_modifier: 'Heavy earthquake shake with rumbling, violent camera movement.' },
  { id: 'wave_distortion', label: 'Wave Distortion', category: 'distortion', desc: 'Rippling wave across the frame', color: '#ef4444', intensity: 'medium', prompt_modifier: 'Rippling wave distortion across the frame, like heat haze or underwater.' },
  { id: 'mirror', label: 'Mirror / Kaleidoscope', category: 'distortion', desc: 'Mirrored or kaleidoscope pattern', color: '#ef4444', intensity: 'extreme', prompt_modifier: 'Kaleidoscope mirror effect fracturing the image into geometric patterns.' },
];

const INTENSITY_COLORS = {
  subtle: 'text-green-400 bg-green-400/10',
  medium: 'text-blue-400 bg-blue-400/10',
  strong: 'text-amber-400 bg-amber-400/10',
  dramatic: 'text-purple-400 bg-purple-400/10',
  extreme: 'text-red-400 bg-red-400/10',
};

export default function EffectsLibrary({ open, onClose, scene, onApply }) {
  const [selected, setSelected] = useState(null);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset selection when modal opens/closes
  React.useEffect(() => {
    if (!open) { setSelected(null); setSearch(''); setCategory('all'); }
  }, [open]);

  if (!open) return null;

  const filtered = EFFECTS.filter(e => {
    if (category !== 'all' && e.category !== category) return false;
    if (search && !e.label.toLowerCase().includes(search.toLowerCase()) && !e.desc.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleApply = async () => {
    if (!selected || !scene) return;
    setSaving(true);

    // Get existing visual_effects or create new array
    let existingEffects = [];
    try { existingEffects = JSON.parse(scene.visual_effects || '[]'); } catch (_) {}

    // Add the new effect if not already present
    if (!existingEffects.includes(selected.id)) {
      existingEffects.push(selected.id);
    }

    // Update animation prompt to include effect
    const currentAnim = scene.animation_prompt || '';
    const effectNote = ` [EFFECT: ${selected.label}] ${selected.prompt_modifier}`;
    const updatedAnim = currentAnim.includes(`[EFFECT: ${selected.label}]`) ? currentAnim : currentAnim + effectNote;

    await base44.entities.Scenes.update(scene.id, {
      visual_effects: JSON.stringify(existingEffects),
      animation_prompt: updatedAnim,
    });

    setSaving(false);
    onApply?.();
    onClose();
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
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-[#13132b] rounded-xl w-full max-w-3xl shadow-2xl border border-white/[0.08] overflow-hidden flex flex-col max-h-[85vh]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <div>
                <h3 className="text-[14px] font-semibold text-white">Effects Library</h3>
                <p className="text-[11px] text-gray-500">
                  {scene ? `Apply to Scene ${scene.scene_number}` : 'Select a scene first'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded hover:bg-white/10">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-1 min-h-0">
            {/* Left: effects grid */}
            <div className="flex-1 flex flex-col border-r border-white/[0.06] min-w-0">
              {/* Category tabs */}
              <div className="px-4 pt-3 pb-2 space-y-2 flex-shrink-0">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-colors ${
                        category === cat.id
                          ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
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
                    placeholder="Search effects..."
                    className="w-full h-7 pl-7 pr-2 text-[11px] bg-white/[0.04] border border-white/[0.06] rounded-md text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
                  />
                </div>
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-y-auto px-4 pb-3">
                <div className="grid grid-cols-3 gap-1.5">
                  {filtered.map(e => {
                    const isSelected = selected?.id === e.id;
                    return (
                      <button
                        key={e.id}
                        onClick={() => setSelected(e)}
                        className={`relative group p-2 rounded-lg text-left transition-all ${
                          isSelected
                            ? 'bg-amber-500/15 ring-1 ring-amber-500/50'
                            : 'bg-white/[0.03] hover:bg-white/[0.07]'
                        }`}
                      >
                        <div className="w-full h-1 rounded-full mb-1.5 opacity-60" style={{ background: e.color }} />
                        <p className={`text-[11px] font-semibold ${isSelected ? 'text-amber-300' : 'text-gray-300'}`}>{e.label}</p>
                        <p className="text-[9px] text-gray-600 leading-snug mt-0.5 line-clamp-2">{e.desc}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <span className={`text-[7px] px-1 py-px rounded font-medium ${INTENSITY_COLORS[e.intensity] || ''}`}>
                            {e.intensity}
                          </span>
                        </div>
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5">
                            <Check className="w-3 h-3 text-amber-400" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {filtered.length === 0 && (
                  <p className="text-[11px] text-gray-600 text-center py-8">No effects match your search</p>
                )}
              </div>
            </div>

            {/* Right: selected detail */}
            <div className="w-56 flex-shrink-0 flex flex-col p-4 space-y-3">
              {selected ? (
                <>
                  <div className="w-full h-1.5 rounded-full" style={{ background: selected.color }} />
                  <p className="text-[13px] font-bold text-white">{selected.label}</p>
                  <p className="text-[10px] text-gray-400 leading-snug">{selected.desc}</p>
                  <div>
                    <p className="text-[9px] text-gray-500 font-medium uppercase tracking-wide mb-1">Intensity</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${INTENSITY_COLORS[selected.intensity]}`}>
                      {selected.intensity}
                    </span>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-500 font-medium uppercase tracking-wide mb-1">Category</p>
                    <span className="text-[10px] text-gray-400 capitalize">{selected.category.replace(/_/g, ' ')}</span>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-500 font-medium uppercase tracking-wide mb-1">Animation Modifier</p>
                    <p className="text-[9px] text-gray-400 leading-snug bg-white/[0.03] rounded p-2 max-h-20 overflow-y-auto">{selected.prompt_modifier}</p>
                  </div>

                  {/* Current scene effects */}
                  {scene && (() => {
                    let existing = [];
                    try { existing = JSON.parse(scene.visual_effects || '[]'); } catch (_) {}
                    if (existing.length === 0) return null;
                    return (
                      <div>
                        <p className="text-[9px] text-gray-500 font-medium uppercase tracking-wide mb-1">Applied Effects</p>
                        <div className="flex flex-wrap gap-1">
                          {existing.map(eid => {
                            const eff = EFFECTS.find(e => e.id === eid);
                            return (
                              <span key={eid} className="text-[8px] px-1.5 py-0.5 rounded bg-white/[0.06] text-gray-400">
                                {eff?.label || eid}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex-1" />
                  <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2 rounded-lg text-[11px] font-medium text-gray-400 bg-white/[0.05] hover:bg-white/[0.1]">Cancel</button>
                    <button
                      onClick={handleApply}
                      disabled={saving || !scene}
                      className="flex-1 py-2 rounded-lg text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-600/20 disabled:opacity-50"
                    >
                      {saving ? 'Applying...' : 'Apply Effect'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                  <Sparkles className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-[11px]">Select an effect</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export { EFFECTS };