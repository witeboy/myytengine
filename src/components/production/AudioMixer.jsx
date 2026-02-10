import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Volume2, Music } from 'lucide-react';

export default function AudioMixer({ 
  voiceoverUrl, 
  voiceoverVolume = 1, 
  onVoiceoverVolumeChange,
  backgroundMusicUrl = null,
  backgroundMusicVolume = 0.5,
  onBackgroundMusicVolumeChange
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = React.useRef(null);

  const handlePlayPreview = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="w-5 h-5" />
          Audio Mixing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Voiceover Volume */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <label className="text-sm font-medium">Voiceover Volume</label>
            <span className="text-xs text-gray-600">{Math.round(voiceoverVolume * 100)}%</span>
          </div>
          <Slider
            value={[voiceoverVolume]}
            onValueChange={(value) => onVoiceoverVolumeChange(value[0])}
            min={0}
            max={1}
            step={0.01}
            className="w-full"
          />
        </div>

        {/* Background Music Volume (if available) */}
        {backgroundMusicUrl && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                <Music className="w-4 h-4" />
                Background Music
              </label>
              <span className="text-xs text-gray-600">{Math.round(backgroundMusicVolume * 100)}%</span>
            </div>
            <Slider
              value={[backgroundMusicVolume]}
              onValueChange={(value) => onBackgroundMusicVolumeChange(value[0])}
              min={0}
              max={1}
              step={0.01}
              className="w-full"
            />
          </div>
        )}

        {/* Audio Preview */}
        {voiceoverUrl && (
          <div className="border-t pt-4">
            <Button
              onClick={handlePlayPreview}
              variant="outline"
              className="w-full"
            >
              {isPlaying ? 'Stop Preview' : 'Play Audio Preview'}
            </Button>
            <audio
              ref={audioRef}
              src={voiceoverUrl}
              volume={voiceoverVolume}
              onEnded={() => setIsPlaying(false)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}