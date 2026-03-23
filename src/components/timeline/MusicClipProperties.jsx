import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Music, Copy, Trash2, Scissors, Volume2 } from 'lucide-react';

export default function MusicClipProperties({ clip, onUpdate, onDelete, onDuplicate, onSplit, currentTime }) {
  if (!clip) return <div className="h-full flex items-center justify-center text-xs text-gray-500">Select a music clip</div>;
  const u = (k, v) => onUpdate({ ...clip, [k]: v });
  const canSplit = currentTime > clip.startTime && currentTime < clip.startTime + clip.duration;

  return (
    <div className="h-full flex flex-col bg-[#12121f] p-3 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white flex items-center gap-2">
          <Music size={14} className="text-purple-400" /> Music Clip
        </span>
        <div className="flex gap-1">
          <button onClick={onDuplicate} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded" title="Duplicate"><Copy size={14} /></button>
          <button onClick={onDelete} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded" title="Delete"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="p-2 bg-purple-900/30 rounded border border-purple-700/40">
        <p className="text-[10px] text-purple-300 truncate">{clip.label}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Start Time</label>
          <Input type="number" step="0.1" value={clip.startTime?.toFixed(1)}
            onChange={e => u('startTime', Math.max(0, parseFloat(e.target.value) || 0))}
            className="h-8 text-xs bg-gray-800 border-gray-700 text-white" />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Duration</label>
          <Input type="number" step="0.1" value={clip.duration?.toFixed(1)}
            onChange={e => u('duration', Math.max(0.5, parseFloat(e.target.value) || 1))}
            className="h-8 text-xs bg-gray-800 border-gray-700 text-white" />
        </div>
      </div>

      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Source Offset: {(clip.sourceOffset || 0).toFixed(1)}s</label>
        <p className="text-[9px] text-gray-500">Where in the audio file this clip starts from</p>
        <Input type="number" step="0.5" value={(clip.sourceOffset || 0).toFixed(1)}
          onChange={e => u('sourceOffset', Math.max(0, parseFloat(e.target.value) || 0))}
          className="h-8 text-xs bg-gray-800 border-gray-700 text-white mt-1" />
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Volume2 size={12} className="text-purple-400" />
          <label className="text-[10px] text-gray-400">Volume: {Math.round((clip.volume ?? 0.3) * 100)}%</label>
        </div>
        <Slider value={[clip.volume ?? 0.3]} onValueChange={([v]) => u('volume', v)} min={0} max={1} step={0.05} />
      </div>

      {canSplit && (
        <Button onClick={onSplit} variant="outline" size="sm" className="w-full gap-2 border-purple-700 text-purple-300 hover:bg-purple-900/40">
          <Scissors size={14} /> Split at Playhead
        </Button>
      )}

      <div className="p-2 bg-gray-800/50 rounded border border-gray-700/50">
        <p className="text-[10px] text-gray-500 leading-relaxed">
          Drag to reposition, resize handles to trim, split to cut at playhead, duplicate to copy segments.
        </p>
      </div>
    </div>
  );
}