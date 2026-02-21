import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Scissors, Save, RotateCcw } from 'lucide-react';

export default function SceneTrimmer({ scene, onSave }) {
  const original = scene?.duration_seconds || 8;
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(original);

  if (!scene) return null;

  const trimmed = Math.max(1, trimEnd - trimStart);

  const handleSave = async () => {
    await base44.entities.Scenes.update(scene.id, {
      duration_seconds: Math.round(trimmed),
    });
    onSave?.();
  };

  const handleReset = () => {
    setTrimStart(0);
    setTrimEnd(original);
  };

  return (
    <div className="bg-white border rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Scissors className="w-4 h-4 text-blue-600" />
        Trim Scene {scene.scene_number}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-500">
          <span>In: {trimStart.toFixed(1)}s</span>
          <span>Duration: {trimmed.toFixed(1)}s</span>
          <span>Out: {trimEnd.toFixed(1)}s</span>
        </div>
        <Slider
          value={[trimStart, trimEnd]}
          onValueChange={([s, e]) => { setTrimStart(s); setTrimEnd(e); }}
          min={0}
          max={original}
          step={0.5}
          className="cursor-pointer"
        />
        {/* Visual trim bar */}
        <div className="h-6 bg-gray-100 rounded relative overflow-hidden">
          <div
            className="absolute top-0 bottom-0 bg-blue-200 border-x-2 border-blue-500"
            style={{
              left: `${(trimStart / original) * 100}%`,
              width: `${(trimmed / original) * 100}%`,
            }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handleReset} className="gap-1 text-xs">
          <RotateCcw className="w-3 h-3" /> Reset
        </Button>
        <Button size="sm" onClick={handleSave} className="gap-1 text-xs bg-blue-600 hover:bg-blue-700">
          <Save className="w-3 h-3" /> Apply Trim
        </Button>
      </div>
    </div>
  );
}