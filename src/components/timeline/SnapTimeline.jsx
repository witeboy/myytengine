/**
 * Phase 3 + Phase 4: Enhanced Timeline Track with Magnetic Snapping,
 * Virtual Scrolling, Multi-track Layering, and Snap Guides
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Image, Mic, Type, Film, Camera, Blend, Clapperboard, Smile, Sticker, Music } from 'lucide-react';
import { findSnapPoint } from '@/hooks/useSnapEngine';

const TRACK_HEIGHT = 56;
const LABEL_WIDTH = 40;

export default function SnapTimelineTrack({
  type, clips, allClips, pps, totalDuration, currentTime,
  selectedId, onSelect, onUpdate, editable = true,
  snappingEnabled = true, onSnapLine
}) {
  const colors = { video: '#059669', audio: '#4f46e5', caption: '#d97706', overlay: '#db2777', music: '#7c3aed' };
  const icons = { video: Image, audio: Mic, caption: Type, overlay: Smile, music: Music };
  const Icon = icons[type];
  const color = colors[type];
  const [drag, setDrag] = useState(null);
  const trackRef = useRef(null);

  // Virtual scrolling: only render clips in viewport
  const [viewportLeft, setViewportLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(2000);

  useEffect(() => {
    const container = trackRef.current?.parentElement;
    if (!container) return;
    const handleScroll = () => {
      setViewportLeft(container.scrollLeft);
      setViewportWidth(container.clientWidth);
    };
    handleScroll();
    container.addEventListener('scroll', handleScroll);
    const ro = new ResizeObserver(handleScroll);
    ro.observe(container);
    return () => { container.removeEventListener('scroll', handleScroll); ro.disconnect(); };
  }, []);

  const visibleClips = useMemo(() => {
    const margin = 200; // px buffer
    return clips.filter(clip => {
      const left = clip.startTime * pps;
      const right = left + Math.max(30, clip.duration * pps);
      return right >= viewportLeft - margin && left <= viewportLeft + viewportWidth + margin;
    });
  }, [clips, pps, viewportLeft, viewportWidth]);

  // Drag logic with magnetic snapping
  useEffect(() => {
    if (!drag || !editable) return;
    const move = e => {
      const rawDelta = (e.clientX - drag.sx) / pps;
      const clip = clips.find(c => c.id === drag.id);
      if (!clip) return;

      if (drag.action === 'move') {
        let newStart = Math.max(0, drag.is + rawDelta);
        const widthPx = clip.duration * pps;
        const playheadPx = currentTime * pps;

        if (snappingEnabled) {
          const { snappedPx, snapLinePx } = findSnapPoint(
            newStart * pps, widthPx, allClips || clips, drag.id, playheadPx, pps
          );
          newStart = snappedPx / pps;
          onSnapLine?.(snapLinePx);
        } else {
          onSnapLine?.(null);
        }
        onUpdate({ ...clip, startTime: newStart });
      } else if (drag.action === 'resize-right') {
        const newDur = Math.max(0.3, drag.id2 + rawDelta);
        onUpdate({ ...clip, duration: newDur });
      } else if (drag.action === 'resize-left') {
        const newStart = Math.max(0, drag.is + rawDelta);
        const delta = newStart - drag.is;
        onUpdate({ ...clip, startTime: newStart, duration: Math.max(0.3, drag.id2 - delta) });
      }
    };
    const up = () => {
      setDrag(null);
      onSnapLine?.(null);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [drag, clips, allClips, pps, onUpdate, editable, snappingEnabled, currentTime, onSnapLine]);

  const down = (e, clip, action) => {
    if (!editable) return;
    e.stopPropagation();
    onSelect(clip.id);
    setDrag({ id: clip.id, action, sx: e.clientX, is: clip.startTime, id2: clip.duration });
  };

  return (
    <div className="flex border-b border-gray-800">
      <div className="flex-shrink-0 bg-[#12121f] flex items-center justify-center gap-1" style={{ width: LABEL_WIDTH, height: TRACK_HEIGHT }}>
        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
        <Icon size={10} className="text-gray-400" />
      </div>
      <div ref={trackRef} className="relative bg-[#0a0a14]" style={{ height: TRACK_HEIGHT, width: Math.max(totalDuration * pps, 800) }}>
        {visibleClips.map(clip => {
          const left = clip.startTime * pps;
          const width = Math.max(30, clip.duration * pps);
          const sel = selectedId === clip.id;
          const hasMotion = type === 'video' && clip.cinematicMotion;
          const hasTransition = type === 'video' && clip.transition;
          const isVideoClip = type === 'video' && clip.mediaType === 'video' && clip.videoUrl;
          const isBrollClip = type === 'video' && clip.mediaType === 'broll' && clip.brollUrl;
          let bgColor = isBrollClip ? '#0d9488' : isVideoClip ? '#7c3aed' : color;
          if (hasMotion) bgColor = '#b45309';
          if (hasTransition && !hasMotion) bgColor = '#6d28d9';
          if (hasMotion && hasTransition) bgColor = '#be185d';

          return (
            <div key={clip.id}
              className={`absolute top-1 bottom-1 rounded overflow-hidden ${editable ? 'cursor-pointer' : 'cursor-default'} ${sel ? 'ring-2 ring-white z-10' : ''}`}
              style={{ left, width, backgroundColor: bgColor }}>
              {type === 'video' && clip.thumbnail && (
                <img src={clip.thumbnail} className="absolute inset-0 w-full h-full object-cover opacity-70" alt="" />
              )}
              {type === 'overlay' && clip.content && (
                <div className="absolute inset-0 flex items-center justify-center text-lg opacity-80">{clip.content}</div>
              )}
              {editable && (type === 'caption' || type === 'music') && (
                <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 z-10" onMouseDown={e => down(e, clip, 'resize-left')} />
              )}
              <div className="absolute inset-0 flex items-center px-2"
                style={{ left: type === 'caption' ? 8 : 0, right: editable ? 8 : 0 }}
                onMouseDown={e => down(e, clip, 'move')}>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-white font-medium truncate drop-shadow flex items-center gap-1">
                    {clip.label}
                    {isBrollClip && <Clapperboard size={8} className="text-teal-200" />}
                    {isVideoClip && <Film size={8} className="text-purple-200" />}
                    {hasMotion && <Camera size={8} className="text-amber-200" />}
                    {hasTransition && <Blend size={8} className="text-purple-200" />}
                  </p>
                  <p className="text-[8px] text-white/70">{clip.duration.toFixed(1)}s</p>
                </div>
              </div>
              {editable && (
                <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 z-10" onMouseDown={e => down(e, clip, 'resize-right')} />
              )}
            </div>
          );
        })}
        {/* Playhead */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20" style={{ left: currentTime * pps }} />
      </div>
    </div>
  );
}