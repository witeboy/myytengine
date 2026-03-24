import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Shield, Gauge, Music2, FlipHorizontal, Palette } from 'lucide-react';
import { VISUAL_FILTERS, COPYRIGHT_PRESETS } from '@/lib/exportEnhancedClip';

export default function CopyrightShield({
  speed, onSpeedChange,
  pitchShift, onPitchChange,
  mirror, onMirrorChange,
  visualFilter, onVisualFilterChange,
  preset, onPresetChange,
}) {

  const applyPreset = (key) => {
    const p = COPYRIGHT_PRESETS[key];
    if (!p) return;
    onPresetChange?.(key);
    onSpeedChange?.(p.speed);
    onPitchChange?.(p.pitchShift);
    onMirrorChange?.(p.mirror);
  };

  return (
    <div className="space-y-3">
      {/* Preset buttons */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-medium text-gray-700">Copyright prevention level</span>
        </div>
        <div className="flex gap-1.5">
          {Object.entries(COPYRIGHT_PRESETS).map(([key, p]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                preset === key
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Speed slider */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Gauge className="w-3 h-3" /> Speed
          </span>
          <span className="text-xs font-mono text-gray-700">{speed?.toFixed(2)}x</span>
        </div>
        <Slider
          value={[Math.round((speed || 1) * 100)]}
          onValueChange={([v]) => onSpeedChange?.(v / 100)}
          min={95} max={115} step={1}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
          <span>0.95x</span><span>1.0x</span><span>1.15x</span>
        </div>
      </div>

      {/* Pitch slider */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Music2 className="w-3 h-3" /> Voice pitch shift
          </span>
          <span className="text-xs font-mono text-gray-700">
            {pitchShift > 0 ? '+' : ''}{pitchShift?.toFixed(1)} semitones
          </span>
        </div>
        <Slider
          value={[Math.round((pitchShift || 0) * 10)]}
          onValueChange={([v]) => onPitchChange?.(v / 10)}
          min={-20} max={20} step={1}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
          <span>-2.0 (deeper)</span><span>0</span><span>+2.0 (higher)</span>
        </div>
      </div>

      {/* Mirror flip */}
      <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
        <span className="text-xs text-gray-700 flex items-center gap-1.5">
          <FlipHorizontal className="w-3.5 h-3.5 text-gray-500" />
          Horizontal mirror flip
        </span>
        <Switch checked={mirror || false} onCheckedChange={onMirrorChange} />
      </div>

      {/* Visual filter */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Palette className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-medium text-gray-700">Visual filter</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {Object.entries(VISUAL_FILTERS).map(([key, f]) => (
            <button
              key={key}
              onClick={() => onVisualFilterChange?.(key)}
              className={`px-2 py-1.5 rounded-md text-[11px] font-medium border transition-all ${
                visualFilter === key
                  ? 'border-purple-400 bg-purple-50 text-purple-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active changes summary */}
      {(speed !== 1.0 || pitchShift !== 0 || mirror || visualFilter !== 'none') && (
        <div className="flex flex-wrap gap-1 pt-1">
          {speed !== 1.0 && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">{speed?.toFixed(2)}x speed</Badge>}
          {pitchShift !== 0 && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">{pitchShift > 0 ? '+' : ''}{pitchShift?.toFixed(1)} pitch</Badge>}
          {mirror && <Badge variant="outline" className="text-[10px] bg-pink-50 text-pink-700 border-pink-200">Mirrored</Badge>}
          {visualFilter !== 'none' && <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">{VISUAL_FILTERS[visualFilter]?.label}</Badge>}
        </div>
      )}
    </div>
  );
}
