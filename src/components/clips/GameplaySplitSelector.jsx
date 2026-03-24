import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Gamepad2, SplitSquareVertical } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// GAMEPLAY OPTIONS — Pre-loaded gameplay video URLs
// Users must provide their own royalty-free gameplay clips.
// These are loaded into FFmpeg.wasm as the bottom split overlay.
// ══════════════════════════════════════════════════════════════════
export const GAMEPLAY_OPTIONS = [
  {
    id: 'subway_surfers',
    name: 'Subway Surfers',
    description: 'Classic runner — highest retention',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
  },
  {
    id: 'minecraft_parkour',
    name: 'Minecraft Parkour',
    description: 'Block jumping — clean aesthetic',
    color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  },
  {
    id: 'satisfying',
    name: 'Satisfying Clips',
    description: 'Slime, sand, soap — ASMR appeal',
    color: 'bg-pink-50 border-pink-200 text-pink-700',
  },
  {
    id: 'gta_driving',
    name: 'GTA Driving',
    description: 'Highway cruising — chill vibe',
    color: 'bg-amber-50 border-amber-200 text-amber-700',
  },
  {
    id: 'custom',
    name: 'Custom Upload',
    description: 'Your own gameplay clip',
    color: 'bg-gray-50 border-gray-200 text-gray-700',
  },
];

export default function GameplaySplitSelector({
  enabled,
  onEnabledChange,
  selectedGameplay,
  onSelectGameplay,
  splitRatio = 65,
  onSplitRatioChange,
  onGameplayFileSelect,
}) {

  return (
    <div className="space-y-3">
      {/* Enable toggle */}
      <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
        <div className="flex items-center gap-2">
          <SplitSquareVertical className="w-4 h-4 text-gray-500" />
          <div>
            <p className="text-xs font-medium text-gray-900">Gameplay bottom split</p>
            <p className="text-[10px] text-gray-400">Speaker top + gameplay bottom for retention</p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>

      {enabled && (
        <>
          {/* Gameplay picker */}
          <div className="grid grid-cols-2 gap-2">
            {GAMEPLAY_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => onSelectGameplay?.(opt.id)}
                className={`text-left p-2.5 rounded-lg border transition-all ${
                  selectedGameplay === opt.id
                    ? `${opt.color} ring-1 ring-offset-1`
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Gamepad2 className="w-3 h-3" />
                  <span className="text-xs font-medium">{opt.name}</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">{opt.description}</p>
              </button>
            ))}
          </div>

          {/* Custom file upload */}
          {selectedGameplay === 'custom' && (
            <div>
              <input
                type="file"
                accept="video/*"
                className="text-xs file:mr-2 file:py-1 file:px-3 file:rounded-md file:border file:border-gray-200 file:text-xs file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onGameplayFileSelect?.(file);
                }}
              />
            </div>
          )}

          {/* Split ratio slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Speaker / gameplay split</span>
              <span className="text-xs font-mono text-gray-700">{splitRatio}% / {100 - splitRatio}%</span>
            </div>
            <Slider
              value={[splitRatio]}
              onValueChange={([v]) => onSplitRatioChange?.(v)}
              min={50} max={80} step={5}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>50/50</span><span>65/35</span><span>80/20</span>
            </div>
          </div>

          {/* Visual preview of split */}
          <div className="rounded-lg border border-gray-200 overflow-hidden" style={{ height: 120 }}>
            <div
              className="bg-gray-800 flex items-center justify-center text-[10px] text-white/60"
              style={{ height: `${splitRatio}%` }}
            >
              Speaker ({splitRatio}%)
            </div>
            <div
              className="bg-gradient-to-b from-blue-500 to-blue-700 flex items-center justify-center text-[10px] text-white/80 border-t border-white/20"
              style={{ height: `${100 - splitRatio}%` }}
            >
              Gameplay ({100 - splitRatio}%)
            </div>
          </div>

          <p className="text-[10px] text-gray-400">
            Upload a 60s+ gameplay clip. It loops behind the speaker. Proven to boost retention 15-30% on brainrot/reaction content.
          </p>
        </>
      )}
    </div>
  );
}
