import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Volume2, VolumeX, Music, Mic, Save, Loader2 } from 'lucide-react';

export default function AudioMixerTimeline({
  prodSettings,
  selectedMusic,
  scenes,
  onRefetch,
}) {
  const [voVol, setVoVol] = useState(1.0);
  const [musicVol, setMusicVol] = useState(selectedMusic?.volume ?? 0.3);
  const [saving, setSaving] = useState(false);

  // Per-scene SFX volumes
  const scenesWithSfx = (scenes || []).filter(s => s.sound_effect_url);
  const [sfxVols, setSfxVols] = useState(() => {
    const m = {};
    scenesWithSfx.forEach(s => { m[s.id] = s.sfx_volume ?? 0.5; });
    return m;
  });

  const handleSaveAll = async () => {
    setSaving(true);
    const promises = [];

    // Save music volume
    if (selectedMusic) {
      promises.push(
        base44.entities.MusicTracks.update(selectedMusic.id, { volume: musicVol })
      );
    }

    // Save per-scene SFX volumes
    for (const s of scenesWithSfx) {
      if (sfxVols[s.id] !== (s.sfx_volume ?? 0.5)) {
        promises.push(
          base44.entities.Scenes.update(s.id, { sfx_volume: sfxVols[s.id] })
        );
      }
    }

    await Promise.all(promises);
    onRefetch?.();
    setSaving(false);
  };

  return (
    <div className="bg-white border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-blue-600" /> Audio Mixer
        </h3>
        <Button size="sm" onClick={handleSaveAll} disabled={saving} className="gap-1 text-xs">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save Levels
        </Button>
      </div>

      {/* Voiceover */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-gray-700">
            <Mic className="w-3.5 h-3.5 text-blue-500" /> Voiceover
          </span>
          <span className="text-gray-400">{Math.round(voVol * 100)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setVoVol(voVol > 0 ? 0 : 1)}>
            {voVol === 0 ? <VolumeX className="w-3.5 h-3.5 text-gray-400" /> : <Volume2 className="w-3.5 h-3.5 text-blue-500" />}
          </button>
          <Slider value={[voVol]} onValueChange={([v]) => setVoVol(v)} min={0} max={1} step={0.05} className="flex-1" />
          <div className="w-8 h-3 bg-gray-100 rounded overflow-hidden">
            <div className="h-full bg-blue-400 transition-all" style={{ width: `${voVol * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Background Music */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-gray-700">
            <Music className="w-3.5 h-3.5 text-green-500" /> Background Music
          </span>
          <span className="text-gray-400">{Math.round(musicVol * 100)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMusicVol(musicVol > 0 ? 0 : 0.3)}>
            {musicVol === 0 ? <VolumeX className="w-3.5 h-3.5 text-gray-400" /> : <Volume2 className="w-3.5 h-3.5 text-green-500" />}
          </button>
          <Slider value={[musicVol]} onValueChange={([v]) => setMusicVol(v)} min={0} max={1} step={0.05} className="flex-1" />
          <div className="w-8 h-3 bg-gray-100 rounded overflow-hidden">
            <div className="h-full bg-green-400 transition-all" style={{ width: `${musicVol * 100}%` }} />
          </div>
        </div>
        {!selectedMusic && <p className="text-[10px] text-gray-400">No music track selected</p>}
      </div>

      {/* Per-scene SFX */}
      {scenesWithSfx.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">Sound Effects</p>
          {scenesWithSfx.map(s => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 w-10 flex-shrink-0">S{s.scene_number}</span>
              <Slider
                value={[sfxVols[s.id] ?? 0.5]}
                onValueChange={([v]) => setSfxVols(prev => ({ ...prev, [s.id]: v }))}
                min={0} max={1} step={0.05}
                className="flex-1"
              />
              <span className="text-[10px] text-gray-400 w-8">{Math.round((sfxVols[s.id] ?? 0.5) * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}