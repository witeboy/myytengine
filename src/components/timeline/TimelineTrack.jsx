import React, { useState, useRef } from 'react';
import { Loader2, Zap, Trash2 } from 'lucide-react';

export default function TimelineTrack({ scenes, pixelsPerSecond, selectedScene, onSelectScene, onUpdateDuration, onTransitionClick, onDeleteMedia }) {
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
    fade_from_black: '🌅',
    fade_to_black: '🌑',
    dissolve: '💫',
    fade: '💫',
    zoom: '🔍',
    wipe: '➡️',
    slide: '📱',
    cut: '',
  };

  const TRANSITION_COLORS = {
    fade_from_black: 'bg-amber-600 border-amber-300',
    fade_to_black: 'bg-indigo-600 border-indigo-300',
    dissolve: 'bg-blue-600 border-blue-300',
    cut: 'bg-gray-700/80 border-gray-500',
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
        const isResizingThis = resizing === scene.id;

        // Video hold detection: video < scene duration
        const isVideoHold = hasVideo && scene.duration_seconds > 6;
        const videoPlaySeconds = scene.video_play_seconds || Math.min(scene.duration_seconds, 6);
        const holdSeconds = isVideoHold ? Math.max(0, scene.duration_seconds - videoPlaySeconds) : 0;

        // Visual: show video portion vs hold portion inside the block
        const videoWidthPx = isVideoHold ? videoPlaySeconds * pixelsPerSecond : width;
        const holdWidthPx = isVideoHold ? holdSeconds * pixelsPerSecond : 0;

        return (
          <React.Fragment key={scene.id}>
            <div
              data-scene-block="true"
              className={`absolute top-1 bottom-1 rounded cursor-pointer transition-all overflow-hidden group ${
                isSelected ? 'ring-2 ring-white z-10' : ''
              } ${isResizingThis ? 'z-20 ring-2 ring-yellow-400' : ''}`}
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

              {/* Video hold overlay — shows where video freezes to still */}
              {isVideoHold && holdWidthPx > 8 && (
                <div
                  className="absolute top-0 bottom-0 bg-amber-500/15 border-l border-dashed border-amber-400/50"
                  style={{ left: videoWidthPx, width: holdWidthPx }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[7px] text-amber-300/70 font-mono whitespace-nowrap rotate-0">
                      HOLD {holdSeconds.toFixed(1)}s
                    </span>
                  </div>
                </div>
              )}

              {/* Scene info */}
              <div className="absolute bottom-0 left-0 right-0 px-1.5 pb-0.5">
                <p className="text-[9px] font-bold text-white drop-shadow-lg truncate">S{scene.scene_number}</p>
                <p className="text-[8px] text-gray-300">{scene.duration_seconds}s</p>
              </div>

              {/* Status indicator + effects badge */}
              <div className="absolute top-0.5 left-0.5 flex items-center gap-0.5">
                {isPendingVideo ? (
                  <Loader2 className="w-2.5 h-2.5 text-amber-400 animate-spin" />
                ) : (
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    hasVideo ? 'bg-purple-400' : hasImage ? 'bg-emerald-400' : 'bg-gray-500'
                  }`} />
                )}
                {(() => {
                  let fx = [];
                  try { fx = JSON.parse(scene.visual_effects || '[]'); } catch (_) {}
                  if (fx.length === 0) return null;
                  return (
                    <span className="text-[6px] bg-amber-500/60 text-white rounded px-0.5 flex items-center gap-px">
                      <Zap className="w-2 h-2" />{fx.length}
                    </span>
                  );
                })()}
              </div>

              {/* Media type badge — top right */}
              {(hasVideo || hasImage) && (
                <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5">
                  <span className={`text-[7px] font-bold px-1 py-px rounded ${
                    hasVideo ? 'bg-purple-500/70 text-white' : 'bg-emerald-500/70 text-white'
                  }`}>
                    {hasVideo ? 'VID' : 'IMG'}
                  </span>
                  {/* +HOLD badge for video scenes exceeding 6s */}
                  {isVideoHold && (
                    <span className="text-[6px] font-bold px-1 py-px rounded bg-amber-500/80 text-white">
                      +HOLD
                    </span>
                  )}
                </div>
              )}

              {/* Delete media button — visible on hover when scene has media */}
              {(hasVideo || hasImage) && isSelected && (
                <button
                  className="absolute bottom-0.5 right-3 w-5 h-5 rounded bg-red-600/80 hover:bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteMedia?.(scene);
                  }}
                  title={`Delete ${hasVideo ? 'video' : 'image'}`}
                >
                  <Trash2 className="w-2.5 h-2.5 text-white" />
                </button>
              )}

              {/* Resize handle */}
              <div
                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-transparent hover:bg-white/20"
                onMouseDown={(e) => handleResizeStart(e, scene)}
              />
            </div>

            {/* ── Transition button between scenes ── */}
            {idx < scenes.length - 1 && (() => {
              const nextScene = scenes[idx + 1];
              const nextTransition = nextScene?.transition_type;
              const nextDuration = nextScene?.transition_duration || 0;
              const hasTransition = nextTransition && nextTransition !== 'cut';
              const colorClass = TRANSITION_COLORS[nextTransition] || TRANSITION_COLORS.cut;
              const icon = TRANSITION_ICONS[nextTransition] || '';

              return (
                <button
                  className={`absolute z-10 flex items-center justify-center transition-all hover:scale-125 ${
                    hasTransition
                      ? `w-6 h-6 ${colorClass} rounded-full border-2 shadow-lg`
                      : 'w-5 h-5 bg-gray-700/80 rounded-full border border-gray-500 hover:bg-blue-600 hover:border-blue-400 opacity-60 hover:opacity-100'
                  }`}
                  style={{
                    left: left + width - 3,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTransitionClick?.(scene, nextScene);
                  }}
                  title={hasTransition
                    ? `${nextTransition.replace(/_/g, ' ')} (${nextDuration}s)`
                    : 'Click to add transition'
                  }
                >
                  {hasTransition ? (
                    <span className="text-[9px]">{icon || '✨'}</span>
                  ) : (
                    <span className="text-[9px] text-gray-300 font-bold">+</span>
                  )}
                </button>
              );
            })()}
          </React.Fragment>
        );
      })}
    </div>
  );
}