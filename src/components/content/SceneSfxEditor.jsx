import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2, Volume2, Wand2 } from 'lucide-react';

export default function SceneSfxEditor({ scene, onUpdate }) {
  const [sfx, setSfx] = useState(scene.sound_effect || '');
  const [volume, setVolume] = useState(scene.sfx_volume ?? 0.5);
  const [generating, setGenerating] = useState(false);

  const handleSuggest = async () => {
    setGenerating(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Suggest a brief sound effect description for this video scene narration: "${scene.narration_text}". 
Return just the sound effect description, like "thunder rumble", "crowd murmur", "door creaking". Keep it under 8 words. Return JSON: { "sfx": "description" }`,
      response_json_schema: {
        type: "object",
        properties: { sfx: { type: "string" } }
      }
    });
    if (result?.sfx) setSfx(result.sfx);
    setGenerating(false);
  };

  const handleSave = async () => {
    await base44.entities.Scenes.update(scene.id, {
      sound_effect: sfx,
      sfx_volume: volume,
    });
    onUpdate?.();
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Input
          value={sfx}
          onChange={(e) => setSfx(e.target.value)}
          placeholder="Sound effect..."
          className="text-xs h-8 flex-1"
        />
        <Button size="sm" variant="outline" className="h-8 px-2" onClick={handleSuggest} disabled={generating}>
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
        </Button>
      </div>
      {sfx && (
        <div className="flex items-center gap-2">
          <Volume2 className="w-3 h-3 text-gray-400" />
          <Slider value={[volume]} onValueChange={([v]) => setVolume(v)} min={0} max={1} step={0.05} className="flex-1" />
          <span className="text-[10px] text-gray-400 w-7">{Math.round(volume * 100)}%</span>
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={handleSave}>Save</Button>
        </div>
      )}
    </div>
  );
}