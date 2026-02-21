import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Layers, Save, Sparkles, Loader2 } from 'lucide-react';

const TRANSITIONS = [
  { value: 'cut', label: 'Cut', desc: 'Instant switch' },
  { value: 'fade', label: 'Fade', desc: 'Fade to black' },
  { value: 'dissolve', label: 'Dissolve', desc: 'Cross-dissolve' },
  { value: 'zoom', label: 'Zoom', desc: 'Zoom transition' },
  { value: 'wipe', label: 'Wipe', desc: 'Wipe effect' },
  { value: 'slide', label: 'Slide', desc: 'Slide over' },
];

export default function TransitionPicker({ scene, onSave }) {
  const [type, setType] = useState(scene?.transition_type || 'cut');
  const [duration, setDuration] = useState(scene?.transition_duration || 0.5);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  if (!scene) return null;

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Scenes.update(scene.id, {
      transition_type: type,
      transition_duration: duration,
    });
    setSaving(false);
    onSave?.();
  };

  const handleAiSuggest = async () => {
    setAiLoading(true);
    try {
      const result = await base44.functions.invoke('generateTransitions', {
        project_id: scene.project_id,
      });
      onSave?.();
    } catch (err) {
      console.warn('AI transitions failed:', err.message);
    }
    setAiLoading(false);
  };

  return (
    <div className="bg-white border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Layers className="w-4 h-4 text-purple-600" />
          Transition after Scene {scene.scene_number}
        </div>
        <Button size="sm" variant="ghost" onClick={handleAiSuggest} disabled={aiLoading} className="text-xs gap-1 h-7">
          {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          AI Suggest All
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TRANSITIONS.map(t => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            className={`p-2 rounded border text-xs text-center transition-all ${
              type === t.value
                ? 'border-purple-500 bg-purple-50 text-purple-700 font-medium'
                : 'border-gray-200 hover:border-gray-300 text-gray-600'
            }`}
          >
            <p className="font-medium">{t.label}</p>
            <p className="text-[10px] text-gray-400">{t.desc}</p>
          </button>
        ))}
      </div>

      {type !== 'cut' && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Duration</span>
            <span>{duration}s</span>
          </div>
          <Slider
            value={[duration]}
            onValueChange={([v]) => setDuration(v)}
            min={0.1}
            max={2}
            step={0.1}
          />
        </div>
      )}

      <Button size="sm" onClick={handleSave} disabled={saving} className="w-full gap-1 text-xs bg-purple-600 hover:bg-purple-700">
        <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Apply Transition'}
      </Button>
    </div>
  );
}