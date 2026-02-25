import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Scissors, Trash2, ScissorsLineDashed,
  Undo2, ScanSearch, ChevronDown, ChevronUp,
  Film, Mic, Music, Volume2, Wand2, ZoomIn, ZoomOut
} from 'lucide-react';

const TRACK_INFO = {
  video: { label: 'Video', icon: Film, color: 'text-purple-400' },
  voiceover: { label: 'VO', icon: Mic, color: 'text-blue-400' },
  music: { label: 'Music', icon: Music, color: 'text-green-400' },
  sfx: { label: 'SFX', icon: Volume2, color: 'text-amber-400' },
};

export default function TimelineToolbar({
  activeTrack,
  hasSelection,
  onCut,
  onTrim,
  onSplit,
  onDelete,
  onUndo,
  canUndo,
  onDetectSilence,
  onGenerateSfx,
  collapsedTracks,
  onToggleCollapse,
  pixelsPerSecond,
  onZoomIn,
  onZoomOut,
}) {
  const trackInfo = activeTrack ? TRACK_INFO[activeTrack] : null;

  return (
    <div className="flex items-center gap-1 px-3 py-1 bg-[#16162e] border-b border-gray-700/50 flex-wrap">
      {/* Active track indicator */}
      <div className="flex items-center gap-1.5 mr-2">
        <span className="text-[9px] text-gray-600 uppercase tracking-wider">Edit:</span>
        {trackInfo ? (
          <span className={`text-[10px] font-semibold ${trackInfo.color} flex items-center gap-1`}>
            <trackInfo.icon className="w-3 h-3" />
            {trackInfo.label}
          </span>
        ) : (
          <span className="text-[10px] text-gray-500">Select a track</span>
        )}
      </div>

      <div className="w-px h-4 bg-gray-700" />

      {/* Edit actions */}
      <Button
        size="sm" variant="ghost"
        className="text-red-400 hover:bg-red-500/10 gap-1 text-[10px] h-6 px-2"
        onClick={onCut}
        disabled={!hasSelection}
        title="Cut selection (remove)"
      >
        <Scissors className="w-3 h-3" /> Cut
      </Button>
      <Button
        size="sm" variant="ghost"
        className="text-amber-400 hover:bg-amber-500/10 gap-1 text-[10px] h-6 px-2"
        onClick={onTrim}
        disabled={!hasSelection}
        title="Trim to selection (keep only selected)"
      >
        <Crop className="w-3 h-3" /> Trim
      </Button>
      <Button
        size="sm" variant="ghost"
        className="text-cyan-400 hover:bg-cyan-500/10 gap-1 text-[10px] h-6 px-2"
        onClick={onSplit}
        disabled={!activeTrack}
        title="Split at playhead"
      >
        <Columns className="w-3 h-3" /> Split
      </Button>
      <Button
        size="sm" variant="ghost"
        className="text-gray-400 hover:bg-white/10 gap-1 text-[10px] h-6 px-2"
        onClick={onDelete}
        disabled={!hasSelection}
        title="Delete selection"
      >
        <Trash2 className="w-3 h-3" /> Delete
      </Button>

      <div className="w-px h-4 bg-gray-700" />

      {/* Silence detect (for VO) */}
      {(activeTrack === 'voiceover') && (
        <Button
          size="sm" variant="ghost"
          className="text-cyan-400 hover:bg-cyan-500/10 gap-1 text-[10px] h-6 px-2"
          onClick={onDetectSilence}
          title="Detect silent regions"
        >
          <ScanSearch className="w-3 h-3" /> Silence
        </Button>
      )}

      {/* SFX generate (for SFX track) */}
      {(activeTrack === 'sfx') && (
        <Button
          size="sm" variant="ghost"
          className="text-amber-400 hover:bg-amber-500/10 gap-1 text-[10px] h-6 px-2"
          onClick={onGenerateSfx}
          title="Generate sound effect for current scene"
        >
          <Wand2 className="w-3 h-3" /> Generate SFX
        </Button>
      )}

      <Button
        size="sm" variant="ghost"
        className="text-gray-400 hover:bg-white/10 gap-1 text-[10px] h-6 px-2"
        onClick={onUndo}
        disabled={!canUndo}
      >
        <Undo2 className="w-3 h-3" /> Undo
      </Button>

      <div className="flex-1" />

      {/* Collapse toggles */}
      <div className="flex items-center gap-0.5 mr-2">
        {Object.entries(TRACK_INFO).map(([key, info]) => {
          const collapsed = collapsedTracks?.[key];
          return (
            <button
              key={key}
              onClick={() => onToggleCollapse(key)}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                collapsed ? 'text-gray-600 bg-transparent hover:bg-white/5' : `${info.color} bg-white/5 hover:bg-white/10`
              }`}
              title={`${collapsed ? 'Expand' : 'Collapse'} ${info.label} track`}
            >
              <info.icon className="w-2.5 h-2.5" />
              {collapsed ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronUp className="w-2.5 h-2.5" />}
            </button>
          );
        })}
      </div>

      <div className="w-px h-4 bg-gray-700" />

      {/* Zoom */}
      <div className="flex items-center gap-0.5">
        <button onClick={onZoomOut} className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center">
          <ZoomOut className="w-3 h-3 text-gray-400" />
        </button>
        <span className="text-[8px] text-gray-500 w-4 text-center">{pixelsPerSecond}</span>
        <button onClick={onZoomIn} className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center">
          <ZoomIn className="w-3 h-3 text-gray-400" />
        </button>
      </div>
    </div>
  );
}