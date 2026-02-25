import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Wand2, Music, X } from 'lucide-react';

export default function SfxGenerateDialog({ scene, onGenerated, onClose }) {
  const [sfxText, setSfxText] = useState(scene?.sound_effect || '');
  const [suggesting, setSuggesting] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleSuggest = async () => {
    if (!scene?.narration_text) return;
    setSuggesting(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an expert foley artist. Given this scene narration, suggest the BEST minimal sound effect.
NARRATION: "${scene.narration_text}"
Keep it under 6 words. Return JSON: { "sfx": "description" }`,
      response_json_schema: {
        type: "object",
        properties: { sfx: { type: "string" } }
      }
    });
    if (result?.sfx) setSfxText(result.sfx);
    setSuggesting(false);
  };

  const handleGenerate = async () => {
    if (!sfxText) return;
    setGenerating(true);
    const res = await base44.functions.invoke('generateSoundEffect', {
      text: sfxText,
      scene_id: scene.id,
    });
    if (res.data?.audio_url) {
      await base44.entities.Scenes.update(scene.id, {
        sound_effect: sfxText,
        sound_effect_url: res.data.audio_url,
      });
      onGenerated?.();
    }
    setGenerating(false);
    onClose?.();
  };

  return (
    <div className="absolute bottom-full left-0 mb-1 z-50 bg-[#1a1a2e] border border-gray-600 rounded-lg p-3 shadow-xl w-72">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-amber-400">Generate SFX — S{scene?.scene_number}</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="flex gap-1 mb-2">
        <Input
          value={sfxText}
          onChange={(e) => setSfxText(e.target.value)}
          placeholder="e.g. door creaking open..."
          className="text-xs h-7 flex-1 bg-[#0d0d1a] border-gray-600"
        />
        <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleSuggest} disabled={suggesting}>
          {suggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
        </Button>
      </div>
      <Button size="sm" className="w-full h-7 text-xs bg-amber-600 hover:bg-amber-700 gap-1" onClick={handleGenerate} disabled={generating || !sfxText}>
        {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Music className="w-3 h-3" />}
        Generate SFX
      </Button>
    </div>
  );
}