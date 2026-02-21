import React, { useState, useRef } from 'react';

export default function TimelineTrack({ scenes, pixelsPerSecond, selectedScene, onSelectScene, onUpdateDuration }) {
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

  return (
    <div className="flex-1 h-24 relative bg-gray-950">
      {scenes.map((scene, idx) => {
        const width = scene.duration_seconds * pixelsPerSecond;
        const left = scene.start_time * pixelsPerSecond;
        const isSelected = selectedScene === scene.id;
        const hasImage = scene.image_url && scene.image_url.startsWith('http');
        const hasVideo = scene.video_url && scene.video_url.startsWith('http');
        const mediaSrc = hasVideo ? scene.video_url : hasImage ? scene.image_url : null;
        const transition = scene.transition_type;
        const isResizing = resizing === scene.id;

        let borderColor = 'border-gray-600';
        if (hasVideo) borderColor = 'border-purple-500';
        else if (hasImage) borderColor = 'border-emerald-500';

        return (
          <React.Fragment key={scene.id}>
            <div
              data-scene-block
              className={`absolute top-1 bottom-1 rounded-md cursor-pointer border transition-all overflow-hidden group ${borderColor} ${isSelected ? 'ring-2 ring-blue-400 z-10 border-blue-400' : ''} ${isResizing ? 'z-20 ring-2 ring-yellow-400' : ''}`}
              style={{ left, width: Math.max(width, 24) }}
              onClick={() => onSelectScene(scene.id)}
            >
              {/* Full-bleed media background */}
              {mediaSrc ? (
                <img
                  src={mediaSrc}
                  className="absolute inset-0 w-full h-full object-cover"
                  alt=""
                  draggable={false}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-800" />
              )}

              {/* Gradient overlay for text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

              {/* Scene info overlay */}
              <div className="absolute bottom-0 left-0 right-0 px-1.5 pb-1 pt-3">
                <p className="text-[10px] font-bold text-white drop-shadow-lg truncate">S{scene.scene_number}</p>
                <p className="text-[9px] text-gray-300 drop-shadow">{scene.duration_seconds}s</p>
              </div>

              {/* Media type indicator dot */}
              <div className="absolute top-1 left-1">
                <div className={`w-1.5 h-1.5 rounded-full ${hasVideo ? 'bg-purple-400' : hasImage ? 'bg-emerald-400' : 'bg-gray-500'}`} />
              </div>

              {/* Resize handle — visible grip on right edge */}
              <div
                className={`absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center transition-colors ${isResizing ? 'bg-yellow-400/40' : 'bg-black/0 hover:bg-white/30 group-hover:bg-white/10'}`}
                onMouseDown={(e) => handleResizeStart(e, scene)}
              >
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-0.5 h-2 bg-white/70 rounded-full" />
                  <div className="w-0.5 h-2 bg-white/70 rounded-full" />
                </div>
              </div>
            </div>
            {/* Transition indicator */}
            {transition && transition !== 'cut' && idx < scenes.length - 1 && (
              <div
                className="absolute top-0 flex items-center justify-center z-5"
                style={{ left: left + width - 4, width: 8 }}
              >
                <div className="w-2 h-2 rounded-full bg-purple-500 border border-white shadow" title={`${transition} ${scene.transition_duration || 0.5}s`} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}