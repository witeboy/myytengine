import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Video, Camera, Gauge, Sparkles, Save, Loader2 } from 'lucide-react';

const CAMERA_MOVEMENTS = [
  { id: 'static', label: 'Static', desc: 'No camera movement' },
  { id: 'slow_pan', label: 'Slow Pan', desc: 'Gentle horizontal sweep' },
  { id: 'slow_zoom_in', label: 'Zoom In', desc: 'Slowly push into scene' },
  { id: 'slow_zoom_out', label: 'Zoom Out', desc: 'Slowly pull back' },
  { id: 'dolly_zoom', label: 'Dolly Zoom', desc: 'Vertigo effect' },
  { id: 'crane_shot', label: 'Crane Shot', desc: 'Rising vertical movement' },
  { id: 'tracking_shot', label: 'Tracking Shot', desc: 'Follow subject movement' },
  { id: 'orbital', label: 'Orbital', desc: 'Rotate around subject' },
  { id: 'tilt_up', label: 'Tilt Up', desc: 'Vertical pan upward' },
  { id: 'tilt_down', label: 'Tilt Down', desc: 'Vertical pan downward' },
];

const VISUAL_EFFECTS = [
  { id: 'lens_flare', label: 'Lens Flare' },
  { id: 'motion_blur', label: 'Motion Blur' },
  { id: 'film_grain', label: 'Film Grain' },
  { id: 'bokeh', label: 'Bokeh' },
  { id: 'light_leak', label: 'Light Leak' },
  { id: 'vignette', label: 'Vignette' },
];

const SPEEDS = [
  { id: 'very_slow', label: 'Very Slow' },
  { id: 'slow', label: 'Slow' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fast' },
];

export default function AnimationEditor({ scene, onSave }) {
  const [camera, setCamera] = useState(scene.camera_movement || 'slow_pan');
  const [speed, setSpeed] = useState(scene.animation_speed || 'normal');
  const [effects, setEffects] = useState(() => {
    try { return JSON.parse(scene.visual_effects || '[]'); } catch { return []; }
  });
  const [prompt, setPrompt] = useState(scene.animation_prompt || '');
  const [duration, setDuration] = useState(scene.duration_seconds || 5);
  const [saving, setSaving] = useState(false);

  const toggleEffect = (id) => {
    setEffects(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const buildPrompt = () => {
    const cam = CAMERA_MOVEMENTS.find(c => c.id === camera);
    const parts = [];
    parts.push(`Camera: ${cam?.label || camera}`);
    parts.push(`Speed: ${speed}`);
    if (effects.length > 0) parts.push(`Effects: ${effects.join(', ')}`);
    if (prompt) parts.push(prompt);
    return parts.join('. ');
  };

  const handleSave = async () => {
    setSaving(true);
    const fullPrompt = buildPrompt();
    await base44.entities.Scenes.update(scene.id, {
      camera_movement: camera,
      animation_speed: speed,
      visual_effects: JSON.stringify(effects),
      animation_prompt: fullPrompt,
      duration_seconds: duration,
    });
    onSave?.();
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* Camera Movement */}
      <div>
        <label className="text-sm font-medium flex items-center gap-1.5 mb-2">
          <Camera className="w-4 h-4 text-blue-600" /> Camera Movement
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {CAMERA_MOVEMENTS.map(cm => (
            <button
              key={cm.id}
              onClick={() => setCamera(cm.id)}
              className={`text-left text-xs px-2.5 py-1.5 rounded-md border transition-all ${
                camera === cm.id ? 'bg-blue-50 border-blue-400 text-blue-800' : 'bg-white hover:bg-gray-50'
              }`}
            >
              <span className="font-medium">{cm.label}</span>
              <span className="text-gray-400 ml-1">– {cm.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Speed */}
      <div>
        <label className="text-sm font-medium flex items-center gap-1.5 mb-2">
          <Gauge className="w-4 h-4 text-orange-600" /> Animation Speed
        </label>
        <div className="flex gap-2">
          {SPEEDS.map(s => (
            <button
              key={s.id}
              onClick={() => setSpeed(s.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                speed === s.id ? 'bg-orange-50 border-orange-400 text-orange-800' : 'bg-white hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div>
        <label className="text-sm font-medium flex items-center gap-1.5 mb-2">
          <Video className="w-4 h-4 text-purple-600" /> Duration: {duration}s
        </label>
        <Slider
          value={[duration]}
          onValueChange={([v]) => setDuration(v)}
          min={3}
          max={10}
          step={1}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>3s</span><span>5s</span><span>10s</span>
        </div>
      </div>

      {/* Visual Effects */}
      <div>
        <label className="text-sm font-medium flex items-center gap-1.5 mb-2">
          <Sparkles className="w-4 h-4 text-yellow-600" /> Visual Effects
        </label>
        <div className="flex flex-wrap gap-1.5">
          {VISUAL_EFFECTS.map(vfx => (
            <button
              key={vfx.id}
              onClick={() => toggleEffect(vfx.id)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                effects.includes(vfx.id)
                  ? 'bg-yellow-50 border-yellow-400 text-yellow-800'
                  : 'bg-white hover:bg-gray-50'
              }`}
            >
              {vfx.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Prompt Override */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Custom Animation Prompt</label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="Add specific animation instructions..."
          className="text-sm"
        />
      </div>

      {/* Preview text */}
      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-xs font-medium text-gray-500 mb-1">Final animation prompt:</p>
        <p className="text-xs text-gray-700">{buildPrompt()}</p>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
        Save Animation Settings
      </Button>
    </div>
  );
}