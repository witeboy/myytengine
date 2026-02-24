import React, { useRef, useEffect, useState } from 'react';
import { Monitor, Film, Maximize2, Minimize2 } from 'lucide-react';

export default function PreviewPanel({ currentScene, currentTime, isPlaying, totalScenes, totalDuration, orientation }) {
  const videoRef = useRef(null);
  const [videoError, setVideoError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  const timeInScene = currentTime - (currentScene?.start_time || 0);
  const sceneDuration = currentScene?.duration_seconds || 8;
  const progress = Math.min(1, Math.max(0, timeInScene / sceneDuration));

  const hasVideo = currentScene?.video_url?.startsWith('http');
  const hasImage = currentScene?.image_url?.startsWith('http');

  useEffect(() => {
    if (!videoRef.current || !hasVideo) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, hasVideo, currentScene?.id]);

  useEffect(() => {
    setVideoError(false);
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, [currentScene?.id]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const isPortrait = orientation === 'portrait';

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-[#0d0d1a] items-center justify-center p-3 relative">
      {/* Preview container */}
      <div className={`relative bg-black rounded-lg overflow-hidden shadow-2xl border border-gray-800/50 flex items-center justify-center ${
        isPortrait ? 'max-h-full w-auto' : 'max-w-full h-auto'
      }`} style={isPortrait ? { aspectRatio: '9/16', maxHeight: 'calc(100% - 40px)' } : { aspectRatio: '16/9', maxWidth: '100%', maxHeight: 'calc(100% - 40px)' }}>
        {!currentScene ? (
          <div className="text-center text-gray-600 p-8">
            <Monitor className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Press play to preview</p>
          </div>
        ) : hasVideo && !videoError ? (
          <video
            ref={videoRef}
            src={currentScene.video_url}
            className="w-full h-full object-contain"
            muted loop playsInline
            onError={() => setVideoError(true)}
          />
        ) : hasImage ? (
          <img
            src={currentScene.image_url}
            alt={`Scene ${currentScene.scene_number}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-center text-gray-600 p-8">
            <Film className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No media for Scene {currentScene.scene_number}</p>
          </div>
        )}

        {/* Scene progress bar */}
        {currentScene && (
          <div className="absolute bottom-0 left-0 right-0">
            <div className="h-0.5 bg-gray-800">
              <div className="h-full bg-blue-500 transition-all duration-100" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        )}

        {/* Overlays */}
        {currentScene && (
          <>
            <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full">
              S{currentScene.scene_number}/{totalScenes}
            </div>
            <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
              {formatTime(currentTime)}
            </div>
          </>
        )}

        {/* Fullscreen toggle */}
        <button onClick={toggleFullscreen} className="absolute bottom-2 right-2 bg-black/50 hover:bg-black/80 text-white p-1 rounded transition-colors">
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Narration subtitle */}
      {currentScene?.narration_text && (
        <div className="mt-2 px-4 max-w-full">
          <p className="text-gray-400 text-[10px] text-center leading-relaxed line-clamp-2 bg-black/40 rounded px-3 py-1">
            {currentScene.narration_text}
          </p>
        </div>
      )}
    </div>
  );
}