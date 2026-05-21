import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MODE_OPTIONS = [
  { value: 'standard',         label: '🎭 Standard (Viral Storytelling)' },
  { value: 'explainer',        label: '📚 Explainer (Educational + Facts)' },
  { value: 'long_viral',       label: '🎬 Long Viral' },
  { value: 'youtube_shorts',   label: '📱 YouTube Shorts (90s)' },
  { value: 'sleep_meditation', label: '🧘 Sleep Meditation' },
  { value: 'sleep_story',      label: '🌙 Sleep Story' },
];

const ARC_OPTIONS = [
  { value: 'science',    label: '🔬 Science Arc' },
  { value: 'professor',  label: '🎓 Professor Arc' },
  { value: 'accountant', label: '💰 Accountant Arc (Money / Finance)' },
  { value: 'tech',       label: '💻 Tech Arc' },
];

/**
 * Pre-flight project mode picker.
 * Sets the project_mode BEFORE script generation begins so the correct
 * writing pipeline (explainer vs viral vs sleep vs shorts) runs.
 */
export default function ProjectModePicker({ mode, onModeChange, arc, onArcChange, disabled }) {
  return (
    <div className="space-y-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
      <div>
        <label className="text-xs font-semibold text-blue-900 mb-1 block">
          Script Mode <span className="text-blue-600">(determines the writing style)</span>
        </label>
        <Select value={mode} onValueChange={onModeChange} disabled={disabled}>
          <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-blue-700 mt-1 leading-snug">
          {mode === 'explainer' && '✓ Teaches with structured facts, definitions, mechanisms, and worked examples. Einstein-style narrator.'}
          {mode === 'standard'  && '✓ Story-driven viral narration with hooks and cliffhangers.'}
          {mode === 'long_viral' && '✓ Sentence-driven long-form viral with high retention pacing.'}
          {mode === 'youtube_shorts' && '✓ Tight 90-second vertical script.'}
          {(mode === 'sleep_meditation' || mode === 'sleep_story') && '✓ Slow, soothing, repetitive — designed to put listeners to sleep.'}
        </p>
      </div>

      {mode === 'explainer' && (
        <div>
          <label className="text-xs font-semibold text-blue-900 mb-1 block">Einstein Arc</label>
          <Select value={arc} onValueChange={onArcChange} disabled={disabled}>
            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ARC_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}