import React, { useState, useRef } from 'react';
import { Loader2, Zap } from 'lucide-react';

export default function TimelineTrack({ scenes, pixelsPerSecond, selectedScene, onSelectScene, onUpdateDuration, onTransitionClick }) {
  const [resizing, setResizing] = useState(null);
  const startXRef = useRef(0);
  const startDurRef = useRef(0);

  const handleResizeStart = (e, scene) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing(scene.id);
    startXRef.current = e.clientX;
    startDurRef.current = scene.duration_seconds;

    const handleMove = (ev) => {
      const dx = ev.clientX - startXRef.current;
      const dSec = dx / pixelsPerSecond;
      const newDur = Math.max(2, Math.round((startDurRef.current + dSec) * 2) / 2);
      onUpdateDuration(scene.id, newDur);
    };

    const handleUp = () => {
      setResizing(null);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  const TRANSITION_ICONS = {
    fade: '🌑',
    dissolve: '💫',
    zoom: '🔍',
    wipe: '➡️',
    slide: '📱',
  };

  return (
    <div className="flex-1 h-20 relative bg-gray-950">
      {scenes.map((scene, idx) => {
        const width = scene.duration_seconds * pixelsPerSecond;
        const left = scene.start_time * pixelsPerSecond;
        const isSelected = selectedScene === scene.id;
        const hasImage = scene.image_url && scene.image_url.startsWith('http');
        const hasVideo = scene.video_url && scene.video_url.startsWith('http');
        const isPendingVideo = scene.video_url?.startsWith('grok_vid_task:') || scene.video_url?.startsWith('veo_task:');
        const mediaSrc = hasVideo ? scene.video_url : hasImage ? scene.image_url : null;
        const transition = scene.transition_type;
        const isResizing = resizing === scene.id;

        return (
          <React.Fragment key={scene.id}>
            <div
              data-scene-block="true"
              className={`absolute top-1 bottom-1 rounded cursor-pointer transition-all overflow-hidden group ${
                isSelected ? 'ring-2 ring-white z-10' : ''
              } ${isResizing ? 'z-20 ring-2 ring-yellow-400' : ''}`}
              style={{ left, width: Math.max(width, 24) }}
              onClick={(e) => { onSelectScene(scene.id); }}
            >
              {/* Background: image or video thumbnail or gradient */}
              {mediaSrc ? (
                hasVideo ? (
                  <video src={mediaSrc} className="absolute inset-0 w-full h-full object-cover" muted playsInline preload="metadata" />
                ) : (
                  <img src={mediaSrc} className="absolute inset-0 w-full h-full object-cover" alt="" draggable={false} />
                )
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-800" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

              {/* Scene info */}
              <div className="absolute bottom-0 left-0 right-0 px-1.5 pb-0.5">
                <p className="text-[9px] font-bold text-white drop-shadow-lg truncate">S{scene.scene_number}</p>
                <p className="text-[8px] text-gray-300">{scene.duration_seconds}s</p>
              </div>

              {/* Status indicator */}
              <div className="absolute top-0.5 left-0.5 flex items-center gap-0.5">
                {isPendingVideo ? (
                  <Loader2 className="w-2.5 h-2.5 text-amber-400 animate-spin" />
                ) : (
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    hasVideo ? 'bg-purple-400' : hasImage ? 'bg-emerald-400' : 'bg-gray-500'
                  }`} />
                )}
              </div>

              {/* Media type badge */}
              {(hasVideo || hasImage) && (
                <div className="absolute top-0.5 right-0.5">
                  <span className={`text-[7px] font-bold px-1 py-px rounded ${
                    hasVideo ? 'bg-purple-500/70 text-white' : 'bg-emerald-500/70 text-white'
                  }`}>
                    {hasVideo ? 'VID' : 'IMG'}
                  </span>
                </div>
              )}

              {/* Resize handle */}
              <div
                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-transparent hover:bg-white/20"
                onMouseDown={(e) => handleResizeStart(e, scene)}
              />
            </div>

            {/* Transition button between scenes */}
            {idx < scenes.length - 1 && (
              <button
                className={`absolute z-10 flex items-center justify-center transition-all hover:scale-125 ${
                  transition && transition !== 'cut'
                    ? 'w-5 h-5 bg-blue-600 rounded-full border border-blue-400 shadow-lg shadow-blue-500/30'
                    : 'w-4 h-4 bg-gray-700 rounded-full border border-gray-500 hover:bg-gray-600 opacity-50 hover:opacity-100'
                }`}
                style={{
                  left: left + width - 2,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onTransitionClick?.(scene, scenes[idx + 1]);
                }}
                title={transition && transition !== 'cut' ? `${transition} ${scene.transition_duration || 0.5}s` : 'Add transition'}
              >
                {transition && transition !== 'cut' ? (
                  <span className="text-[8px]">{TRANSITION_ICONS[transition] || '✨'}</span>
                ) : (
                  <span className="text-[7px] text-gray-400">+</span>
                )}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}