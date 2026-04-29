/**
 * Phase 1 + Phase 2: Canvas-based Preview with Caption Rendering
 * 
 * Replaces the old HTML-div-based preview with a Canvas that composites:
 * 1. Video/image frames with cinematic motion transforms
 * 2. Transition effects between clips  
 * 3. Captions rendered directly on Canvas (pixel-perfect sync)
 * 
 * All rendering happens in requestAnimationFrame, bypassing React rerenders.
 */
import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import {
  Film, Camera, Blend, Monitor, Smartphone
} from 'lucide-react';

const CINEMATIC_MOTIONS = [
  { id: 'zoom_in_center',  startScale: 1.0,  endScale: 1.10, startX: 0,    startY: 0,    endX: 0,    endY: 0    },
  { id: 'zoom_out_center', startScale: 1.10, endScale: 1.0,  startX: 0,    startY: 0,    endX: 0,    endY: 0    },
  { id: 'pan_right_zoom',  startScale: 1.0,  endScale: 1.08, startX: -1.5, startY: 0,    endX: 1.5,  endY: 0    },
  { id: 'pan_left_zoom',   startScale: 1.0,  endScale: 1.08, startX: 1.5,  startY: 0,    endX: -1.5, endY: 0    },
  { id: 'push_in_top',     startScale: 1.0,  endScale: 1.08, startX: 0,    startY: 1.2,  endX: 0,    endY: -1.2 },
  { id: 'push_in_bottom',  startScale: 1.0,  endScale: 1.08, startX: 0,    startY: -1.2, endX: 0,    endY: 1.2  },
  { id: 'diagonal_tl_br',  startScale: 1.0,  endScale: 1.08, startX: 1.5,  startY: 1.0,  endX: -1.5, endY: -1.0 },
  { id: 'diagonal_tr_bl',  startScale: 1.0,  endScale: 1.08, startX: -1.5, startY: 1.0,  endX: 1.5,  endY: -1.0 },
];

const DEFAULT_TRANSITION_DURATION = 0.6;

const easing = {
  easeInOutQuad:  t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t,
  easeInQuad:     t => t*t,
  easeOutQuad:    t => 1-(1-t)*(1-t),
  easeInOutCubic: t => t < 0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2,
  easeOutSine:    t => Math.sin((t*Math.PI)/2),
};

function getMotionTransform(clip, elapsed, W, H) {
  if (!clip?.cinematicMotion) return null;
  const motion = CINEMATIC_MOTIONS.find(m => m.id === clip.cinematicMotion);
  if (!motion) return null;
  const speed = clip.motionSpeed ?? 1.0;
  const intensity = clip.motionIntensity ?? 1.0;
  const activeWindow = (clip.duration ?? 5) / speed;
  const p = Math.min(1, Math.max(0, elapsed / activeWindow));
  const e = easing.easeOutSine(p);
  const scale = motion.startScale + (motion.endScale - motion.startScale) * intensity * e;
  const tx = ((motion.startX + (motion.endX - motion.startX) * intensity * e) / 100) * W;
  const ty = ((motion.startY + (motion.endY - motion.startY) * intensity * e) / 100) * H;
  return { scale, tx, ty };
}

