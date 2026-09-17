import React, { useState } from 'react';
import { api } from '@/api/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2, Volume2, Wand2, Music, Play, Pause } from 'lucide-react';

export default function SceneSfxEditor({ scene, onUpdate }) {
  const [sfx, setSfx] = useState(scene.sound_effect || '');
  const [volume, setVolume] = useState(scene.sfx_volume ?? 0.5);
  const [generating, setGenerating] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [sfxError, setSfxError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [audioRef] = useState({ current: null });

  const handleSuggest = async () => {
    setGenerating(true);
    setSfxError('');
    try {
    const result = await api.integrations.Core.InvokeLLM({
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
    } catch (err) {
      // An LLM failure used to leave this button spinning with nothing said.
      setSfxError(err?.response?.data?.error || err.message || 'Could not suggest a sound effect');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!sfx) return;
    setGeneratingAudio(true);
    setSfxError('');
    try {
      const res = await api.functions.invoke('generateSoundEffect', {
        text: sfx,
        scene_id: scene.id,
      });
      const data = res.data || res;
      let audioUrl = data.audio_url;

      // Suno usually needs 30-90s, which is longer than the gateway will hold a request
      // open, so the server hands back a task id and we finish it here.
      if (!audioUrl && data.task_id) {
        for (let i = 0; i < 36 && !audioUrl; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const pollRes = await api.functions.invoke('pollSoundEffect', {
            task_id: data.task_id,
            scene_id: scene.id,
          });
          const poll = pollRes.data || pollRes;
          if (poll.status === 'ready') audioUrl = poll.audio_url;
          else if (poll.status === 'failed') throw new Error(poll.error || 'Sound effect generation failed');
        }
        if (!audioUrl) throw new Error('The sound effect is taking longer than usual. Try again in a moment.');
      }

      if (!audioUrl) throw new Error('No audio came back from the sound effect provider.');

      await api.entities.Scenes.update(scene.id, {
        sound_effect: sfx,
        sound_effect_url: audioUrl,
        sfx_volume: volume,
      });
      onUpdate?.();
    } catch (err) {
      // Without this the spinner ran forever and the button stayed disabled.
      setSfxError(err?.response?.data?.error || err.message || 'Sound effect failed');
    } finally {
      setGeneratingAudio(false);
    }
  };

  const handleSave = async () => {
    await api.entities.Scenes.update(scene.id, {
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
      {sfxError && (
        <p className="text-[10px] text-red-600 mt-1">{sfxError}</p>
      )}
    </div>
  );
}