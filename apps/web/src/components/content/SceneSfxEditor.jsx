import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2, Volume2, Wand2, Music, Play, Pause } from 'lucide-react';

export default function SceneSfxEditor({ scene, onUpdate }) {
  const [sfx, setSfx] = useState(scene.sound_effect || '');
  const [volume, setVolume] = useState(scene.sfx_volume ?? 0.5);
  const [generating, setGenerating] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioRef] = useState({ current: null });

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

  const handleGenerateAudio = async () => {
    if (!sfx) return;
    setGeneratingAudio(true);
    const res = await base44.functions.invoke('generateSoundEffect', {
      text: sfx,
      scene_id: scene.id,
    });
    if (res.data?.audio_url) {
      await base44.entities.Scenes.update(scene.id, {
        sound_effect: sfx,
        sound_effect_url: res.data.audio_url,
        sfx_volume: volume,
      });
      onUpdate?.();
    }
    setGeneratingAudio(false);
  };

  const handleSave = async () => {
    await base44.entities.Scenes.update(scene.id, {
      sound_effect: sfx,
      sfx_volume: volume,
    });
    onUpdate?.();
  };

  const togglePlay = () => {
    if (!scene.sound_effect_url) return;
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(scene.sound_effect_url);
      audio.volume = volume;
      audio.onended = () => setPlaying(false);
      audio.play();
      audioRef.current = audio;
      setPlaying(true);
    }
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
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Volume2 className="w-3 h-3 text-gray-400" />
            <Slider value={[volume]} onValueChange={([v]) => setVolume(v)} min={0} max={1} step={0.05} className="flex-1" />
            <span className="text-[10px] text-gray-400 w-7">{Math.round(volume * 100)}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={handleSave}>Save</Button>
            <Button size="sm" variant="default" className="h-6 text-[10px] px-2 gap-1" onClick={handleGenerateAudio} disabled={generatingAudio}>
              {generatingAudio ? <Loader2 className="w-3 h-3 animate-spin" /> : <Music className="w-3 h-3" />}
              Generate Audio
            </Button>
            {scene.sound_effect_url && (
              <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={togglePlay}>
                {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}