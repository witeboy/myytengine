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
      prompt: `You are an expert foley artist. Given this scene narration, suggest the single BEST minimal sound effect that would make this scene feel real and immersive.

NARRATION: "${scene.narration_text}"

RULES:
- Only suggest a sound effect if it would genuinely enhance the scene. If the scene is purely dialogue/narration with no physical action, return "none"
- Be SPECIFIC and REALISTIC: "pen writing on paper", "phone notification ding", "wooden door creaking open", "knife chopping vegetables", "gentle breeze through leaves", "bed frame squeaking", "coffee being poured into mug"
- Keep it under 6 words
- Focus on the single most impactful sound, not multiple
- Think about what sound the VIEWER would expect to hear in this moment

Return JSON: { "sfx": "description", "needed": true/false }`,
      response_json_schema: {
        type: "object",
        properties: { 
          sfx: { type: "string" },
          needed: { type: "boolean" }
        }
      }
    });
    if (result?.needed && result?.sfx && result.sfx !== 'none') {
      setSfx(result.sfx);
    } else {
      setSfx('');
    }
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