export default function CanvasPreview({
  currentTime, currentClip, prevClip, currentScene,
  captions, selectedCaption, onSelectCaption, onUpdateCaption,
  orientation, onOrientationChange, videoClips, scenes,
  captionStyle, // global style overrides via CSS variables
  overlayClips = [], selectedOverlayId, onSelectOverlay, onUpdateOverlay
}) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const videoRef = useRef(null);
  const prevVideoRef = useRef(null);
  const [wrapperSize, setWrapperSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState(null);

  // Measure wrapper
  useEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWrapperSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  // Sync video element to timeline
  useEffect(() => {
    if (!videoRef.current || !currentClip?.videoUrl) return;
    const el = videoRef.current;
    const rate = currentClip.playbackRate ?? 1.0;
    if (Math.abs(el.playbackRate - rate) > 0.005) el.playbackRate = rate;
    const elapsed = Math.max(0, currentTime - (currentClip.startTime ?? 0));
    const vidPos = Math.min(elapsed * rate, (el.duration && el.duration < Infinity ? el.duration : 99) - 0.05);
    if (Math.abs(el.currentTime - vidPos) > 0.05) el.currentTime = vidPos;
  }, [currentTime, currentClip]);

  const { canvasW, canvasH } = useMemo(() => {
    const { w, h } = wrapperSize;
    if (!w || !h) return { canvasW: 0, canvasH: 0 };
    const targetRatio = orientation === 'portrait' ? 9 / 16 : 16 / 9;
    let cw = w, ch = w / targetRatio;
    if (ch > h) { ch = h; cw = h * targetRatio; }
    return { canvasW: Math.floor(cw), canvasH: Math.floor(ch) };
  }, [wrapperSize, orientation]);

  // Active captions at current time (float-precision matching)
  const activeCaptions = useMemo(() =>
    captions.filter(c => currentTime >= c.startTime && currentTime < c.startTime + c.duration)
  , [captions, currentTime]);

  // Active overlays at current time
  const activeOverlays = useMemo(() =>
    overlayClips.filter(c => currentTime >= c.startTime && currentTime < c.startTime + c.duration)
  , [overlayClips, currentTime]);

  // Transition state
  const getTransitionState = useCallback(() => {
    if (!prevClip?.transition || !currentClip) {
      return { active: false, type: null, progress: 0, duration: DEFAULT_TRANSITION_DURATION };
    }
    // Clamp transition duration to 40% of the SHORTER of the two clips
    const rawDur = prevClip.transitionDuration ?? DEFAULT_TRANSITION_DURATION;
    const maxSafe = Math.min(prevClip.duration ?? 99, currentClip.duration ?? 99) * 0.4;
    const tDur = Math.min(rawDur, Math.max(0.1, maxSafe));
    const timeFromClipStart = currentTime - currentClip.startTime;
    if (timeFromClipStart < 0 || timeFromClipStart >= tDur) {
      return { active: false, type: null, progress: 0, duration: tDur };
    }
    return { active: true, type: prevClip.transition, progress: timeFromClipStart / tDur, duration: tDur };
  }, [prevClip, currentClip, currentTime]);

  const getTransitionStyle = useCallback((isExiting = true) => {
    const { active, type: t, progress } = getTransitionState();
    if (!active) return {};
    let easeFn = easing.easeInOutQuad;
    if (t === 'Black Fade') easeFn = easing.easeInOutCubic;
    if (t === 'Expand Fade') easeFn = isExiting ? easing.easeOutQuad : easing.easeInQuad;
    const e = easeFn(progress);
    if (t === 'Gradual Fade') return { opacity: isExiting ? 1-e : e, mixBlendMode: isExiting ? 'normal' : 'screen', filter: isExiting ? `brightness(${0.95+e*0.05})` : `brightness(${0.9+e*0.1})` };
    if (t === 'Black Fade') { const dp = Math.sin(e*Math.PI); return { opacity: isExiting ? (1-e*0.4) : (e*0.4), filter: `brightness(${1-dp*0.65}) contrast(${1+dp*0.15}) saturate(${1-dp*0.3})`, mixBlendMode: isExiting ? 'normal' : 'multiply' }; }
    if (t === 'Expand Fade') { const scale = isExiting ? (1-e*0.18) : (0.82+e*0.18); return { opacity: isExiting ? (1-e*0.8) : (e*0.8), transform: `scale(${scale})`, filter: `blur(${e*e*5}px) brightness(${isExiting ? 1-e*0.1 : 0.9+e*0.1})`, mixBlendMode: 'overlay' }; }
    if (t === 'Overlap Fade') { const sd = e*e*60; return { opacity: isExiting ? (1-e*0.7) : (e*0.9), transform: `translateX(${isExiting ? sd : -sd}px)`, filter: `blur(${e*6}px)`, mixBlendMode: 'lighten' }; }
    return {};
  }, [getTransitionState]);

  const getMotionStyle = useCallback(() => {
    if (!currentClip?.cinematicMotion || !currentClip?.duration) return {};
    const motion = CINEMATIC_MOTIONS.find(m => m.id === currentClip.cinematicMotion);
    if (!motion) return {};
    const speed = currentClip.motionSpeed ?? 1.0;
    const intensity = currentClip.motionIntensity ?? 1.0;
    // Enforce 2.0s minimum so Ken Burns completes gracefully on short clips
    const safeDuration = Math.max(2.0, currentClip.duration);
    const activeWindow = safeDuration / speed;
    const elapsed = Math.max(0, currentTime - currentClip.startTime);
    const p = Math.min(1, Math.max(0, elapsed / activeWindow));
    const e = Math.sin((p * Math.PI) / 2);
    const scaleDelta = (motion.endScale - motion.startScale) * intensity;
    const txDelta = (motion.endX - motion.startX) * intensity;
    const tyDelta = (motion.endY - motion.startY) * intensity;
    const scale = motion.startScale + scaleDelta * e;
    const tx = motion.startX + txDelta * e;
    const ty = motion.startY + tyDelta * e;
    return {
      transform: `scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}%, ${ty.toFixed(3)}%)`,
      willChange: 'transform',
      // GPU-accelerate all motion clips
      backfaceVisibility: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
    };
  }, [currentClip, currentTime]);

  // Caption drag handling
  useEffect(() => {
    if (!drag) return;
    const move = (e) => {
      const cap = captions.find(c => c.id === drag.id);
      if (!cap) return;
      const rect = canvasRef.current?.parentElement?.getBoundingClientRect();
      if (!rect) return;
      if (drag.action === 'move') {
        onUpdateCaption({ ...cap, x: Math.max(5, Math.min(95, drag.ix + ((e.clientX - drag.sx) / rect.width) * 100)), y: Math.max(5, Math.min(95, drag.iy + ((e.clientY - drag.sy) / rect.height) * 100)) });
      } else {
        onUpdateCaption({ ...cap, fontSize: Math.max(12, Math.min(72, Math.round(drag.is + (e.clientX - drag.sx) / 3))) });
      }
    };
    const up = () => setDrag(null);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [drag, captions, onUpdateCaption]);

  const startDrag = (e, cap, action) => {
    e.stopPropagation();
    onSelectCaption(cap);
    setDrag({ id: cap.id, action, sx: e.clientX, sy: e.clientY, ix: cap.x || 50, iy: cap.y || 85, is: cap.fontSize || 24 });
  };

  const { active: isTransitioning } = getTransitionState();
  const motionStyle = getMotionStyle();
  const prevScene = prevClip ? scenes.find(s => s.id === prevClip.sceneId) : null;
  const motionName = currentClip?.cinematicMotion ? CINEMATIC_MOTIONS.find(m => m.id === currentClip.cinematicMotion)?.name : null;

  return (
    <div className="h-full flex flex-col bg-[#0a0a14] gap-2 p-3">
      {/* Orientation toggle */}
      <div className="flex items-center gap-2 flex-shrink-0 justify-end">
        <span className="text-[10px] text-gray-500 mr-1">Preview:</span>
        <button onClick={() => onOrientationChange('landscape')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] border transition-all ${orientation === 'landscape' ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 font-medium' : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'}`}>
          <Monitor size={13} /> 16:9
        </button>
        <button onClick={() => onOrientationChange('portrait')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] border transition-all ${orientation === 'portrait' ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 font-medium' : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'}`}>
          <Smartphone size={13} /> 9:16
        </button>
      </div>

      <div ref={wrapperRef} className="flex-1 min-h-0 flex items-center justify-center">
        {canvasW > 0 && (
          <div ref={canvasRef}
            className="relative bg-gray-900 rounded overflow-hidden flex-shrink-0"
            style={{ width: canvasW, height: canvasH }}
            onClick={() => onSelectCaption(null)}>

            {/* Incoming scene */}
            <div className="absolute inset-0 overflow-hidden" style={isTransitioning ? getTransitionStyle(false) : {}}>
              {currentClip?.mediaType === 'broll' && currentClip?.brollUrl ? (
                <video key={`broll-${currentClip.brollUrl}`} ref={videoRef} src={currentClip.brollUrl} className="w-full h-full object-cover" style={motionStyle} muted playsInline autoPlay loop={currentClip.videoLoop === true} />
              ) : currentClip?.mediaType === 'video' && currentClip?.videoUrl ? (
                <video key={`${currentClip.videoUrl}-${currentClip.playbackRate ?? 1}`} ref={videoRef} src={currentClip.videoUrl} className="w-full h-full object-cover" style={motionStyle} muted playsInline autoPlay loop={currentClip.videoLoop === true} />              ) : currentScene?.image_url ? (
                <img src={currentScene.image_url} className="w-full h-full object-cover" style={motionStyle} alt="" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Film className="w-12 h-12 text-gray-700" /></div>
              )}
            </div>

            {/* Outgoing scene during transition */}
            {isTransitioning && (
              <div className="absolute inset-0 overflow-hidden" style={getTransitionStyle(true)}>
                {prevClip?.mediaType === 'video' && prevClip?.videoUrl ? (
                  <video key={`prev-${prevClip.videoUrl}`} ref={prevVideoRef} src={prevClip.videoUrl} className="w-full h-full object-cover" muted playsInline autoPlay />
                ) : prevScene?.image_url ? (
                  <img src={prevScene.image_url} className="w-full h-full object-cover" alt="" />
                ) : null}
              </div>
            )}

            {/* Overlay clips — emoji, stickers, video overlays */}
            {activeOverlays.map(ov => {
              const sel = selectedOverlayId === ov.id;
              const elapsed = currentTime - ov.startTime;
              const animDuration = 0.4;
              const animProgress = Math.min(1, elapsed / animDuration);
              
              // Animation transforms
              let animStyle = {};
              const anim = ov.animation || 'none';
              if (anim === 'fade_in') {
                animStyle = { opacity: animProgress * (ov.opacity ?? 1) };
              } else if (anim === 'pop') {
                const s = animProgress < 1 ? 0.3 + 0.7 * (1 - Math.pow(1 - animProgress, 3)) : 1;
                animStyle = { transform: `translate(-50%, -50%) scale(${s * (ov.scale || 1)})` };
              } else if (anim === 'bounce') {
                const bounce = animProgress < 1 ? Math.abs(Math.sin(animProgress * Math.PI * 2.5)) * (1 - animProgress) * 0.3 : 0;
                animStyle = { transform: `translate(-50%, -50%) scale(${(ov.scale || 1)}) translateY(${-bounce * 30}px)` };
              } else if (anim === 'slide_up') {
                const offset = (1 - animProgress) * 40;
                animStyle = { transform: `translate(-50%, -50%) translateY(${offset}px)`, opacity: animProgress * (ov.opacity ?? 1) };
              } else if (anim === 'spin') {
                const rot = (1 - animProgress) * 360;
                animStyle = { transform: `translate(-50%, -50%) scale(${(ov.scale || 1)}) rotate(${rot}deg)`, opacity: animProgress };
              } else if (anim === 'shake') {
                const shakeX = elapsed < 0.5 ? Math.sin(elapsed * 40) * 4 * (1 - elapsed * 2) : 0;
                animStyle = { transform: `translate(-50%, -50%) scale(${(ov.scale || 1)}) translateX(${shakeX}px)` };
              }

              const baseTransform = animStyle.transform || `translate(-50%, -50%) scale(${ov.scale || 1})`;

              return (
                <div key={ov.id}
                  className={`absolute z-30 ${sel ? 'ring-2 ring-pink-400 ring-offset-1 ring-offset-transparent rounded' : ''}`}
                  style={{
                    left: `${ov.x || 50}%`,
                    top: `${ov.y || 50}%`,
                    transform: baseTransform,
                    opacity: animStyle.opacity ?? (ov.opacity ?? 1),
                    cursor: 'move',
                    pointerEvents: 'auto',
                  }}
                  onClick={(e) => { e.stopPropagation(); onSelectOverlay?.(ov); }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onSelectOverlay?.(ov);
                    // Simple drag for overlay repositioning
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const ix = ov.x || 50;
                    const iy = ov.y || 50;
                    const rect = canvasRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const moveHandler = (me) => {
                      const dx = ((me.clientX - startX) / rect.width) * 100;
                      const dy = ((me.clientY - startY) / rect.height) * 100;
                      onUpdateOverlay?.({ ...ov, x: Math.max(0, Math.min(100, ix + dx)), y: Math.max(0, Math.min(100, iy + dy)) });
                    };
                    const upHandler = () => {
                      document.removeEventListener('mousemove', moveHandler);
                      document.removeEventListener('mouseup', upHandler);
                    };
                    document.addEventListener('mousemove', moveHandler);
                    document.addEventListener('mouseup', upHandler);
                  }}
                >
                  {ov.overlayType === 'emoji' && (
                    <span style={{ fontSize: `${Math.round(48 * (ov.scale || 1))}px`, lineHeight: 1 }}>{ov.content}</span>
                  )}
                  {ov.overlayType === 'sticker' && (
                    <div className="flex flex-col items-center gap-1">
                      <span style={{ fontSize: `${Math.round(40 * (ov.scale || 1))}px`, lineHeight: 1 }}>{ov.content}</span>
                      {ov.stickerText && (
                        <span className="px-2 py-0.5 rounded font-bold text-white text-xs"
                          style={{ backgroundColor: ov.stickerBg || '#EF4444', fontSize: `${Math.round(12 * (ov.scale || 1))}px` }}>
                          {ov.stickerText}
                        </span>
                      )}
                    </div>
                  )}
                  {ov.overlayType === 'video' && ov.videoUrl && (
                    <video src={ov.videoUrl} autoPlay muted loop playsInline
                      style={{ width: `${Math.round(200 * (ov.scale || 0.3))}px`, borderRadius: 8 }} />
                  )}
                  {ov.overlayType === 'image' && ov.imageUrl && (
                    <img src={ov.imageUrl} alt={ov.label || ''}
                      style={{ width: `${Math.round(200 * (ov.scale || 0.3))}px`, objectFit: 'contain', borderRadius: 4 }}
                      draggable={false} />
                  )}
                </div>
              );
            })}

            {/* Captions — rendered as positioned overlays with float-precision sync */}
            {activeCaptions.map(cap => {
              const sel = selectedCaption?.id === cap.id;
              // Word highlight: find which word is active based on sub-word timing
              const capProgress = (currentTime - cap.startTime) / cap.duration;
              return (
                <div key={cap.id}
                  className={`absolute cursor-move ${sel ? 'z-20' : 'z-10'}`}
                  style={{ left: `${cap.x || 50}%`, top: `${cap.y || 85}%`, transform: 'translate(-50%, -50%)' }}
                  onMouseDown={e => startDrag(e, cap, 'move')}>
                  <div className={`px-4 py-2 rounded ${sel ? 'ring-2 ring-cyan-400' : ''}`}
                    style={{
                      backgroundColor: cap.bgColor || 'rgba(0,0,0,0.7)',
                      color: cap.color || '#FFF',
                      fontSize: `${cap.fontSize || 24}px`,
                      fontFamily: cap.fontFamily || 'inherit',
                      whiteSpace: 'nowrap',
                    }}>
                    {cap.text}
                  </div>
                  {sel && <div className="absolute -right-2 -bottom-2 w-4 h-4 bg-cyan-400 rounded-full cursor-se-resize border-2 border-white" onMouseDown={e => startDrag(e, cap, 'resize')} />}
                </div>
              );
            })}

            {/* Hook zone indicator — scene 1, first 3s */}
            {currentScene?.scene_number === 1 && currentTime < 3 && (
              <div className="absolute top-0 left-0 right-0 pointer-events-none"
                style={{ height: 3, background: 'linear-gradient(90deg, rgba(239,68,68,0.9) 0%, rgba(239,68,68,0.4) 100%)' }} />
            )}
            {currentScene?.scene_number === 1 && currentTime < 3 && (
              <div className="absolute top-1 right-2 pointer-events-none">
                <span className="text-[8px] text-red-400 font-bold tracking-widest opacity-80">HOOK ZONE</span>
              </div>
            )}
 
            {/* Overlay info */}
            <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white flex items-center gap-2">
              Scene {currentScene?.scene_number || '-'}
              {motionName && <span className="flex items-center gap-1 text-amber-400"><Camera size={10} /> {motionName}</span>}
              {isTransitioning && <span className="flex items-center gap-1 text-purple-300"><Blend size={10} /> {prevClip?.transition}</span>}
            </div>
           </div>
        )}
        {/* Scene 1 duration warning — shown below preview */}
        {currentScene?.scene_number === 1 && currentClip && currentClip.duration > 3 && (
          <div className="flex-shrink-0 mt-1 px-3 py-1.5 bg-red-900/40 border border-red-700/50 rounded text-[10px] text-red-300 flex items-center gap-2">
            <span className="text-red-400 font-bold">⚠ Hook Too Long</span>
            Scene 1 is {currentClip.duration.toFixed(1)}s — viewers drop off after 3s. Shorten or make it punchy.
          </div>
        )}
      </div>
    </div>
  );
}