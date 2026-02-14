import React from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Rewind, FastForward
} from 'lucide-react';

export default function PlaybackControls({
  isPlaying,
  onPlayPause,
  onPrevScene,
  onNextScene,
  onSeek,
  currentTime,
  totalDuration,
  volume,
  onVolumeChange,
  currentSceneNumber,
  totalScenes,
}) {
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 bg-gray-900 text-white px-4 py-2 rounded-lg">
      {/* Transport */}
      <Button
        variant="ghost"
        size="icon"
        className="text-white hover:bg-white/10 h-8 w-8"
        onClick={onPrevScene}
      >
        <SkipBack className="w-4 h-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="text-white hover:bg-white/10 h-8 w-8"
        onClick={() => onSeek(Math.max(0, currentTime - 5))}
      >
        <Rewind className="w-4 h-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="text-white hover:bg-white/20 h-9 w-9 bg-white/10 rounded-full"
        onClick={onPlayPause}
      >
        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="text-white hover:bg-white/10 h-8 w-8"
        onClick={() => onSeek(Math.min(totalDuration, currentTime + 5))}
      >
        <FastForward className="w-4 h-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="text-white hover:bg-white/10 h-8 w-8"
        onClick={onNextScene}
      >
        <SkipForward className="w-4 h-4" />
      </Button>

      {/* Time */}
      <div className="text-xs font-mono text-gray-300 min-w-[90px]">
        {formatTime(currentTime)} / {formatTime(totalDuration)}
      </div>

      {/* Scene indicator */}
      <div className="text-xs text-gray-400">
        Scene {currentSceneNumber}/{totalScenes}
      </div>

      {/* Seek slider */}
      <div className="flex-1 mx-2">
        <Slider
          value={[currentTime]}
          onValueChange={([v]) => onSeek(v)}
          min={0}
          max={totalDuration || 1}
          step={0.1}
          className="cursor-pointer"
        />
      </div>

      {/* Volume */}
      <div className="flex items-center gap-1.5 min-w-[100px]">
        <button onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)} className="hover:opacity-80">
          {volume === 0 ? <VolumeX className="w-4 h-4 text-gray-400" /> : <Volume2 className="w-4 h-4 text-gray-300" />}
        </button>
        <Slider
          value={[volume]}
          onValueChange={([v]) => onVolumeChange(v)}
          min={0}
          max={1}
          step={0.05}
          className="w-20"
        />
      </div>
    </div>
  );
}