import React, { useState, useRef } from 'react';

export default function TimelineTrack({ scenes, pixelsPerSecond, selectedScene, onSelectScene, onUpdateDuration }) {
  const [resizing, setResizing] = useState(null);
  const startXRef = useRef(0);
  const startDurRef = useRef(0);

  const handleResizeStart = (e, scene) => {
    e.stopPropagation();
    setResizing(scene.id);
    startXRef.current = e.clientX;
    startDurRef.current = scene.duration_seconds;

    const handleMove = (ev) => {
      const dx = ev.clientX - startXRef.current;
      const dSec = dx / pixelsPerSecond;
      const newDur = Math.max(2, Math.round(startDurRef.current + dSec));
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
    <div className="flex-1 h-20 relative bg-gray-50">
      {scenes.map(scene => {
        const width = scene.duration_seconds * pixelsPerSecond;
        const left = scene.start_time * pixelsPerSecond;
        const isSelected = selectedScene === scene.id;
        const hasImage = !!scene.image_url;
        const hasVideo = !!scene.video_url;

        let bgClass = 'bg-gray-200 border-gray-300';
        if (hasVideo) bgClass = 'bg-purple-200 border-purple-400';
        else if (hasImage) bgClass = 'bg-green-200 border-green-400';

        return (
          <div
            key={scene.id}
            className={`absolute top-2 bottom-2 rounded cursor-pointer border-2 transition-all overflow-hidden flex items-center ${bgClass} ${isSelected ? 'ring-2 ring-blue-500 z-10' : ''}`}
            style={{ left, width: Math.max(width, 20) }}
            onClick={() => onSelectScene(scene.id)}
          >
            {/* Thumbnail */}
            {scene.image_url && (
              <img src={scene.image_url} className="h-full w-12 object-cover flex-shrink-0" alt="" />
            )}
            <div className="flex-1 min-w-0 px-1">
              <p className="text-[10px] font-medium truncate">S{scene.scene_number}</p>
              <p className="text-[9px] text-gray-600">{scene.duration_seconds}s</p>
            </div>
            {/* Resize handle */}
            <div
              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/10"
              onMouseDown={(e) => handleResizeStart(e, scene)}
            />
          </div>
        );
      })}
    </div>
  );
}