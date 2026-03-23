import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Mic, Music, Volume2, VolumeX } from 'lucide-react';

export default function AudioVolumePanel({
  voiceoverUrl, voiceoverVol, onVoiceoverVolChange,
  musicUrl, musicVol, onMusicVolChange,
  musicTitle
}) {
  return (
    <div className="h-full flex flex-col p-3 space-y-4 overflow-y-auto">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Audio Mix</p>

      {/* Voiceover Volume */}
      <div className="p-3 bg-indigo-900/30 rounded-lg border border-indigo-700/40 space-y-3">
        <div className="flex items-center gap-2">
          <Mic size={14} className="text-indigo-400" />
          <span className="text-xs text-indigo-300 font-medium">Voiceover</span>
          <span className="ml-auto text-[10px] text-indigo-400 font-mono">{Math.round(voiceoverVol * 100)}%</span>
        </div>
        {voiceoverUrl ? (
          <>
            <Slider
              value={[voiceoverVol]}
              onValueChange={([v]) => onVoiceoverVolChange(v)}
              min={0} max={1} step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-[9px] text-gray-600">
              <span>Mute</span><span>Full</span>
            </div>
          </>
        ) : (
          <p className="text-[10px] text-gray-500">No voiceover loaded</p>
        )}
      </div>

      {/* Music Volume */}
      <div className="p-3 bg-purple-900/30 rounded-lg border border-purple-700/40 space-y-3">
        <div className="flex items-center gap-2">
          <Music size={14} className="text-purple-400" />
          <span className="text-xs text-purple-300 font-medium">Background Music</span>
          <span className="ml-auto text-[10px] text-purple-400 font-mono">{Math.round(musicVol * 100)}%</span>
        </div>
        {musicUrl ? (
          <>
            <p className="text-[10px] text-purple-300/70 truncate">{musicTitle || 'Selected track'}</p>
            <Slider
              value={[musicVol]}
              onValueChange={([v]) => onMusicVolChange(v)}
              min={0} max={1} step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-[9px] text-gray-600">
              <span>Mute</span><span>Full</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[0.1, 0.2, 0.3, 0.5].map(v => (
                <button key={v} onClick={() => onMusicVolChange(v)}
                  className={`py-1 rounded text-[9px] font-mono ${Math.abs(musicVol - v) < 0.03 ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  {Math.round(v * 100)}%
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[10px] text-gray-500">No music track selected. Generate music in Content Generation.</p>
        )}
      </div>

      {/* Tips */}
      <div className="p-2 bg-gray-800/50 rounded border border-gray-700/50">
        <p className="text-[10px] text-gray-500 leading-relaxed">
          <strong className="text-gray-400">Tip:</strong> Keep music at 10-30% for narration-heavy videos. 
          Adjust voiceover volume if the audio is too loud or quiet relative to music.
        </p>
      </div>
    </div>
  );
}