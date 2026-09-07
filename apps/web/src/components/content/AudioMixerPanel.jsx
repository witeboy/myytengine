import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Mic, Music, Sparkles } from 'lucide-react';

export default function AudioMixerPanel({ narrationVolume, musicVolume, sfxVolume, onChange }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Audio Levels</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Narration */}
        <div className="flex items-center gap-3">
          <Mic className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium">Narration</span>
              <span className="text-gray-400">{Math.round(narrationVolume * 100)}%</span>
            </div>
            <Slider
              value={[narrationVolume]}
              onValueChange={([v]) => onChange({ narration: v })}
              min={0} max={1} step={0.05}
            />
          </div>
        </div>

        {/* Music */}
        <div className="flex items-center gap-3">
          <Music className="w-4 h-4 text-purple-600 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium">Background Music</span>
              <span className="text-gray-400">{Math.round(musicVolume * 100)}%</span>
            </div>
            <Slider
              value={[musicVolume]}
              onValueChange={([v]) => onChange({ music: v })}
              min={0} max={1} step={0.05}
            />
          </div>
        </div>

        {/* SFX */}
        <div className="flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-yellow-600 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium">Sound Effects</span>
              <span className="text-gray-400">{Math.round(sfxVolume * 100)}%</span>
            </div>
            <Slider
              value={[sfxVolume]}
              onValueChange={([v]) => onChange({ sfx: v })}
              min={0} max={1} step={0.05}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}